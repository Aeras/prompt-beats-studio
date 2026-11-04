import { z } from "zod";

export const POLAR_WINDOWS = [1000, 5000, 20000, 50000, 100000] as const;
export const polarRequest = z.discriminatedUnion("op", [
  z.object({ op: z.literal("status") }).strict(),
  z
    .object({
      op: z.literal("analysis"),
      n: z.union(POLAR_WINDOWS.map((n) => z.literal(n))),
      method: z.enum(["P00", "F00", "P01"]),
      k: z.union([z.literal(5), z.literal(8), z.literal(10)]),
      seed: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    })
    .strict(),
]);
const count = z.number().int().min(0).max(200000),
  num = z.number().int().min(1).max(80),
  time = z.number().int().min(1000000000000).max(4099999999999),
  point = z.object({ id: z.number().int().positive(), time }).strict();
const base = {
  version: z.literal(1),
  source: z.literal("polar55"),
  stored: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  lastObserved: z.string().max(40).nullable(),
  coverage: z.literal("COMPLETENESS_UNVERIFIED"),
  backfill: z.literal("DISABLED"),
};
const picks = z
  .array(num)
  .max(10)
  .refine((v) => new Set(v).size === v.length);
export const polarAnalysis = z
  .object({
    ...base,
    requested: z.union(POLAR_WINDOWS.map((n) => z.literal(n))),
    loaded: count,
    cutoff: z.number().int().nonnegative(),
    snapshotAt: z.string().max(40),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    rejected: count,
    partial: z.boolean(),
    options: polarRequest,
    result: z
      .object({
        stats: z
          .object({
            n: count,
            counts: z.array(count).length(80),
            gaps: z.array(count.nullable()).length(80),
            expected: z.number().nonnegative(),
            odd: z.number().int().nonnegative(),
            even: z.number().int().nonnegative(),
            low: z.number().int().nonnegative(),
            high: z.number().int().nonnegative(),
            observedNeighborOverlap: z.number().min(0).max(20).nullable(),
            dispersion: z.number().nonnegative().nullable(),
          })
          .strict(),
        proposal: picks,
        backtest: z
          .object({
            n: z.number().int().min(0).max(500),
            warmupExcluded: count,
            meanHits: z.number().min(0).max(10).nullable(),
            uniformExpected: z.number(),
            uniformLift: z.number().nullable(),
            pairedDiff: z.number().nullable(),
            results: z
              .array(
                z
                  .object({
                    drawId: z.number().int().positive(),
                    cutoff: time,
                    trainingCount: count,
                    selected: picks,
                    baseline: picks,
                    hits: z.number().int().min(0).max(10),
                    comparatorHits: z.number().int().min(0).max(10),
                    pairedNullVariance: z.number().nonnegative(),
                  })
                  .strict(),
              )
              .max(500),
          })
          .strict(),
        first: point.nullable(),
        last: point.nullable(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (v) =>
      v.loaded === v.result.stats.n &&
      v.loaded <= v.requested &&
      v.partial === v.loaded < v.requested &&
      v.result.backtest.n === v.result.backtest.results.length,
  )
  .refine(
    (v) => {
      const o = v.options,
        s = v.result.stats,
        b = v.result.backtest,
        n = v.loaded;
      if (o.op !== "analysis" || v.requested !== o.n || n > v.stored) return false;
      const near = (a: number | null, expected: number) =>
        a !== null && Math.abs(a - expected) <= 1e-8 * Math.max(1, Math.abs(expected));
      if (
        s.counts.some((c) => c > n) ||
        s.gaps.some((g, i) => (s.counts[i] === 0) !== (g === null)) ||
        s.gaps.some((g) => g !== null && g >= n) ||
        s.counts.reduce((a, c) => a + c, 0) !== n * 20 ||
        s.expected !== n / 4
      )
        return false;
      const odd = s.counts.reduce((a, c, i) => a + (i % 2 === 0 ? c : 0), 0),
        low = s.counts.slice(0, 40).reduce((a, c) => a + c, 0);
      if (s.odd !== odd || s.even !== n * 20 - odd || s.low !== low || s.high !== n * 20 - low)
        return false;
      if (n <= 1 ? s.observedNeighborOverlap !== null : s.observedNeighborOverlap === null)
        return false;
      if (
        n === 0
          ? s.dispersion !== null
          : !near(
              s.dispersion,
              s.counts.reduce((a, c) => a + (c - n / 4) ** 2 / (n / 4), 0),
            )
      )
        return false;
      const first = v.result.first,
        last = v.result.last;
      if (n === 0) {
        if (first !== null || last !== null || v.result.proposal.length !== 0) return false;
      } else {
        if (
          !first ||
          !last ||
          first.id > v.cutoff ||
          last.id > v.cutoff ||
          first.time > last.time ||
          v.result.proposal.length !== o.k
        )
          return false;
        if (
          n === 1
            ? first.id !== last.id || first.time !== last.time
            : first.id === last.id || (first.time === last.time && first.id >= last.id)
        )
          return false;
      }
      if (
        b.warmupExcluded > n ||
        b.n !== Math.min(500, n - b.warmupExcluded) ||
        b.uniformExpected !== o.k / 4
      )
        return false;
      if (b.n === 0) return b.meanHits === null && b.uniformLift === null && b.pairedDiff === null;
      const ids = new Set<number>();
      let hits = 0,
        comparators = 0;
      for (const [i, row] of b.results.entries()) {
        if (
          ids.has(row.drawId) ||
          row.drawId > v.cutoff ||
          row.selected.length !== o.k ||
          row.baseline.length !== o.k ||
          row.hits > o.k ||
          row.comparatorHits > o.k ||
          row.trainingCount < 30 ||
          row.trainingCount >= n ||
          !first ||
          !last ||
          row.cutoff < first.time ||
          row.cutoff > last.time
        )
          return false;
        const previous = b.results[i - 1];
        if (
          previous &&
          (previous.cutoff > row.cutoff ||
            (previous.cutoff === row.cutoff && previous.drawId >= row.drawId) ||
            previous.trainingCount > row.trainingCount)
        )
          return false;
        const overlap = row.selected.filter((x) => row.baseline.includes(x)).length;
        if (!near(row.pairedNullVariance, (2 * (o.k - overlap) * 0.25 * 0.75 * 80) / 79))
          return false;
        ids.add(row.drawId);
        hits += row.hits;
        comparators += row.comparatorHits;
      }
      return (
        near(b.meanHits, hits / b.n) &&
        near(b.uniformLift, hits / b.n - o.k / 4) &&
        near(b.pairedDiff, (hits - comparators) / b.n)
      );
    },
    { message: "Inconsistent analysis response" },
  );
export const polarStatus = z.object(base).strict();
export type PolarAnalysis = z.infer<typeof polarAnalysis>;
