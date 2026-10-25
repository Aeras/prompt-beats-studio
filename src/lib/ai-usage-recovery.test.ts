import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  trackedCaller,
  type ExecutionContext,
  type ExecutionDependencies,
} from "./ai-execution.server";
import {
  deliverAiUsage,
  toUsageInsert,
  type UsageInsert,
  type UsageRecord,
} from "./ai-usage.server";
import { usageEvidence } from "./ai-usage-evidence";
import { safeStopReason, safeErrorType, safeProviderCode } from "./safe-diagnostics";
import { cancelBackgroundOperation } from "./ai-cancellation-upstream.server";
import type { ModelCall, ModelResult, ModelCaller } from "./ai-provider.server";

const usage = {
  inputTokens: 100,
  outputTokens: 20,
  totalTokens: 120,
  reasoningTokens: 10,
  cachedInputTokens: 25,
};
const result: ModelResult = {
  text: '{"title":"test"}',
  stopReason: "end_turn",
  usage,
  provider: "openai",
  model: "fixture",
};
const context: ExecutionContext = { userId: "owner", operation: "generate", jobId: "job" };
const input: ModelCall = { system: "private system", prompt: "private lyrics" };
function fixture() {
  const records: UsageRecord[] = [];
  const events: string[] = [];
  let cached: ModelResult | null = null;
  let identity = "";
  const deps: ExecutionDependencies = {
    dispatchAdmission: async (execute) => execute(),
    read: async () =>
      cached
        ? {
            id: identity,
            user_id: "owner",
            provider: "openai",
            model: "fixture",
            operation: "generate",
            generation_id: null,
            job_id: "job",
            quality_action_id: null,
            remote_id: null,
            remote_provider: null,
            result: cached,
            observed_usage: cached.usage,
          }
        : null,
    begin: async (id) => {
      identity = id;
      events.push("begin");
    },
    checkpoint: async (_id, _context, value) => {
      cached = value;
      events.push("checkpoint");
    },
    write: async (name) => {
      events.push(name);
      return null;
    },
    record: async (record) => {
      records.push(record);
      events.push("usage");
    },
  };
  return {
    deps,
    events,
    records,
    get cached() {
      return cached;
    },
  };
}
describe("AI accounting and recovery failure matrix (offline)", () => {
  test("global OFF refuses before execution journal and does not fabricate usage", async () => {
    const f = fixture();
    let calls = 0;
    f.deps.dispatchAdmission = async () => {
      throw new Error("AI is temporarily disabled");
    };
    await expect(
      trackedCaller(
        async () => {
          calls++;
          return result;
        },
        "openai",
        "fixture",
        context,
        f.deps,
      )(input),
    ).rejects.toThrow("temporarily disabled");
    expect(calls).toBe(0);
    expect(f.events).toEqual([]);
    expect(f.records).toEqual([]);
  });
  test("cached completed result is recoverable OFF without admission or another billable call", async () => {
    const f = fixture();
    let calls = 0;
    const call = trackedCaller(
      async () => {
        calls++;
        return result;
      },
      "openai",
      "fixture",
      context,
      f.deps,
    );
    await call(input);
    f.deps.dispatchAdmission = async () => {
      throw new Error("disabled");
    };
    const recovered = await call(input);
    expect(recovered.text).toBe(result.text);
    expect(calls).toBe(1);
    expect(f.records).toHaveLength(1);
  });

  test("actual Anthropic SSE adapter preserves normalized cache receipts on completion and interruption", async () => {
    const source = ts.createSourceFile(
      "provider.ts",
      readFileSync(new URL("./ai-provider.server.ts", import.meta.url), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const declaration = source.statements.find(
      (statement) =>
        ts.isFunctionDeclaration(statement) && statement.name?.text === "callAnthropic",
    );
    if (!declaration) throw new Error("Anthropic adapter missing");
    const javascript = ts.transpileModule(declaration.getText(source), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    for (const interrupted of [false, true]) {
      const observed: Array<ModelResult["usage"]> = [];
      const frames = [
        {
          type: "message_start",
          message: {
            usage: {
              input_tokens: 10,
              output_tokens: 0,
              cache_read_input_tokens: 80,
              cache_creation_input_tokens: 10,
            },
          },
        },
        { type: "content_block_delta", delta: { type: "text_delta", text: "fixture" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: " text" } },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 20 } },
        ...(interrupted ? [{ type: "error", error: { type: "overloaded_error" } }] : []),
      ]
        .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
        .join("");
      // Execute only the real adapter function with an injected fetch; no global env/key/network changes.
      const adapter = runInNewContext(`${javascript}; callAnthropic`, {
        process: { env: { ANTHROPIC_API_KEY: "offline-fixture-not-a-key" } },
        fetch: async () => new Response(frames),
        providerRequestSignal: () => new AbortController().signal,
        TextDecoder,
        usageEvidence,
        safeStopReason,
        safeErrorType,
        safeProviderDiagnosticCode: safeProviderCode,
        console: { info() {}, error() {} },
      }) as (model: string, call: ModelCall) => Promise<ModelResult>;
      const pending = adapter("fixture", {
        ...input,
        onUsageObserved: async (receipt) => {
          observed.push(receipt);
        },
      });
      if (interrupted) await expect(pending).rejects.toThrow();
      else
        expect((await pending).usage).toMatchObject({
          inputTokens: 100,
          outputTokens: 20,
          totalTokens: 120,
          cachedInputTokens: 80,
          cacheWriteTokens: 10,
        });
      expect(observed.at(-1)).toMatchObject({
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        cachedInputTokens: 80,
        cacheWriteTokens: 10,
      });
      expect(observed).toHaveLength(2); // Never write a database receipt per text fragment.
    }
  });
  test("successful response is checkpointed and accounted before returning", async () => {
    const f = fixture();
    const call = trackedCaller(async () => result, "openai", "fixture", context, f.deps);
    const out = await call(input);
    expect(f.events).toEqual(["begin", "checkpoint", "usage"]);
    expect(out.usage?.executionId).toBe(call.executionId);
    expect(f.records[0]?.usage).toEqual({ ...usage, executionId: call.executionId });
  });
  test("cancel before dispatch makes no provider call", async () => {
    const f = fixture();
    let calls = 0;
    const controller = new AbortController();
    controller.abort();
    const call = trackedCaller(
      async () => {
        calls++;
        return result;
      },
      "openai",
      "fixture",
      context,
      f.deps,
    );
    await expect(call({ ...input, abortSignal: controller.signal })).rejects.toThrow();
    expect(calls).toBe(0);
    expect(f.events).toEqual([]);
  });
  test("cancel during journal write records not-dispatched and never sends", async () => {
    const f = fixture();
    let calls = 0;
    const controller = new AbortController();
    f.deps.begin = async () => {
      controller.abort();
    };
    const call = trackedCaller(
      async () => {
        calls++;
        return result;
      },
      "openai",
      "fixture",
      context,
      f.deps,
    );
    await expect(call({ ...input, abortSignal: controller.signal })).rejects.toThrow();
    expect(calls).toBe(0);
    expect(f.events).toContain("skip_ai_execution_internal");
  });
  test("cancel immediately after completion cannot erase real usage", async () => {
    const f = fixture();
    const controller = new AbortController();
    const call = trackedCaller(
      async () => {
        controller.abort();
        return result;
      },
      "openai",
      "fixture",
      context,
      f.deps,
    );
    await call({ ...input, abortSignal: controller.signal });
    expect(f.records[0]?.usage?.outputTokens).toBe(20);
    expect(f.cached?.text).toBe(result.text);
  });
  test("active-call cancellation preserves partial usage separately from final", async () => {
    const f = fixture();
    const call = trackedCaller(
      async (request) => {
        await request.onUsageObserved?.(usage);
        throw new Error("cancelled");
      },
      "openai",
      "fixture",
      context,
      f.deps,
    );
    await expect(call(input)).rejects.toThrow("cancelled");
    expect(f.records[0]?.usageState).toBe("partial");
    expect(f.records[0]?.usage?.reasoningTokens).toBe(10);
  });
  test("concurrent cancellation after usage but before checkpoint retains the receipt", async () => {
    const f = fixture();
    const controller = new AbortController();
    let observed!: () => void;
    let finish!: () => void;
    const ready = new Promise<void>((resolve) => {
      observed = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const call = trackedCaller(
      async (request) => {
        await request.onUsageObserved?.(usage);
        observed();
        await gate;
        return result;
      },
      "openai",
      "fixture",
      context,
      f.deps,
    );
    const completion = call({ ...input, abortSignal: controller.signal });
    await ready;
    controller.abort();
    finish();
    await completion;
    expect(f.records).toHaveLength(1);
    expect(f.records[0]?.usage?.totalTokens).toBe(120);
    expect(f.cached?.text).toBe(result.text);
  });
  test("lost checkpoint ACK is recovered without another provider call", async () => {
    const f = fixture();
    let calls = 0;
    const checkpoint = f.deps.checkpoint!;
    f.deps.checkpoint = async (...args) => {
      await checkpoint(...args);
      throw new Error("checkpoint ACK lost");
    };
    const raw: ModelCaller = async () => {
      calls++;
      return result;
    };
    await expect(trackedCaller(raw, "openai", "fixture", context, f.deps)(input)).rejects.toThrow();
    await trackedCaller(
      raw,
      "openai",
      "fixture",
      { ...context, recoveryOnly: true },
      f.deps,
    )(input);
    expect(calls).toBe(1);
  });
  test("timeout without receipt stays unknown, never fabricated zero", async () => {
    const f = fixture();
    const call = trackedCaller(
      async () => {
        throw new Error("timeout");
      },
      "openai",
      "fixture",
      context,
      f.deps,
    );
    await expect(call(input)).rejects.toThrow("timeout");
    const record = f.records[0]!;
    expect(record.usageState).toBe("unknown");
    expect(toUsageInsert(record).total_tokens).toBeNull();
  });
  test("provider error carrying a valid receipt retains consumption", async () => {
    const f = fixture();
    const call = trackedCaller(
      async () => {
        throw Object.assign(new Error("provider error"), {
          usage: { input_tokens: 100, output_tokens: 7, total_tokens: 107 },
        });
      },
      "openai",
      "fixture",
      context,
      f.deps,
    );
    await expect(call(input)).rejects.toThrow("provider error");
    expect(f.records[0]?.usage?.outputTokens).toBe(7);
    expect(f.records[0]?.usageState).toBe("partial");
  });
  test("remote ID is journaled before job callback can fail", async () => {
    const f = fixture();
    const call = trackedCaller(
      async (request) => {
        await request.onRemoteOperationCreated?.("openai", "resp_fixture");
        return result;
      },
      "openai",
      "fixture",
      context,
      f.deps,
    );
    await expect(
      call({
        ...input,
        onRemoteOperationCreated: () => {
          throw new Error("job write lost");
        },
      }),
    ).rejects.toThrow();
    expect(f.events).toContain("mark_ai_execution_remote_internal");
    expect(f.records[0]?.usageState).toBe("unknown");
  });

  test("error receipt reaches independent settlement even when its journal write fails", async () => {
    const f = fixture();
    f.deps.write = async () => {
      throw new Error("journal unavailable");
    };
    const failure = Object.assign(new Error("provider failure"), {
      usage: { input_tokens: 100, output_tokens: 7, total_tokens: 107 },
    });
    const call = trackedCaller(
      async () => {
        throw failure;
      },
      "openai",
      "fixture",
      context,
      f.deps,
    );
    await expect(call(input)).rejects.toBe(failure);
    expect(f.records).toHaveLength(1);
    expect(f.records[0]?.usage?.totalTokens).toBe(107);
    expect(f.records[0]?.executionId).toBe(call.executionId);
  });
  test("worker restart retrieves cached output without another provider execution", async () => {
    const f = fixture();
    let calls = 0;
    const raw: ModelCaller = async () => {
      calls++;
      return result;
    };
    await trackedCaller(raw, "openai", "fixture", context, f.deps)(input);
    const restored = await trackedCaller(
      raw,
      "openai",
      "fixture",
      { ...context, recoveryOnly: true },
      f.deps,
    )(input);
    expect(restored.text).toBe(result.text);
    expect(calls).toBe(1);
  });
  test("unresolved recovery cannot blindly dispatch", async () => {
    const f = fixture();
    let calls = 0;
    const call = trackedCaller(
      async () => {
        calls++;
        return result;
      },
      "openai",
      "fixture",
      { ...context, recoveryOnly: true },
      f.deps,
    );
    await expect(call(input)).rejects.toThrow("redispatch");
    expect(calls).toBe(0);
  });
  test("completed checkpoint survives accounting delivery failure", async () => {
    const f = fixture();
    let calls = 0;
    f.deps.record = async () => {
      throw new Error("database unavailable");
    };
    const raw: ModelCaller = async () => {
      calls++;
      return result;
    };
    await expect(trackedCaller(raw, "openai", "fixture", context, f.deps)(input)).rejects.toThrow();
    await trackedCaller(
      raw,
      "openai",
      "fixture",
      { ...context, recoveryOnly: true },
      f.deps,
    )(input);
    expect(calls).toBe(1);
    expect(f.cached).not.toBeNull();
  });
  test("lost commit ACK retries one immutable usage identity", async () => {
    const payload = toUsageInsert({
      userId: "owner",
      provider: "openai",
      model: "fixture",
      operation: "generate",
      usage,
      success: true,
    });
    const rows = new Map<string, UsageInsert>();
    let attempts = 0;
    const outcome = await deliverAiUsage(
      payload,
      {
        settle: async (value) => {
          rows.set(value.id, value);
          if (++attempts === 1) throw new Error("ACK lost");
        },
        enqueue: async () => {
          throw new Error("unexpected outbox");
        },
      },
      async () => {},
    );
    expect(outcome).toBe("recorded");
    expect(rows.size).toBe(1);
    expect(attempts).toBe(2);
  });
  test("both persistence failures queue the identical receipt", async () => {
    const payload = toUsageInsert({
      userId: "owner",
      provider: "openai",
      model: "fixture",
      operation: "generate",
      usage,
      success: true,
    });
    let queued: UsageInsert | undefined;
    await deliverAiUsage(
      payload,
      {
        settle: async () => {
          throw new Error("offline");
        },
        enqueue: async (value) => {
          queued = value;
        },
      },
      async () => {},
    );
    expect(queued).toBe(payload);
  });
  test("genuine second dispatch has a different execution identity", async () => {
    const f = fixture();
    f.deps.read = async () => null;
    const call = trackedCaller(
      async () => result,
      "openai",
      "fixture",
      { userId: "owner", operation: "generate" },
      f.deps,
    );
    await call(input);
    const first = call.executionId;
    await call(input);
    expect(call.executionId).not.toBe(first);
  });
  test("cache, reasoning and reported cost do not double-count output", () => {
    const evidence = usageEvidence(
      {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
          prompt_tokens_details: { cached_tokens: 25, cache_write_tokens: 5 },
          completion_tokens_details: { reasoning_tokens: 10 },
          cost: 0.012,
        },
      },
      "openrouter",
    );
    expect(evidence?.outputTokens).toBe(20);
    expect(evidence?.reasoningTokens).toBe(10);
    expect(evidence?.cachedInputTokens).toBe(25);
    expect(evidence?.cacheWriteTokens).toBe(5);
    expect(evidence?.providerReportedCostUsd).toBe(0.012);
  });
  test("Gemini GenerateContent includes thoughts once, including interrupted partial receipts", () => {
    const receipt = usageEvidence(
      {
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 20,
          thoughtsTokenCount: 80,
          cachedContentTokenCount: 25,
          totalTokenCount: 200,
        },
      },
      "gemini",
    );
    expect(receipt).toMatchObject({
      inputTokens: 100,
      outputTokens: 100,
      reasoningTokens: 80,
      totalTokens: 200,
      cachedInputTokens: 25,
    });
    expect(usageEvidence({ usageMetadata: { thoughtsTokenCount: 80 } }, "gemini")).toMatchObject({
      inputTokens: null,
      outputTokens: 80,
      totalTokens: null,
    });
    expect(
      usageEvidence({ usage: { total_output_tokens: 100, total_thought_tokens: 80 } }, "gemini"),
    ).toMatchObject({ outputTokens: 100, reasoningTokens: 80 });
  });
  test("Anthropic input includes uncached, cache read and cache creation without changing other providers", () => {
    const raw = {
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 80,
        cache_creation_input_tokens: 10,
      },
    };
    expect(usageEvidence(raw, "anthropic")).toMatchObject({
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      cachedInputTokens: 80,
      cacheWriteTokens: 10,
    });
    expect(usageEvidence(raw, "openai")?.inputTokens).toBe(10);
    expect(usageEvidence({ usage: { input_tokens: 10 } }, "anthropic")).toMatchObject({
      inputTokens: 10,
      outputTokens: null,
      totalTokens: null,
    });
  });
  test("invalid usage values and raw private fields are not trusted", () => {
    expect(usageEvidence({ usage: { input_tokens: -1, output_tokens: "20" } })).toBeNull();
    expect(
      JSON.stringify(usageEvidence({ usage: { input_tokens: 1, secret: "do-not-persist" } })),
    ).not.toContain("do-not-persist");
  });
  test("cost-only provider receipt does not fabricate token usage", () => {
    const evidence = usageEvidence({ usage: { total_cost: 0.02 } }, "openrouter");
    expect(evidence?.providerReportedCostUsd).toBe(0.02);
    expect(evidence?.inputTokens).toBeNull();
    expect(evidence?.outputTokens).toBeNull();
  });
  test("partial input count does not imply zero output or a final total", () => {
    const row = toUsageInsert({
      userId: "owner",
      provider: "openai",
      model: "fixture",
      operation: "generate",
      usage: { inputTokens: 50, outputTokens: null, totalTokens: null },
      success: false,
      usageState: "partial",
    });
    expect(row.total_tokens).toBeNull();
    expect(row.output_tokens).toBeNull();
  });
  test("cancel request and body reads are bounded even for non-cooperative fetches", async () => {
    const result = await cancelBackgroundOperation("openai", "resp_fixture", "fixture-secret", {
      requestTimeoutMs: 3,
      totalTimeoutMs: 12,
      polls: 1,
      fetchFn: (() => new Promise<Response>(() => {})) as typeof fetch,
    });
    expect(result.outcome).toBe("cancel_unconfirmed");
    expect(result.verifiedByGet).toBe(false);
  });
  test("stalled cancellation JSON is not an upstream confirmation", async () => {
    const response = new Response(new ReadableStream({ start() {} }));
    const result = await cancelBackgroundOperation("openai", "resp_fixture", "fixture-secret", {
      requestTimeoutMs: 3,
      totalTimeoutMs: 12,
      polls: 1,
      fetchFn: (async () => response) as typeof fetch,
    });
    expect(result.verifiedByGet).toBe(false);
  });
});
