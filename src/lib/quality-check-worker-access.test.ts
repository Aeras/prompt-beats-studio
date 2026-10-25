import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { durableQualityCheckInput } from "./quality-check-job-schema";
import * as safeDiagnostics from "./safe-diagnostics";

const workerCode = ts.transpileModule(
  readFileSync("src/lib/quality-check-jobs.server.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

const payload = {
  theme: "A song about home",
  genre: "Pop",
  mood: "Warm",
  language: "English",
  qualityCheckModel: "gemini-4-argon",
  result: { title: "Home", tags: "Warm pop", lyrics: "I am coming home", note: "Gentle vocals" },
};
const report = { passed: true, score: 9, issues: [] };
type Action = {
  id: string;
  user_id: string;
  status: string;
  input_payload: unknown;
  quality_report?: unknown;
  provider_started_at?: string;
  provider?: string;
  model?: string;
  cancel_requested_at?: string;
};

function fixture(
  options: {
    readError?: boolean;
    claimError?: boolean;
    providerError?: boolean | Error;
    cancelAfterProvider?: boolean;
  } = {},
) {
  const action: Action = {
    id: "action",
    user_id: "owner",
    status: "pending",
    input_payload: payload,
  };
  const events: string[] = [];
  const logs: unknown[] = [];
  let providerCalls = 0;
  let finalizations = 0;
  const db = {
    from: () => {
      let patch: Record<string, unknown> | undefined;
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const query = {
        select: () => query,
        update: (value: Record<string, unknown>) => {
          patch = value;
          return query;
        },
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        is: (key: string, value: unknown) => {
          filters.push((row) => (row[key] ?? null) === value);
          return query;
        },
        maybeSingle: async () => {
          if (
            (!patch && options.readError) ||
            (patch?.["status"] === "processing" && options.claimError)
          )
            return { data: null, error: { code: "42501", message: "permission denied" } };
          const row = action as unknown as Record<string, unknown>;
          if (!filters.every((matches) => matches(row))) return { data: null, error: null };
          if (patch) Object.assign(action, patch);
          return { data: { ...action }, error: null };
        },
      };
      return query;
    },
    rpc: async (name: string) => {
      expect(name).toBe("finalize_quality_check_job");
      expect(action.quality_report).toEqual(report);
      expect(action.provider_started_at).toBeTruthy();
      events.push("finalize");
      finalizations++;
      action.status = "completed";
      return { data: "consumed-id", error: null };
    },
  };
  const exports: {
    executeQualityCheckJob?: (id: string) => Promise<{ ran: boolean }>;
  } = {};
  runInNewContext(workerCode, {
    exports,
    AbortController,
    setInterval: () => 1,
    clearInterval: () => {},
    console: { error: (...args: unknown[]) => logs.push(args) },
    require: (name: string) => {
      if (name.endsWith("global-ai-usage.server"))
        return {
          AI_DISABLED_MESSAGE:
            "AI is temporarily disabled by an administrator. Please try again later.",
          AI_UNAVAILABLE_MESSAGE: "AI availability could not be verified. Please try again later.",
        };
      if (name.endsWith("safe-diagnostics")) return safeDiagnostics;
      if (name.endsWith("ai-execution.server")) return { claimRecoveredJob: async () => null };
      if (name.endsWith("client.server")) return { supabaseAdmin: db };
      if (name.endsWith("quality-check-job-schema")) return { durableQualityCheckInput };
      if (name.endsWith("quality-check-core.server"))
        return {
          runDurableQualityCheck: async (
            input: unknown,
            userId: string,
            beforeProvider: (model: { provider: string; model: string }) => Promise<void>,
          ) => {
            expect(input).toEqual(durableQualityCheckInput.parse(payload));
            expect(userId).toBe("owner");
            await beforeProvider({ provider: "gemini", model: "gemini-4-argon" });
            providerCalls++;
            events.push("provider");
            if (options.cancelAfterProvider) action.cancel_requested_at = new Date().toISOString();
            if (options.providerError)
              throw options.providerError instanceof Error
                ? options.providerError
                : new Error("connection lost after provider started");
            return { quality: report, provider: "gemini", model: "gemini-4-argon", records: [{}] };
          },
          flushDurableQualityUsage: async () => {
            events.push("usage");
          },
        };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return {
    action,
    events,
    logs,
    run: () => exports.executeQualityCheckJob!(action.id),
    providerCalls: () => providerCalls,
    finalizations: () => finalizations,
  };
}

describe("Quality Check worker access regression", () => {
  test("cancellation before the provider marker never dispatches or finalizes", async () => {
    const f = fixture();
    f.action.cancel_requested_at = new Date().toISOString();
    await f.run();
    expect(f.providerCalls()).toBe(0);
    expect(f.finalizations()).toBe(0);
  });
  test("cancellation after a provider reply never finalizes the QC result", async () => {
    // Receipt settlement at the tracked boundary is independently exercised by
    // ai-usage-recovery.test.ts; this checks the real worker's later barrier.
    const f = fixture({ cancelAfterProvider: true });
    await f.run();
    expect(f.providerCalls()).toBe(1);
    expect(f.finalizations()).toBe(0);
  });
  test("worker failure logs do not expose provider error bodies, names or causes", async () => {
    const marker = "SyntheticPrivateTokenMarker";
    const failure = Object.assign(new Error(marker), { name: marker, cause: { message: marker } });
    const f = fixture({ providerError: failure });
    await f.run();
    expect(f.logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(f.logs)).not.toContain(marker);
    expect(f.providerCalls()).toBe(1);
    expect(f.finalizations()).toBe(0);
  });
  test("read permission errors are failures, not successful no-op runner responses", async () => {
    const f = fixture({ readError: true });
    await expect(f.run()).rejects.toThrow("could not be read by the worker");
    expect(f.providerCalls()).toBe(0);
    expect(f.action.status).toBe("pending");
  });

  test("claim permission errors are failures without starting or charging a provider", async () => {
    const f = fixture({ claimError: true });
    await expect(f.run()).rejects.toThrow("could not be claimed by the worker");
    expect(f.providerCalls()).toBe(0);
    expect(f.finalizations()).toBe(0);
  });

  test("an admitted Gemini QC preserves its input and completes before recording usage", async () => {
    const f = fixture();
    expect(await f.run()).toEqual({ ran: true });
    expect(f.action.status).toBe("completed");
    expect(f.providerCalls()).toBe(1);
    expect(f.events).toEqual(["provider", "finalize", "usage"]);
    expect(await f.run()).toEqual({ ran: false });
    expect(f.providerCalls()).toBe(1);
    expect(f.finalizations()).toBe(1);
  });

  test("concurrent runner deliveries still atomically claim only one execution", async () => {
    const f = fixture();
    await Promise.all([f.run(), f.run()]);
    expect(f.providerCalls()).toBe(1);
    expect(f.finalizations()).toBe(1);
  });

  test("a stored report is finalized without repeating the provider", async () => {
    const f = fixture();
    Object.assign(f.action, {
      status: "processing",
      provider_started_at: new Date().toISOString(),
      provider: "gemini",
      model: "gemini-4-argon",
      quality_report: report,
    });
    expect(await f.run()).toEqual({ ran: true });
    expect(f.providerCalls()).toBe(0);
    expect(f.finalizations()).toBe(1);
  });

  test("ambiguous provider-started failures never launch another paid call", async () => {
    const f = fixture({ providerError: true });
    await f.run();
    expect(f.action.status).toBe("processing");
    expect(await f.run()).toEqual({ ran: false });
    expect(f.providerCalls()).toBe(1);
    expect(f.finalizations()).toBe(0);
  });

  test("failed actions remain terminal", async () => {
    const f = fixture();
    f.action.status = "failed";
    expect(await f.run()).toEqual({ ran: false });
    expect(f.providerCalls()).toBe(0);
  });

  test("forward migration grants only the server privileges used by the worker", () => {
    const files = readdirSync("supabase/migrations").filter((name) =>
      /^\d{14}_restore_quality_check_worker_access\.sql$/.test(name),
    );
    expect(files).toHaveLength(1);
    const sql = readFileSync(`supabase/migrations/${files[0]}`, "utf8").replace(/--[^\n]*/g, "");
    expect(sql.trim().replace(/\s+/g, " ")).toBe(
      "BEGIN; GRANT SELECT, UPDATE ON TABLE public.ai_quality_check_actions TO service_role; COMMIT;",
    );
  });
});
