import { expect, test } from "bun:test";
import {
  executeMusicInspirationJob,
  type InspirationJobDependencies,
} from "./music-inspiration-jobs.server";
import { requestInspirationPlan, INSPIRATION_PLANNER } from "./music-inspiration-planner.server";
import { INSPIRATION_RESEARCH_TOPICS } from "./music-inspiration-planner.shared";
import { decodeInspirationDiagnostic } from "./music-inspiration-diagnostics.shared";
import type { ModelResult } from "./ai-provider.server";
import type { InspirationResearch } from "./music-inspiration.shared";

function fixture(extended = false) {
  const job: any = {
    id: "c0140000-0000-4000-8000-000000000001",
    user_id: "c0140000-0000-4000-8000-000000000002",
    execution_id: "c0140000-0000-4000-8000-000000000003",
    planner_execution_id: "c0140000-0000-4000-8000-000000000004",
    research_version: 2,
    planner_model: INSPIRATION_PLANNER.model,
    planner_provider: INSPIRATION_PLANNER.provider,
    request: {
      kind: "description",
      description: "Scorpions / Metallica rock ballad with fingerstyle, ελληνικά και русский",
      depth: extended ? "extended" : "standard",
    },
    model: "creator-selected",
    provider: "openai",
    status: "queued",
    created_at: new Date().toISOString(),
  };
  const plan: any = {
    version: 1,
    request: job.request,
    entities: [
      { name: "Scorpions", kind: "band", role: "reference", aliases: [] },
      { name: "Metallica", kind: "band", role: "reference", aliases: [] },
      { name: "fingerstyle", kind: "technique", role: "intent", aliases: [] },
    ],
    sourceLanguages: [
      { code: "en", reason: "Named reference bands' creator interviews" },
      { code: "el", reason: "Explicit intended original language" },
    ],
    queries: Array.from({ length: extended ? 5 : 2 }, (_, i) => ({
      text:
        i === 0
          ? "Scorpions Metallica official credits guitar arrangement interview"
          : i === 1
            ? "κιθάρα fingerstyle ρυθμός αρμονία φωνητικά συνέντευξη"
            : "recording production scholarship music source " + i,
      language: i === 1 ? "el" : "en",
      topics:
        i === 0
          ? [...INSPIRATION_RESEARCH_TOPICS.slice(0, 4)]
          : [...INSPIRATION_RESEARCH_TOPICS.slice(4)],
      reason: "Offline query fixture",
    })),
    ambiguities: [
      "Do not assert that reference bands used the requested original fingerstyle technique",
    ],
  };
  const dispatches: any[] = [];
  const journals = new Map<string, any>();
  const records = new Map<string, ModelResult>();
  const queries: string[] = [];
  const calls: string[] = [];
  let claimed = false;
  const faults = {
    plannerUnknown: false,
    invalidPlan: false,
    recordOnce: false,
    planWriteOnce: false,
    settleOnce: false,
    searchUnknown: false,
    denied: false,
    cancelAfterPlanner: false,
    synthesisOnce: false,
  };
  const usage = {
    inputTokens: 200,
    outputTokens: 100,
    totalTokens: 300,
    reasoningTokens: 15,
    cachedInputTokens: 20,
    cacheWriteTokens: 0,
    providerReportedCostUsd: 0.1,
  };
  const db: any = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return q;
        },
        maybeSingle: async () => ({
          data:
            table === "ai_provider_executions"
              ? (journals.get(String(filters["id"])) ?? null)
              : job,
          error: null,
        }),
        then: (resolve: any) => Promise.resolve({ data: dispatches, error: null }).then(resolve),
      };
      return q;
    },
    async rpc(name: string, args: any) {
      if (name === "claim_music_inspiration_job_v2") {
        if (claimed || ["completed", "cancelled", "failed"].includes(job.status))
          return { data: null, error: null };
        claimed = true;
        job.status = "running";
        return { data: { ...job }, error: null };
      }
      if (name === "checkpoint_music_inspiration_job") {
        Object.assign(job, args._patch);
        if (job.cancel_requested_at) job.status = "cancelled";
        claimed = false;
        return { data: { ...job }, error: null };
      }
      if (name === "checkpoint_music_inspiration_plan") {
        if (job.cancel_requested_at) return { data: null, error: { code: "PT409" } };
        if (faults.planWriteOnce) {
          faults.planWriteOnce = false;
          return { data: null, error: { code: "08006" } };
        }
        job.research_plan = args._plan;
        return { data: null, error: null };
      }
      if (name === "reserve_music_inspiration_dispatch") {
        if (dispatches.some((d) => d.dispatch_key === args._dispatch_key))
          return { data: false, error: null };
        dispatches.push({
          kind: args._kind,
          dispatch_key: args._dispatch_key,
          state: "started",
          receipt: null,
        });
        return { data: true, error: null };
      }
      if (name === "settle_music_inspiration_dispatch") {
        if (faults.settleOnce && args._dispatch_key === job.planner_execution_id) {
          faults.settleOnce = false;
          return { data: null, error: { code: "08006" } };
        }
        const d = dispatches.find((d) => d.dispatch_key === args._dispatch_key);
        d.state = args._state;
        d.receipt = args._receipt;
        if (d.kind === "planner" && args._state === "observed")
          job.planner_result =
            args._receipt.provider_result ?? journals.get(job.planner_execution_id)?.result;
        return { data: { ...job }, error: null };
      }
      throw Error("Unexpected fixture RPC " + name);
    },
  };
  const deps: InspirationJobDependencies = {
    db,
    atlas: async () => [],
    authorizeModel: async () => {
      if (faults.denied) throw Error("denied");
    },
    authorizePlanner: async () => {
      if (faults.denied) throw Error("planner unavailable");
      return {} as any;
    },
    admitDispatch: async () => {},
    record: async (j, r) => {
      if (faults.recordOnce && j.execution_id === job.planner_execution_id) {
        faults.recordOnce = false;
        throw Error("lost usage acknowledgement");
      }
      records.set(j.execution_id, r);
    },
    caller: (model, provider, user, id) => async () => {
      expect(user).toBe(job.user_id);
      calls.push(model);
      if (id === job.planner_execution_id && faults.plannerUnknown) {
        journals.set(id, { state: "execution_unknown", result: null });
        throw new TypeError("transport timeout");
      }
      const receipt: ModelResult = {
        provider,
        model,
        stopReason: "end_turn",
        usage,
        text:
          id === job.planner_execution_id
            ? faults.invalidPlan
              ? "{}"
              : JSON.stringify(plan)
            : "synthetic final response",
      };
      journals.set(id, { state: "response_observed", result: receipt });
      records.set(id, receipt); // The real tracked caller persists usage before returning.
      if (id === job.planner_execution_id && faults.recordOnce) {
        faults.recordOnce = false;
        throw Error("usage acknowledgement lost after commit");
      }
      if (id === job.planner_execution_id && faults.cancelAfterPlanner)
        job.cancel_requested_at = new Date().toISOString();
      return receipt;
    },
    search: async (query) => {
      queries.push(query);
      if (faults.searchUnknown) throw new TypeError("lost search acknowledgement");
      return {
        credits: 1,
        requestId: "offline",
        documents: [
          {
            text: "Offline primary source text",
            source: {
              id: "offline",
              title: "Fixture",
              url: "https://example.org/fixture",
              accessedAt: "2026-10-29T00:00:00Z",
              publisher: null,
              locator: "Fixture",
              sourceType: "other",
            },
          },
        ],
      };
    },
    synthesize: async (_request, _docs, call, signal, receivedPlan) => {
      expect(receivedPlan).toEqual(plan);
      signal.throwIfAborted();
      const receipt = await call({ prompt: "offline synthesis", system: "offline" });
      if (faults.synthesisOnce) {
        faults.synthesisOnce = false;
        throw Error("interrupted after observed synthesis");
      }
      return { receipt, result: { version: 1 } as InspirationResearch };
    },
  };
  return {
    job,
    plan,
    deps,
    dispatches,
    journals,
    records,
    queries,
    calls,
    faults,
    release: () => {
      claimed = false;
    },
    run: () => executeMusicInspirationJob(job.id, deps),
  };
}
for (const extended of [false, true])
  test(
    "durable planner → exact bounded searches → selected synthesis: " +
      (extended ? "extended" : "standard"),
    async () => {
      const f = fixture(extended);
      await f.run();
      expect(f.job.status).toBe("completed");
      expect(f.queries).toEqual(f.plan.queries.map((q: any) => q.text));
      expect(f.calls).toEqual([INSPIRATION_PLANNER.model, "creator-selected"]);
      expect(f.dispatches.filter((d) => d.kind === "planner")).toHaveLength(1);
      expect(f.dispatches.filter((d) => d.kind === "ai")).toHaveLength(1);
      expect(f.job.research_plan).toEqual(f.plan);
      expect(await f.run()).toEqual({ ran: false });
      expect(f.calls).toHaveLength(2);
    },
  );
