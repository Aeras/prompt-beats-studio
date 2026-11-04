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
  );
export const polarStatus = z.object(base).strict();
export type PolarAnalysis = z.infer<typeof polarAnalysis>;
