import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  admit,
  MODES,
  NEUTRAL_PROMPT,
  runHarness,
  worstCaseCostUsd,
  type Deps,
  type ModeId,
} from "./harness";
import { FileLedger, MemoryLedger } from "./ledger";

const SECRET = "sk-test-SECRET-should-never-leak";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const sse = (frames: unknown[], done = false) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const f of frames) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(f)}\n\n`));
        if (done) {
          c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          c.close();
        }
      },
    }),
    { status: 200 },
  );

type Handler = (url: string, method: string) => Response | Promise<Response>;
function deps(handler: Handler, extra: Partial<Deps> = {}) {
  const calls: { url: string; method: string; body?: string }[] = [];
  let id = 0;
  const d: Deps = {
    fetch: (async (u: any, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url: String(u), method, body: init?.body as string });
      return handler(String(u), method);
    }) as typeof fetch,
    sleep: async () => {},
    now: () => 0,
    env: () => SECRET,
    newId: () => `res-${++id}`,
    ledger: new MemoryLedger(),
    ...extra,
  };
  return { d, calls };
}
const opts = (m: ModeId, extra = {}) => ({
  modes: [m],
  live: true,
  confirmSpendUsd: 0.05,
  totalBudgetUsd: 0.1,
  priorCalls: {},
  priorSpentUpperUsd: 0,
  ...extra,
});
const creates = (calls: { method: string; body?: string }[]) =>
  calls.filter((c) => c.method === "POST" && c.body?.includes("model")).length;
const noLeak = (o: unknown) => {
  const s = JSON.stringify(o);
  expect(s).not.toContain(SECRET);
  expect(s).not.toContain(NEUTRAL_PROMPT);
};
/** Background provider mock: create (POST) -> cancel (POST .../cancel) -> independent GET */
const bg =
  (create: unknown, cancel: () => Response, get: () => Response): Handler =>
  (u, m) => {
    if (u.endsWith("/cancel")) return cancel();
    if (m === "POST") return json(create);
    return get();
  };
const run1 = async (m: ModeId, h: Handler, extra: Partial<Deps> = {}) => {
  const x = deps(h, extra);
  const out = await runHarness(opts(m), x.d);
  return { r: out.results[0]!, calls: x.calls };
};
const tmpLedger = () => join(mkdtempSync(join(tmpdir(), "aic-")), "ledger.json");

describe("budget guard", () => {
  test("worst case = verified price x caps (incl. output multiplier)", () => {
    expect(worstCaseCostUsd(MODES.openai_background_responses)).toBe(0.001269);
    expect(worstCaseCostUsd(MODES.openrouter_stream_abort)).toBe(0.001269);
    expect(worstCaseCostUsd(MODES.gemini_background_interactions)).toBe(0.00783);
    expect(worstCaseCostUsd(MODES.xai_stream_abort)).toBe(0.012688);
  });
  test("refuses mode over total budget and over max calls", () => {
    const a = admit({ ...opts("xai_stream_abort"), totalBudgetUsd: 0.001 }).admissions[0]!;
    expect(a.admitted).toBe(false);
    const b = admit({ ...opts("xai_stream_abort"), priorCalls: { xai_stream_abort: 1 } }).admissions[0]!;
    expect(b.reason).toBe("max billable calls reached");
  });
  test("dry run makes no network calls", async () => {
    const { d, calls } = deps(() => json({}));
    await runHarness({ ...opts("openai_background_responses"), live: false }, d);
    expect(calls.length).toBe(0);
  });
  test("live refused without sufficient confirmation", async () => {
    const { d, calls } = deps(() => json({}));
    await expect(
      runHarness({ ...opts("openai_background_responses"), confirmSpendUsd: 0.0001 }, d),
    ).rejects.toThrow();
    expect(calls.length).toBe(0);
  });
  test("budget counts prior unfinished reservations", async () => {
    const ledger = new MemoryLedger();
    ledger.data.reservations.push({
      reservationId: "old",
      mode: "openai_background_responses",
      reservedAt: "x",
      worstCaseCostUsd: 0.095,
      state: "reserved",
      completedAt: null,
      result: null,
    });
    const { d, calls } = deps(() => json({}), { ledger });
    const out = await runHarness({ ...opts("xai_stream_abort"), confirmSpendUsd: 0 }, d);
    expect(out.admissions[0]!.reason).toBe("total budget exceeded");
    expect(calls.length).toBe(0);
  });
});

describe("ledger reservations", () => {
  test("reservation is persisted before the provider request", async () => {
    const ledger = new MemoryLedger();
    let reservedBeforeDispatch = false;
    const h = bg({ id: "resp_1", status: "queued" }, () => json({}), () => json({ status: "cancelled" }));
    const { d } = deps(
      (u, m) => {
        if (m === "POST" && !u.endsWith("/cancel"))
          reservedBeforeDispatch = ledger.data.reservations.some((r) => r.state === "reserved");
        return h(u, m);
      },
      { ledger },
    );
    await runHarness(opts("openai_background_responses"), d);
    expect(reservedBeforeDispatch).toBe(true);
    expect(ledger.data.reservations[0]!.state).toBe("completed");
  });
  test("crash right after reservation, then rerun: nothing is dispatched again", async () => {
    const path = tmpLedger();
    // State left by a crash: reservation durable, no result (lock removed by operator).
    writeFileSync(
      path,
      JSON.stringify({
        version: 2,
        reservations: [
          {
            reservationId: "r1",
            mode: "xai_stream_abort",
            reservedAt: "t",
            worstCaseCostUsd: 0.012688,
            state: "reserved",
            completedAt: null,
            result: null,
          },
        ],
      }),
    );
    const { d, calls } = deps(() => sse([{ id: "x", choices: [{ delta: { content: "a" } }] }]), {
      ledger: new FileLedger(path),
    });
    const out = await runHarness(opts("xai_stream_abort"), d);
    expect(out.admissions[0]!.reason).toBe("max billable calls reached");
    expect(out.results.length).toBe(0);
    expect(calls.length).toBe(0);
  });
  test("stale lock from a crashed run blocks the next run (no auto-removal)", async () => {
    const path = tmpLedger();
    writeFileSync(`${path}.lock`, "{}");
    const { d, calls } = deps(() => json({}), { ledger: new FileLedger(path) });
    await expect(runHarness(opts("openai_background_responses"), d)).rejects.toThrow(/lock/);
    expect(calls.length).toBe(0);
    expect(existsSync(`${path}.lock`)).toBe(true);
  });
  test("concurrent runs: only one dispatches", async () => {
    const path = tmpLedger();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const h = bg({ id: "resp_1", status: "queued" }, () => json({}), () => json({ status: "cancelled" }));
    const a = deps(
      async (u, m) => {
        await gate;
        return h(u, m);
      },
      { ledger: new FileLedger(path) },
    );
    const b = deps(h, { ledger: new FileLedger(path) });
    const first = runHarness(opts("openai_background_responses"), a.d);
    await Promise.resolve();
    await expect(runHarness(opts("openai_background_responses"), b.d)).rejects.toThrow(/lock/);
    release();
    await first;
    expect(creates(a.calls) + creates(b.calls)).toBe(1);
    expect(JSON.parse(readFileSync(path, "utf8")).reservations.length).toBe(1);
  });
  test("ledger write failure: nothing is dispatched", async () => {
    const ledger = new MemoryLedger();
    ledger.failWrites = true;
    const { d, calls } = deps(() => json({}), { ledger });
    await expect(runHarness(opts("openai_background_responses"), d)).rejects.toThrow(
      /ledger write failed/,
    );
    expect(calls.length).toBe(0);
  });
  test("completed reservation also blocks a second call", async () => {
    const ledger = new MemoryLedger();
    const h = bg({ id: "resp_1", status: "queued" }, () => json({}), () => json({ status: "cancelled" }));
    await runHarness(opts("openai_background_responses"), deps(h, { ledger }).d);
    const second = deps(h, { ledger });
    const out = await runHarness(opts("openai_background_responses"), second.d);
    expect(out.results.length).toBe(0);
    expect(second.calls.length).toBe(0);
  });
});

describe("OpenAI background responses", () => {
  test("independent GET cancelled => confirmed, usage separated, timestamps", async () => {
    const { r, calls } = await run1(
      "openai_background_responses",
      bg(
        { id: "resp_1", status: "queued", created_at: 1 },
        () => json({ status: "cancelled" }),
        () =>
          json({
            id: "resp_1",
            status: "cancelled",
            usage: { input_tokens: 30, output_tokens: 12, output_tokens_details: { reasoning_tokens: 8 } },
          }),
      ),
    );
    expect(r.outcome).toBe("cancelled_upstream_confirmed");
    expect(r.providerRequestId).toBe("resp_1");
    expect(r.usage?.reasoningTokens).toBe(8);
    expect(r.confirmedBilledCostUsd).toBeNull();
    expect(r.estimatedCostUsd).toBeGreaterThan(0);
    expect(r.timestamps["cancelSentAt"]).toBeTruthy();
    expect(r.timestamps["verifiedAt"]).toBeTruthy();
    expect(calls.some((c) => c.method === "GET" && c.url.endsWith("/responses/resp_1"))).toBe(true);
    expect(creates(calls)).toBe(1);
    noLeak(r);
  });
  test("cancel HTTP 200 without terminal cancelled on GET => not confirmed", async () => {
    const { r } = await run1(
      "openai_background_responses",
      bg({ id: "resp_1", status: "queued" }, () => json({ status: "cancelled" }), () => json({ status: "in_progress" })),
    );
    expect(r.outcome).toBe("cancel_failed");
    expect(r.possiblyBilledUnknown).toBe(true);
  });
  test("completed before cancel => already_completed", async () => {
    const { r } = await run1(
      "openai_background_responses",
      bg({ id: "resp_1", status: "in_progress" }, () => json({}, 400), () => json({ status: "completed" })),
    );
    expect(r.outcome).toBe("already_completed");
  });
  test("cancel rejected and still running => cancel_failed, no retry create", async () => {
    const { r, calls } = await run1(
      "openai_background_responses",
      bg({ id: "resp_1", status: "in_progress" }, () => json({}, 500), () => json({ status: "in_progress" })),
    );
    expect(r.outcome).toBe("cancel_failed");
    expect(creates(calls)).toBe(1);
  });
  test("status endpoint unavailable => cancel_failed, possibly billed", async () => {
    const { r } = await run1(
      "openai_background_responses",
      bg({ id: "resp_1", status: "queued" }, () => json({}), () => json({}, 503)),
    );
    expect(r.outcome).toBe("cancel_failed");
    expect(r.possiblyBilledUnknown).toBe(true);
    expect(r.evidence.join(" ")).toContain("status endpoint unavailable");
  });
  test("request started but never returned => timeout, cancel_failed, no retry", async () => {
    const { r, calls } = await run1("openai_background_responses", () => new Promise<Response>(() => {}), {
      requestTimeout: async () => {},
    });
    expect(r.outcome).toBe("cancel_failed");
    expect(r.possiblyBilledUnknown).toBe(true);
    expect(calls.length).toBe(1);
  });
});

describe("Gemini background interactions", () => {
  test("independent GET cancelled => confirmed", async () => {
    const { r, calls } = await run1(
      "gemini_background_interactions",
      bg(
        { id: "int_1", status: "in_progress" },
        () => json({}),
        () =>
          json({
            status: "cancelled",
            usage: { total_input_tokens: 20, total_output_tokens: 3, total_thought_tokens: 5 },
          }),
      ),
    );
    expect(r.outcome).toBe("cancelled_upstream_confirmed");
    expect(r.usage?.reasoningTokens).toBe(5);
    expect(calls.some((c) => c.method === "GET" && c.url.endsWith("/interactions/int_1"))).toBe(true);
  });
  test("cancel 200 alone is not success (status stays in_progress)", async () => {
    const { r } = await run1(
      "gemini_background_interactions",
      bg({ id: "int_1", status: "in_progress" }, () => json({ status: "cancelled" }), () => json({ status: "in_progress" })),
    );
    expect(r.outcome).toBe("cancel_failed");
  });
  test("background not supported (400) => unsupported", async () => {
    const { r, calls } = await run1("gemini_background_interactions", () => json({ error: {} }, 400));
    expect(r.outcome).toBe("unsupported");
    expect(calls.length).toBe(1);
  });
});

describe("Streaming abort", () => {
  test("xAI abort is never reported as confirmed", async () => {
    const { r } = await run1("xai_stream_abort", () =>
      sse([{ id: "x1", choices: [{ delta: { content: "Hi" } }] }]),
    );
    expect(r.outcome).toBe("connection_aborted_unconfirmed");
  });
  test("xAI finished before abort => already_completed", async () => {
    const { r } = await run1("xai_stream_abort", () =>
      sse([{ id: "x1", choices: [{ delta: {}, finish_reason: "stop" }] }], true),
    );
    expect(r.outcome).toBe("already_completed");
  });
  const orStream = () => sse([{ id: "gen-1", choices: [{ delta: { content: "A" } }] }]);
  test("OpenRouter cancelled=true from supported upstream => confirmed with billed total_cost", async () => {
    const { r, calls } = await run1("openrouter_stream_abort", (u) =>
      u.includes("/generation?id=")
        ? json({
            data: {
              id: "gen-1",
              cancelled: true,
              provider_name: "OpenAI",
              total_cost: 0.00001,
              native_tokens_prompt: 25,
              native_tokens_completion: 6,
              native_tokens_reasoning: 0,
            },
          })
        : orStream(),
    );
    expect(r.outcome).toBe("cancelled_upstream_confirmed");
    expect(r.confirmedBilledCostUsd).toBe(0.00001);
    expect(r.usage?.outputTokens).toBe(6);
    expect(creates(calls)).toBe(1);
    const body = JSON.parse(calls[0]!.body!);
    expect(body.provider.allow_fallbacks).toBe(false);
    expect(body.provider.only).toEqual(["openai"]);
    noLeak(r);
  });
  test("OpenRouter cancelled=true from unsupported upstream => unsupported", async () => {
    const { r } = await run1("openrouter_stream_abort", (u) =>
      u.includes("/generation?id=") ? json({ data: { cancelled: true, provider_name: "Google" } }) : orStream(),
    );
    expect(r.outcome).toBe("unsupported");
  });
  test("OpenRouter cancelled=false => not confirmed", async () => {
    const { r } = await run1("openrouter_stream_abort", (u) =>
      u.includes("/generation?id=")
        ? json({ data: { id: "gen-1", cancelled: false, provider_name: "OpenAI" } })
        : orStream(),
    );
    expect(r.outcome).toBe("connection_aborted_unconfirmed");
  });
  test("OpenRouter unknown real cost: total_cost absent => billed null, estimate separate", async () => {
    const { r } = await run1("openrouter_stream_abort", (u) =>
      u.includes("/generation?id=")
        ? json({ data: { cancelled: true, provider_name: "OpenAI", native_tokens_prompt: 25, native_tokens_completion: 6 } })
        : orStream(),
    );
    expect(r.confirmedBilledCostUsd).toBeNull();
    expect(r.estimatedCostUsd).toBeGreaterThan(0);
    expect(r.evidence.join(" ")).toContain("billed cost unknown");
  });
  test("OpenRouter generation endpoint unavailable => unconfirmed, possibly billed", async () => {
    const { r } = await run1("openrouter_stream_abort", (u) =>
      u.includes("/generation?id=") ? json({}, 404) : orStream(),
    );
    expect(r.outcome).toBe("connection_aborted_unconfirmed");
    expect(r.possiblyBilledUnknown).toBe(true);
  });
  test("thrown transport error => cancel_failed, no retry, no leak", async () => {
    const { r, calls } = await run1("openrouter_stream_abort", () => {
      throw new TypeError(`network ${SECRET} ${NEUTRAL_PROMPT}`);
    });
    expect(r.outcome).toBe("cancel_failed");
    expect(calls.length).toBe(1);
    noLeak(r);
  });
  test("ledger file never contains secrets or the prompt; lock released", async () => {
    const path = tmpLedger();
    await runHarness(
      opts("xai_stream_abort"),
      deps(() => sse([{ id: "x1", choices: [{ delta: { content: "Hi" } }] }]), {
        ledger: new FileLedger(path),
      }).d,
    );
    const text = readFileSync(path, "utf8");
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(NEUTRAL_PROMPT);
    expect(existsSync(`${path}.lock`)).toBe(false);
  });
});
