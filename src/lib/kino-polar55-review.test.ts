import { expect, test } from "bun:test";
import { readPolar55 } from "./kino-polar55.server";
import { polarAnalysis } from "./kino-polar55.shared";
import { makePolar55Fixture } from "./__fixtures__/kino-polar55-analysis";

const options = {
  op: "analysis" as const,
  n: 1000 as const,
  method: "P01" as const,
  k: 8 as const,
  seed: "kino-lab-v1-retrospective",
};
const env = {
  KINO_POLAR55_ENABLED: "true",
  KINO_POLAR55_READ_TOKEN: "synthetic-review-only-".repeat(4),
};
test("review: inconsistent metadata/statistics never escape the proxy", async () => {
  expect(polarAnalysis.safeParse(makePolar55Fixture(1)).success).toBe(true);
  expect(
    (
      await readPolar55("owner", options, {
        env,
        fetch: async () => Response.json(makePolar55Fixture(1)),
      })
    ).status,
  ).toBe("ok");
  expect(polarAnalysis.safeParse(makePolar55Fixture(0)).success).toBe(true);
  const wrongWindow = makePolar55Fixture(1);
  wrongWindow.requested = 5000;
  const wrongCounts = makePolar55Fixture(1);
  wrongCounts.result.stats.counts = Array(80).fill(0);
  const wrongProposal = makePolar55Fixture(1);
  wrongProposal.result.proposal = [1];
  const wrongInterval = makePolar55Fixture(1);
  wrongInterval.result.first!.time++;
  const wrongGaps = makePolar55Fixture(1);
  wrongGaps.result.stats.gaps[0] = null;
  const repeatedId = makePolar55Fixture(2);
  repeatedId.result.last!.id = 1;
  for (const value of [
    wrongWindow,
    wrongCounts,
    wrongProposal,
    wrongInterval,
    wrongGaps,
    repeatedId,
  ]) {
    let calls = 0;
    const result = await readPolar55("owner", options, {
      env,
      fetch: async () => {
        calls++;
        return Response.json(value);
      },
    });
    expect(result).toEqual({ status: "unavailable" });
    expect(calls).toBe(1);
  }
});
test("review: oversized body with stalled cancellation cannot hang the result", async () => {
  let release = () => undefined as void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(300001));
    },
    cancel() {
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    },
  });
  let settled = false;
  const pending = readPolar55("owner", options, {
    env,
    fetch: async () => new Response(body, { headers: { "Content-Type": "application/json" } }),
  }).then((v) => {
    settled = true;
    return v;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const observed = settled;
  release();
  expect(await pending).toEqual({ status: "unavailable" });
  expect(observed).toBe(true);
});