for (const fault of ["recordOnce", "planWriteOnce", "settleOnce"] as const)
  test(
    "planner recovery after " + fault + " uses stored receipt, not a second paid call",
    async () => {
      const f = fixture();
      f.faults[fault] = true;
      await f.run();
      expect(f.job.status).toBe("unknown");
      expect(f.journals.get(f.job.planner_execution_id).result).toBeTruthy();
      await f.run();
      expect(f.job.status).toBe("completed");
      expect(f.calls.filter((m) => m === INSPIRATION_PLANNER.model)).toHaveLength(1);
      expect(f.records.has(f.job.planner_execution_id)).toBe(true);
      expect(f.queries).toHaveLength(2);
    },
  );
test("unknown planner execution never redispatches and cannot advance to Tavily", async () => {
  const f = fixture();
  f.faults.plannerUnknown = true;
  await f.run();
  expect(f.job.status).toBe("unknown");
  await f.run();
  expect(f.job.status).toBe("unknown");
  expect(f.calls).toEqual([INSPIRATION_PLANNER.model]);
  expect(f.queries).toHaveLength(0);
  expect(decodeInspirationDiagnostic(f.job.error_code)?.stage).toBe("planner_request");
});
test("invalid observed planner response records usage and fails without paid refinement", async () => {
  const f = fixture();
  f.faults.invalidPlan = true;
  await f.run();
  expect(f.job.status).toBe("failed");
  expect(f.records.has(f.job.planner_execution_id)).toBe(true);
  expect(f.job.planner_result.text).toBe("{}");
  expect(f.dispatches[0].state).toBe("observed");
  expect(f.queries).toHaveLength(0);
  expect(decodeInspirationDiagnostic(f.job.error_code)?.stage).toBe("planner_schema");
});
test("planner usage survives cancellation immediately after completion", async () => {
  const f = fixture();
  f.faults.cancelAfterPlanner = true;
  await f.run();
  expect(f.records.has(f.job.planner_execution_id)).toBe(true);
  expect(f.job.planner_result).toBeTruthy();
  expect(f.queries).toHaveLength(0);
  expect(f.job.status).toBe("cancelled");
});
test("revoked entitlement / unavailable planner prevents every paid stage", async () => {
  const f = fixture();
  f.faults.denied = true;
  await f.run();
  expect(f.calls).toHaveLength(0);
  expect(f.dispatches).toHaveLength(0);
  expect(f.queries).toHaveLength(0);
  expect(f.job.status).toBe("failed");
});
test("unknown Tavily dispatch is not repeated even with a recovered planner receipt", async () => {
  const f = fixture();
  f.faults.searchUnknown = true;
  await f.run();
  expect(f.job.status).toBe("unknown");
  await f.run();
  expect(f.queries).toHaveLength(1);
  expect(f.calls).toEqual([INSPIRATION_PLANNER.model]);
  expect(f.job.status).toBe("unknown");
});
test("duplicate concurrent delivery and saved synthesis recovery incur no duplicate paid calls", async () => {
  const f = fixture();
  f.faults.synthesisOnce = true;
  await Promise.all([f.run(), f.run()]);
  expect(f.calls).toHaveLength(2);
  expect(f.job.status).toBe("unknown");
  await f.run();
  expect(f.job.status).toBe("completed");
  expect(f.calls).toHaveLength(2);
  expect(f.records.size).toBe(2);
  expect(f.queries).toHaveLength(2);
});

