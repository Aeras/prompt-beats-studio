import { expect, test } from "bun:test";
import { KINO_HISTORY_WINDOWS, KINO_PICK_SIZES, kinoHeatmapLevels } from "./kino-lab.presentation";
import { polarAnalysis, polarRequest } from "./kino-polar55.shared";
import { makePolar55Fixture } from "./__fixtures__/kino-polar55-analysis";
import { filterLabDraws, labPick, type LabDraw } from "./kino-lab.shared";

test("four observed-range levels preserve zeros, ties and exact boundaries", () => {
  expect(kinoHeatmapLevels(Array(80).fill(0))).toEqual(Array(80).fill(0));
  expect(kinoHeatmapLevels(Array(80).fill(50000))).toEqual(Array(80).fill(0));
  const counts = Array.from({ length: 80 }, (_, i) => i % 5);
  expect(kinoHeatmapLevels(counts)).toEqual(counts.map((c) => Math.min(3, c)));
  const shifted = counts.map((c) => c + 10);
  expect(kinoHeatmapLevels(shifted)).toEqual(kinoHeatmapLevels(counts));
  expect(kinoHeatmapLevels(counts.map((c) => c * 25000))).toEqual(kinoHeatmapLevels(counts));
  for (const invalid of [Array(79).fill(0), Array(80).fill(-1), Array(80).fill(NaN)])
    expect(() => kinoHeatmapLevels(invalid)).toThrow();
});

test("all twelve windows and all pick sizes bind to the actual strict wire contract", () => {
  expect(KINO_HISTORY_WINDOWS).toEqual([
    5, 10, 20, 50, 100, 200, 500, 1000, 5000, 20000, 50000, 100000,
  ]);
  expect(KINO_PICK_SIZES).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  for (const n of KINO_HISTORY_WINDOWS)
    for (const k of KINO_PICK_SIZES)
      for (const method of ["P00", "F00", "P01"] as const)
        expect(polarRequest.parse({ op: "analysis", n, k, method, seed: "test" })).toEqual({
          op: "analysis",
          n,
          k,
          method,
          seed: "test",
        });
  for (const k of [0, 13, 5.5, "5", null])
    expect(
      polarRequest.safeParse({ op: "analysis", n: 5, k, method: "P01", seed: "test" }).success,
    ).toBe(false);
});

test("partial histories preserve requested window and twelve-number response integrity", () => {
  const fixture = makePolar55Fixture();
  const value = {
    ...fixture,
    requested: 100000,
    options: { ...fixture.options, n: 100000, k: 12 },
    result: {
      ...fixture.result,
      proposal: Array.from({ length: 12 }, (_, i) => i + 1),
      backtest: { ...fixture.result.backtest, uniformExpected: 3 },
    },
  };
  expect(polarAnalysis.parse(value).loaded).toBe(11);
  expect(polarAnalysis.safeParse({ ...value, partial: false }).success).toBe(false);
  expect(
    polarAnalysis.safeParse({ ...value, result: { ...value.result, proposal: [1] } }).success,
  ).toBe(false);
});

test("local small-file mode reports available samples without capping the chosen window", () => {
  const draws: LabDraw[] = Array.from({ length: 65 }, (_, i) => ({
    id: i + 1,
    time: 1793491200000 + i * 300000,
    numbers: Array.from({ length: 20 }, (_, n) => n + 1),
  }));
  for (const n of KINO_HISTORY_WINDOWS)
    expect(filterLabDraws(draws, { kind: "latest", n })).toHaveLength(Math.min(n, 65));
  for (const k of KINO_PICK_SIZES)
    for (const method of ["P00", "F00", "P01"] as const) {
      const result = labPick(k, method, draws, "fixture");
      expect(result).toHaveLength(k);
      expect(new Set(result).size).toBe(k);
    }
});
