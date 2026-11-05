/** Synthetic constant-20-number history; not a production response or dataset. */
export function makePolar55Fixture(
  n = 11,
  k = 8,
  requested = 1000,
  method: "P00" | "F00" | "P01" = "P01",
) {
  if (!Number.isInteger(n) || n < 0 || n > 100000) throw Error("invalid_fixture_count");
  const point = (id: number) => ({ id, time: 1793491200000 + (id - 1) * 300000 });
  return {
    version: 1,
    source: "polar55",
    requested,
    loaded: n,
    stored: n,
    cutoff: n,
    lastObserved: null,
    snapshotAt: "2026-11-04T12:00:00Z",
    sha256: "a".repeat(64),
    rejected: 0,
    coverage: "COMPLETENESS_UNVERIFIED",
    partial: n < requested,
    backfill: "DISABLED",
    options: {
      op: "analysis" as const,
      n: requested,
      method,
      k,
      seed: "kino-lab-v1-retrospective",
    },
    result: {
      stats: {
        n,
        counts: Array.from({ length: 80 }, (_, i) => (i < 20 ? n : 0)),
        gaps: Array.from({ length: 80 }, (_, i) => (i < 20 && n > 0 ? 0 : null)),
        expected: n / 4,
        odd: n * 10,
        even: n * 10,
        low: n * 20,
        high: 0,
        observedNeighborOverlap: n > 1 ? 20 : null,
        dispersion: n > 0 ? n * 60 : null,
      },
      proposal: n > 0 ? Array.from({ length: k }, (_, i) => i + 1) : [],
      backtest: {
        n: Math.min(500, Math.max(0, n - 30)),
        warmupExcluded: Math.min(n, 30),
        meanHits: n > 30 ? k : null,
        uniformExpected: k / 4,
        uniformLift: n > 30 ? k - k / 4 : null,
        pairedDiff: n > 30 ? 0 : null,
        results: Array.from({ length: Math.min(500, Math.max(0, n - 30)) }, (_, i) => ({
          drawId: 31 + i,
          cutoff: point(31 + i).time,
          trainingCount: 30 + i,
          selected: Array.from({ length: k }, (_, j) => j + 1),
          baseline: Array.from({ length: k }, (_, j) => j + 1),
          hits: k,
          comparatorHits: k,
          pairedNullVariance: 0,
        })),
      },
      first: n > 0 ? point(1) : null,
      last: n > 0 ? point(n) : null,
    },
  };
}