test("revocation after the observed planner receipt preserves its usage and prevents Tavily/synthesis", async () => {
  const f = fixture();
  f.deps.plan = async (...args) => {
    const receipt = await requestInspirationPlan(...args);
    f.faults.denied = true;
    return receipt;
  };
  await f.run();
  expect(f.job.status).toBe("failed");
  expect(f.records.has(f.job.planner_execution_id)).toBe(true);
  expect(f.queries).toHaveLength(0);
  expect(f.calls).toHaveLength(1);
});
test("planner and synthesis may share the same model while retaining two distinct executions", async () => {
  const f = fixture();
  f.job.model = INSPIRATION_PLANNER.model;
  f.job.provider = "openrouter";
  await f.run();
  expect(f.job.status).toBe("completed");
  expect(f.calls).toEqual([INSPIRATION_PLANNER.model, INSPIRATION_PLANNER.model]);
  expect(f.records.size).toBe(2);
  expect(f.records.has(f.job.execution_id)).toBe(true);
  expect(f.records.has(f.job.planner_execution_id)).toBe(true);
});
test("expired dispatch window can reconcile a stored planner receipt but never starts fresh paid work", async () => {
  const f = fixture();
  f.faults.recordOnce = true;
  await f.run();
  expect(f.job.status).toBe("unknown");
  f.deps.clock = () => Date.now() + 10 * 60 * 1000;
  await f.run();
  expect(f.calls).toHaveLength(1);
  expect(f.records.has(f.job.planner_execution_id)).toBe(true);
  expect(f.queries).toHaveLength(0);
  expect(f.job.status).toBe("failed");
  expect(decodeInspirationDiagnostic(f.job.error_code)?.code).toBe("timeout");
});

test("incident-shaped observed planner title drift preserves usage and fails before any search; no paid retry", async () => {
  const f = fixture(true);
  f.job.request = {
    kind: "artist",
    artist: "Offline artist",
    song: "White dove",
    depth: "extended",
  };
  f.plan.request = { ...f.job.request, song: "White Dove" };
  await f.run();
  expect(f.job.status).toBe("failed");
  expect(decodeInspirationDiagnostic(f.job.error_code)).toEqual({
    stage: "planner_schema",
    code: "request_mismatch",
    field: "request.song",
  });
  expect(f.job.request.song).toBe("White dove");
  expect(f.job.research_plan).toBeUndefined();
  expect(f.queries).toHaveLength(0);
  expect(f.calls).toEqual([INSPIRATION_PLANNER.model]);
  expect(f.records.size).toBe(1);
  expect(f.job.planner_result.text).toContain("White Dove");
  expect(f.dispatches).toHaveLength(1);
  expect(f.dispatches[0].state).toBe("observed");
  expect(await f.run()).toEqual({ ran: false });
  expect(f.calls).toHaveLength(1);
  expect(f.records.size).toBe(1);
});
