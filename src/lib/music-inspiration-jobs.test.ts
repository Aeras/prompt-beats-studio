import { expect, test } from "bun:test";
import {
  executeMusicInspirationJob,
  type InspirationJobDependencies,
} from "./music-inspiration-jobs.server";
import { trackedCaller } from "./ai-execution.server";
import type { InspirationResearch } from "./music-inspiration.shared";
import type { ModelResult } from "./ai-provider.server";

function fixture() {
  const id = "c451aaaa-0000-4000-8000-000000000001";
  const job: any = {
    id,
    user_id: "c451aaaa-0000-4000-8000-000000000002",
    execution_id: "c451aaaa-0000-4000-8000-000000000003",
    request: { kind: "artist", artist: "Кино", depth: "standard" },
    status: "queued",
    model: "offline-model",
    provider: "openai",
    created_at: new Date().toISOString(),
    cancel_requested_at: null,
  };
  const receipt: ModelResult = {
    text: "fixture result",
    stopReason: "end_turn",
    provider: "openai",
    model: "offline-model",
    usage: { inputTokens: 100, outputTokens: 25, totalTokens: 125, reasoningTokens: 5 },
  };
  const dispatches: any[] = [];
  let journal: any = null;
  const records = new Map<string, ModelResult>();
  let searches = 0,
    calls = 0,
    failApplication = false,
    locked = false;
  const db: any = {
    from(table: string) {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: table === "ai_provider_executions" ? journal : job,
          error: null,
        }),
        then: (resolve: any) =>
          Promise.resolve({
            data: table === "music_inspiration_dispatches" ? dispatches : [],
            error: null,
          }).then(resolve),
      };
      return q;
    },
    async rpc(name: string, args: any) {
      if (name === "claim_music_inspiration_job") {
        if (locked || ["completed", "cancelled"].includes(job.status))
          return { data: null, error: null };
        locked = true;
        job.status = "running";
        return { data: { ...job }, error: null };
      }
      if (name === "checkpoint_music_inspiration_job") {
        Object.assign(job, args._patch);
        locked = false;
        return { data: { ...job }, error: null };
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
        Object.assign(
          dispatches.find((d) => d.dispatch_key === args._dispatch_key),
          { state: args._state, receipt: args._receipt },
        );
        return { data: { ...job }, error: null };
      }
      throw new Error("unexpected RPC " + name);
    },
  };
  const deps: InspirationJobDependencies = {
    db,
    atlas: async () => [],
    admitDispatch: async () => {},
    authorizeModel: async () => {},
    search: async () => {
      searches++;
      return {
        credits: 1,
        requestId: "offline",
        documents: [
          {
            text: "Synthetic credits, not artist research.",
            source: {
              id: "s1",
              title: "Fixture",
              url: "https://example.org/source",
              accessedAt: new Date().toISOString(),
              locator: "fixture",
              publisher: null,
              sourceType: "other",
            },
          },
        ],
      };
    },
    caller: () => async () => {
      calls++;
      journal = { result: receipt, state: "response_observed" };
      records.set(job.execution_id, receipt);
      return receipt;
    },
    record: async (_job, value) => {
      records.set(job.execution_id, value);
    },
    synthesize: async (_request, _documents, call, signal) => {
      signal.throwIfAborted();
      const value = await call({ prompt: "fixture", system: "fixture" });
      if (failApplication) {
        failApplication = false;
        throw new Error("application parse failure");
      }
      return { receipt: value, result: { version: 1 } as InspirationResearch };
    },
  };
  return {
    id,
    job,
    deps,
    dispatches,
    records,
    counts: () => ({ searches, calls }),
    fail: () => {
      failApplication = true;
    },
    journal: () => journal,
  };
}
test("durable research completes once; duplicate runner delivery makes no additional calls", async () => {
  const f = fixture();
  await executeMusicInspirationJob(f.id, f.deps);
  expect(f.job.status).toBe("completed");
  expect(f.counts()).toEqual({ searches: 2, calls: 1 });
  expect(await executeMusicInspirationJob(f.id, f.deps)).toEqual({ ran: false });
  expect(f.records.size).toBe(1);
});
test("stored response survives application failure and recovers without a second paid execution", async () => {
  const f = fixture();
  f.fail();
  await executeMusicInspirationJob(f.id, f.deps);
  expect(f.job.status).toBe("unknown");
  expect(f.journal().result).toBeTruthy();
  f.job.created_at = "2020-01-01T00:00:00Z";
  await executeMusicInspirationJob(f.id, f.deps);
  expect(f.job.status).toBe("completed");
  expect(f.counts()).toEqual({ searches: 2, calls: 1 });
  expect(f.records.size).toBe(1);
  expect(f.dispatches.find((d) => d.kind === "ai").state).toBe("observed");
});
test("cancellation before dispatch consumes no provider request", async () => {
  const f = fixture();
  f.job.cancel_requested_at = new Date().toISOString();
  await executeMusicInspirationJob(f.id, f.deps);
  expect(f.job.status).toBe("cancelled");
  expect(f.counts()).toEqual({ searches: 0, calls: 0 });
});
test("conclusively malformed stored output is failed, retained and not redispatched", async () => {
  const f = fixture();
  f.deps.synthesize = async (_request, _documents, call) => {
    await call({ prompt: "fixture", system: "fixture" });
    throw new SyntaxError("Invalid JSON");
  };
  await executeMusicInspirationJob(f.id, f.deps);
  expect(f.job.status).toBe("failed");
  expect(f.job.provider_result).toBeTruthy();
  expect(f.records.size).toBe(1);
  expect(f.dispatches.find((d) => d.kind === "ai").state).toBe("observed");
});
test("ambiguous search timeout is durable and never automatically retried", async () => {
  const f = fixture();
  let calls = 0;
  f.deps.search = async () => {
    calls++;
    throw new Error("timeout");
  };
  await executeMusicInspirationJob(f.id, f.deps);
  expect(f.job.status).toBe("unknown");
  await executeMusicInspirationJob(f.id, f.deps);
  expect(calls).toBe(1);
  expect(f.counts().calls).toBe(0);
});
test("concurrent runner workers only dispatch the claimed job", async () => {
  const f = fixture();
  await Promise.all([
    executeMusicInspirationJob(f.id, f.deps),
    executeMusicInspirationJob(f.id, f.deps),
  ]);
  expect(f.counts().calls).toBe(1);
  expect(f.records.size).toBe(1);
});
test("stable execution identity is retained by the shared accounting caller", async () => {
  const id = crypto.randomUUID();
  const ids: string[] = [];
  let count = 0;
  const call = trackedCaller(
    async () => {
      count++;
      return {
        text: "{}",
        provider: "openai",
        model: "fixture",
        stopReason: "end_turn",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    },
    "openai",
    "fixture",
    { userId: "owner", operation: "music_inspiration", executionId: id },
    {
      read: async () => null,
      begin: async (executionId) => {
        ids.push(executionId);
      },
      checkpoint: async () => {},
      write: async () => null,
      record: async (record) => {
        expect(record.executionId).toBe(id);
      },
      dispatchAdmission: async (execute) => execute(),
    },
  );
  await call({ prompt: "fixture", system: "fixture" });
  expect(ids).toEqual([id]);
  expect(count).toBe(1);
});
import { handleJobRunner } from "./job-runner.server";
test("missed initial kick recovers delayed queued work without consuming its research deadline", async () => {
  const f = fixture();
  f.job.created_at = new Date(Date.now() - 120000).toISOString();
  f.job.research_started_at = new Date().toISOString();
  await executeMusicInspirationJob(f.id, f.deps);
  expect(f.job.status).toBe("completed");
  expect(f.counts()).toEqual({ searches: 2, calls: 1 });
});
test("expired queued work never incurs a provider call", async () => {
  const f = fixture();
  f.job.created_at = new Date(Date.now() - 31 * 60000).toISOString();
  f.job.research_started_at = new Date().toISOString();
  await executeMusicInspirationJob(f.id, f.deps);
  expect(f.job.status).toBe("failed");
  expect(f.job.error_code).toBe("research_queue_expired");
  expect(f.counts()).toEqual({ searches: 0, calls: 0 });
});
test("HTTP retry/concurrent delivery uses the existing durable worker claim and one paid execution", async () => {
  const f = fixture();
  const deps: any = {
    authenticate: async () => null,
    inspiration: async () => executeMusicInspirationJob(f.id, f.deps),
  };
  const request = () =>
    new Request("https://fixture.invalid", {
      method: "POST",
      body: JSON.stringify({ musicInspirationJobId: f.id }),
    });
  await Promise.all([handleJobRunner(request(), deps), handleJobRunner(request(), deps)]);
  expect(f.counts()).toEqual({ searches: 2, calls: 1 });
  expect(f.records.size).toBe(1);
  await handleJobRunner(request(), deps);
  expect(f.counts().calls).toBe(1);
});
test("recovery delivery reuses a stored response instead of another paid generation", async () => {
  const f = fixture();
  f.fail();
  await executeMusicInspirationJob(f.id, f.deps);
  expect(f.job.status).toBe("unknown");
  const response = await handleJobRunner(
    new Request("https://fixture.invalid", {
      method: "POST",
      body: JSON.stringify({ musicInspirationJobId: f.id }),
    }),
    {
      authenticate: async () => null,
      inspiration: async () => executeMusicInspirationJob(f.id, f.deps),
    } as any,
  );
  expect(response.status).toBe(200);
  expect(f.job.status).toBe("completed");
  expect(f.counts()).toEqual({ searches: 2, calls: 1 });
  expect(f.records.size).toBe(1);
});
test("global AI switch still blocks queued work before any paid dispatch", async () => {
  const f = fixture();
  f.deps.admitDispatch = async () => {
    throw new Error("AI disabled");
  };
  await executeMusicInspirationJob(f.id, f.deps);
  expect(f.job.status).toBe("failed");
  expect(f.counts()).toEqual({ searches: 0, calls: 0 });
});
