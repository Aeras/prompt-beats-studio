/** Synthetic constant-20-number history; not a production response or dataset. */
export function makePolar55Fixture(n = 11) {
  if (!Number.isInteger(n) || n < 0 || n > 30) throw Error("invalid_fixture_count");
  const point = (id: number) => ({ id, time: 1793491200000 + (id - 1) * 300000 });
  return {
    version: 1,
    source: "polar55",
    requested: 1000,
    loaded: n,
    stored: n,
    cutoff: n,
    lastObserved: null,
    snapshotAt: "2026-11-04T12:00:00Z",
    sha256: "a".repeat(64),
    rejected: 0,
    coverage: "COMPLETENESS_UNVERIFIED",
    partial: true,
    backfill: "DISABLED",
    options: {
      op: "analysis" as const,
      n: 1000 as const,
      method: "P01" as const,
      k: 8 as const,
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
      proposal: n > 0 ? [1, 2, 3, 4, 5, 6, 7, 8] : [],
      backtest: {
        n: 0,
        warmupExcluded: n,
        meanHits: null,
        uniformExpected: 2,
        uniformLift: null,
        pairedDiff: null,
        results: [],
      },
      first: n > 0 ? point(1) : null,
      last: n > 0 ? point(n) : null,
    },
  };
}
