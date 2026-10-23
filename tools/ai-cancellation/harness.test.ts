import { describe, expect, test } from "bun:test";
import { admit, MODES, NEUTRAL_PROMPT, runHarness, worstCaseCostUsd, type Deps, type ModeId } from "./harness";

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

function deps(handler: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; method: string; body?: string }[] = [];
  const d: Deps = {
    fetch: (async (u: any, init?: RequestInit) => {
      calls.push({ url: String(u), method: init?.method ?? "GET", body: init?.body as string });
      return handler(String(u), init);
    }) as typeof fetch,
    sleep: async () => {},
    now: () => 0,
    env: () => SECRET,
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

describe("budget guard", () => {
  test("worst case = input+output upper bounds", () => {
    expect(worstCaseCostUsd(MODES.openai_background_responses)).toBe(0.003172);
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
    await expect(runHarness({ ...opts("openai_background_responses"), confirmSpendUsd: 0.0001 }, d)).rejects.toThrow();
    expect(calls.length).toBe(0);
  });
});

describe("OpenAI background responses", () => {
  test("cancelled status => confirmed, usage separated", async () => {
    const { d, calls } = deps((u) =>
      u.endsWith("/cancel")
        ? json({ id: "resp_1", status: "cancelled", usage: { input_tokens: 30, output_tokens: 12, output_tokens_details: { reasoning_tokens: 8 } } })
        : json({ id: "resp_1", status: "queued" }),
    );
    const { results } = await runHarness(opts("openai_background_responses"), d);
    const r = results[0]!;
    expect(r.outcome).toBe("cancelled_upstream_confirmed");
    expect(r.usage?.reasoningTokens).toBe(8);
    expect(r.confirmedBilledCostUsd).toBeNull();
    expect(creates(calls)).toBe(1);
    noLeak(results);
  });
  test("completed before cancel => already_completed", async () => {
    const { d } = deps((u) => (u.endsWith("/cancel") ? json({ status: "completed" }) : json({ id: "resp_1", status: "in_progress" })));
    expect((await runHarness(opts("openai_background_responses"), d)).results[0]!.outcome).toBe("already_completed");
  });
  test("cancel rejected and still running => cancel_failed, no retry create", async () => {
    const { d, calls } = deps((u, i) => (u.endsWith("/cancel") ? json({}, 500) : json({ id: "resp_1", status: "in_progress" })));
    const r = (await runHarness(opts("openai_background_responses"), d)).results[0]!;
    expect(r.outcome).toBe("cancel_failed");
    expect(creates(calls)).toBe(1);
  });
});

describe("Gemini background interactions", () => {
  test("cancelled => confirmed", async () => {
    const { d } = deps((u) => (u.endsWith("/cancel") ? json({ status: "cancelled" }) : json({ id: "int_1", status: "in_progress" })));
    expect((await runHarness(opts("gemini_background_interactions"), d)).results[0]!.outcome).toBe("cancelled_upstream_confirmed");
  });
  test("background not supported (400) => unsupported", async () => {
    const { d, calls } = deps(() => json({ error: {} }, 400));
    expect((await runHarness(opts("gemini_background_interactions"), d)).results[0]!.outcome).toBe("unsupported");
    expect(calls.length).toBe(1);
  });
});

describe("Streaming abort", () => {
  test("xAI abort is never reported as confirmed", async () => {
    const { d } = deps(() => sse([{ id: "x1", choices: [{ delta: { content: "Hi" } }] }]));
    expect((await runHarness(opts("xai_stream_abort"), d)).results[0]!.outcome).toBe("connection_aborted_unconfirmed");
  });
  test("xAI finished before abort => already_completed", async () => {
    const { d } = deps(() => sse([{ id: "x1", choices: [{ delta: {}, finish_reason: "stop" }] }], true));
    expect((await runHarness(opts("xai_stream_abort"), d)).results[0]!.outcome).toBe("already_completed");
  });
  test("OpenRouter cancelled=true => confirmed with billed total_cost", async () => {
    const { d, calls } = deps((u) =>
      u.includes("/generation?id=")
        ? json({ data: { id: "gen-1", cancelled: true, total_cost: 0.00001, native_tokens_prompt: 25, native_tokens_completion: 6, native_tokens_reasoning: 0 } })
        : sse([{ id: "gen-1", choices: [{ delta: { content: "A" } }] }]),
    );
    const r = (await runHarness(opts("openrouter_stream_abort"), d)).results[0]!;
    expect(r.outcome).toBe("cancelled_upstream_confirmed");
    expect(r.confirmedBilledCostUsd).toBe(0.00001);
    expect(r.usage?.outputTokens).toBe(6);
    expect(creates(calls)).toBe(1);
    noLeak(r);
  });
  test("OpenRouter cancelled=false => not confirmed", async () => {
    const { d } = deps((u) =>
      u.includes("/generation?id=") ? json({ data: { id: "gen-1", cancelled: false } }) : sse([{ id: "gen-1", choices: [{ delta: { content: "A" } }] }]),
    );
    expect((await runHarness(opts("openrouter_stream_abort"), d)).results[0]!.outcome).toBe("connection_aborted_unconfirmed");
  });
  test("thrown transport error => cancel_failed, no retry, no leak", async () => {
    const { d, calls } = deps(() => {
      throw new TypeError(`network ${SECRET}`);
    });
    const r = (await runHarness(opts("openrouter_stream_abort"), d)).results[0]!;
    expect(r.outcome).toBe("cancel_failed");
    expect(calls.length).toBe(1);
    noLeak(r);
  });
});
