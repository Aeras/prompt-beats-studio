import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import opap from "./__fixtures__/kino-opap-1348454.json";
import {
  athensLabDayRange,
  filterLabDraws,
  KINO_LAB_MAX_BYTES,
  labBacktest,
  labHitVariance,
  labPairedVariance,
  labPick,
  labRandomPick,
  labStats,
  parseLabDraws,
  validateLabDraw,
} from "./kino-lab.shared";
const base = Date.parse("2026-11-01T00:00:00Z");
const raw = (
  id: number,
  numbers = Array.from({ length: 20 }, (_, i) => i + 1),
  time = base + id * 300000,
) => ({
  status: "results",
  gameId: 1100,
  drawId: id,
  drawTime: time,
  winningNumbers: { list: numbers, bonus: [numbers[0]] },
});
const dataset = (n: number) => Array.from({ length: n }, (_, i) => validateLabDraw(raw(i + 1)));
const options = {
  method: "P01" as const,
  k: 8,
  warmup: 30,
  maxTargets: 500,
  seed: "frozen-test-v1",
};
describe("KINO Lab completed-result validation", () => {
  test("real existing OPAP fixture, no Bonus/green double count", () => {
    const p = parseLabDraws(JSON.stringify(opap));
    expect(p.draws.length).toBe(1);
    expect(p.draws[0]!.numbers).toHaveLength(20);
    expect(labStats(p.draws).counts.reduce((a, b) => a + b, 0)).toBe(20);
    expect(p.completeness).toBe("COMPLETENESS_UNVERIFIED");
  });
  test("active, partial, duplicate numbers, other game and malformed optional fields reject", () => {
    for (const r of [
      { ...raw(1), status: "active" },
      { ...raw(1), gameId: 1110 },
      raw(1, Array(20).fill(1)),
      raw(1, [1, 2]),
      { ...raw(1), drawTime: "today" },
      { ...raw(1), winningNumbers: { list: raw(1).winningNumbers.list, secondChance: [1, 2, 3] } },
      { ...raw(1), winningNumbers: { list: raw(1).winningNumbers.list, bonus: [80] } },
    ])
      expect(() => validateLabDraw(r)).toThrow();
  });
  test("A→B→A remains quarantined with every observation retained", () => {
    const p = parseLabDraws(
      JSON.stringify([
        raw(1),
        raw(
          1,
          Array.from({ length: 20 }, (_, i) => i + 21),
        ),
        raw(1),
      ]),
    );
    expect(p.draws).toEqual([]);
    expect(p.observations).toHaveLength(3);
    expect(p.conflictingIds).toEqual([1]);
    expect(p.observations[0]!.content).toBe(p.observations[2]!.content);
    expect(p.observations[2]!.conflict).toBe(true);
  });
  test("time revisions conflict, exact duplicates deduplicate, invalid rows cannot poison valid IDs", () => {
    expect(parseLabDraws(JSON.stringify([raw(1), raw(1)])).draws).toHaveLength(1);
    expect(parseLabDraws(JSON.stringify([raw(1), raw(1, undefined, base)])).draws).toHaveLength(0);
    expect(
      parseLabDraws(JSON.stringify([raw(1), { ...raw(1), status: "active" }])).draws,
    ).toHaveLength(1);
  });
  test("bounded input with no raw error echo", () => {
    expect(() => parseLabDraws(" ".repeat(KINO_LAB_MAX_BYTES + 1))).toThrow("file_too_large");
    expect(() => parseLabDraws(JSON.stringify(Array(5001).fill({})))).toThrow("too_many_rows");
    const p = parseLabDraws(JSON.stringify([{ drawId: "<script>secret</script>" }]));
    expect(JSON.stringify(p.errors)).not.toContain("secret");
    expect(() => parseLabDraws("{broken")).toThrow();
  });
});
describe("frozen exploratory engine", () => {
  test("counts, left-censored gaps, parity and observed-neighbor overlap", () => {
    const s = labStats(dataset(2));
    expect(s.expected).toBe(0.5);
    expect(s.counts[0]).toBe(2);
    expect(s.odd).toBe(20);
    expect(s.gaps[79]).toBeNull();
    expect(s.observedNeighborOverlap).toBe(20);
  });
  test("reproducible unique in-range choices and deterministic frequency ties", () => {
    for (const k of [1, 5, 8, 12]) {
      const a = labRandomPick(k, "seed");
      expect(a).toEqual(labRandomPick(k, "seed"));
      expect(new Set(a).size).toBe(k);
      expect(a.every((n) => n >= 1 && n <= 80)).toBe(true);
    }
    expect(labPick(5, "F00", dataset(2), "seed")).toEqual([1, 2, 3, 4, 5]);
    expect(() => labPick(13, "P01", dataset(2), "seed")).toThrow();
    expect(() => labPick(8, "P03" as "P01", dataset(2), "seed")).toThrow();
    expect(() => labPick(8, "P01", [], "seed")).toThrow();
  });
  test("target/future mutations cannot change prior selected sets", () => {
    const d = dataset(150),
      r = labBacktest(d, options);
    const changed = [...d];
    changed[50] = validateLabDraw(
      raw(
        51,
        Array.from({ length: 20 }, (_, i) => i + 41),
      ),
    );
    const b = labBacktest(changed, options);
    expect(r.results.slice(0, 21).map((x) => x.selected)).toEqual(
      b.results.slice(0, 21).map((x) => x.selected),
    );
    expect(r.results[20]!.hits).not.toBe(b.results[20]!.hits);
    expect(r.n).toBe(120);
    expect(r.pairedDiff).toBe(0);
    expect(r.evidence).toBe("EXPLORATORY");
  });
  test("same-time records cannot enter each other's training", () => {
    const d = [
      ...dataset(31),
      validateLabDraw(
        raw(
          32,
          Array.from({ length: 20 }, (_, i) => i + 21),
          base + 31 * 300000,
        ),
      ),
    ];
    const r = labBacktest(d, options);
    expect(r.results).toHaveLength(2);
    expect(r.results.map((x) => x.trainingCount)).toEqual([30, 30]);
  });
  test("nonconsecutive IDs do not certify schedule or remove observed slots", () => {
    const d = dataset(40).map((r, i) => ({ ...r, id: i * 10 + 1 }));
    const r = labBacktest(d, options);
    expect(r.n).toBe(10);
    expect(r.scheduledSlots).toBeNull();
    expect(r.provenance).toBe("RETROSPECTIVE_POINT_IN_TIME_APPROXIMATE");
    expect(r.results.every((x) => x.selected.length === x.baseline.length)).toBe(true);
    expect(() => labBacktest([...d].reverse(), options)).toThrow();
  });
  test("rolling P01 and expanding F00 compare identical targets", () => {
    const d = [
      ...dataset(110),
      ...Array.from({ length: 100 }, (_, i) =>
        validateLabDraw(
          raw(
            111 + i,
            Array.from({ length: 20 }, (_, j) => j + 41),
          ),
        ),
      ),
    ];
    const r = labBacktest(d, options);
    for (const row of r.results) {
      const h = d.filter((x) => x.time < row.cutoff);
      expect(row.selected).toEqual(labPick(8, "P01", h, "unused"));
      expect(row.baseline).toEqual(labPick(8, "F00", h, "unused"));
    }
  });
  test("analytic hypergeometric and paired variance, invalid overlap rejected", () => {
    expect(labHitVariance(8)).toBeCloseTo(1.3670886075949367, 12);
    expect(labPairedVariance(8, 4)).toBeCloseTo(1.5189873417721518, 12);
    expect(labPairedVariance(8, 8)).toBe(0);
    expect(() => labPairedVariance(8, 9)).toThrow();
    expect(() => labHitVariance(0)).toThrow();
  });
  test("iid null sanity and injected positive sentinel are distinct, not efficacy evidence", () => {
    const iid = Array.from({ length: 1000 }, (_, i) =>
      validateLabDraw(raw(i + 1, labRandomPick(20, `iid-${i}`))),
    );
    const r = labBacktest(iid, options);
    expect(Math.abs(r.meanHits! - 2)).toBeLessThan(0.25);
    const biased = labBacktest(dataset(1000), options);
    expect(biased.meanHits).toBe(8);
    expect(r.evidence).toBe("EXPLORATORY");
    expect(biased.evidence).toBe("EXPLORATORY");
  });
});
describe("UTC and Greek calendar windows", () => {
  test("Greek DST days span 23 and 25 hours, half-open range", () => {
    const spring = athensLabDayRange("2026-03-29"),
      fall = athensLabDayRange("2026-10-25");
    expect(spring.end - spring.start).toBe(23 * 3600000);
    expect(fall.end - fall.start).toBe(25 * 3600000);
    const d = [
      validateLabDraw(raw(1, undefined, spring.start)),
      validateLabDraw(raw(2, undefined, spring.end)),
    ];
    expect(filterLabDraws(d, { kind: "day", day: "2026-03-29" }).map((x) => x.id)).toEqual([1]);
    expect(() => athensLabDayRange("2026-02-30")).toThrow();
  });
  test("explicit UTC, latest-N and malformed intervals", () => {
    expect(filterLabDraws(dataset(50), { kind: "latest", n: 10 })).toHaveLength(10);
    expect(() => filterLabDraws(dataset(5), { kind: "latest", n: NaN })).toThrow();
    expect(() =>
      filterLabDraws(dataset(5), {
        kind: "utc",
        start: "2026-11-01T00:00:00",
        end: "2026-11-02T00:00:00",
      }),
    ).toThrow("utc_required");
    expect(() =>
      filterLabDraws(dataset(5), {
        kind: "utc",
        start: "2026-11-02T00:00:00Z",
        end: "2026-11-01T00:00:00Z",
      }),
    ).toThrow();
  });
});
test("actual server access handler rejects missing/stale role and RPC failures before returning permission", async () => {
  const source = readFileSync(new URL("./kino-lab.functions.ts", import.meta.url), "utf8");
  const module = {
    exports: {} as Record<
      string,
      { middleware: unknown[]; handler: (arg: unknown) => Promise<unknown> }
    >,
  };
  const marker = Symbol("authenticated-middleware");
  const createServerFn = () => ({
    middleware: (m: unknown[]) => ({ handler: (h: unknown) => ({ middleware: m, handler: h }) }),
  });
  runInNewContext(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    {
      exports: module.exports,
      require: (name: string) =>
        name.includes("auth-middleware") ? { requireSupabaseAuth: marker } : { createServerFn },
    },
  );
  const fn = module.exports["getPrivateKinoLabAccess"]!;
  expect(fn.middleware).toEqual([marker]);
  for (const response of [
    { data: false, error: null },
    { data: null, error: null },
    { data: true, error: Error("offline") },
  ])
    await expect(
      fn.handler({
        context: {
          supabase: {
            rpc: async (name: string) =>
              name === "get_my_account_status"
                ? { data: { status: "active", is_banned: false }, error: null }
                : response,
          },
        },
      }),
    ).rejects.toThrow("Not allowed");
  for (const data of [
    null,
    { status: "blocked", is_banned: true },
    { status: "invalid", is_banned: false },
    { status: "active", is_banned: true },
    { status: "active" },
  ])
    await expect(
      fn.handler({ context: { supabase: { rpc: async () => ({ data, error: null }) } } }),
    ).rejects.toThrow("Not allowed");
  await expect(
    fn.handler({
      context: {
        supabase: {
          rpc: async () => ({
            data: { status: "active", is_banned: false },
            error: Error("offline"),
          }),
        },
      },
    }),
  ).rejects.toThrow("Not allowed");
  expect(
    await fn.handler({
      context: {
        supabase: {
          rpc: async (name: string) => {
            if (name === "get_my_account_status")
              return { data: { status: "active", is_banned: false }, error: null };
            expect(name).toBe("current_user_is_super_admin");
            return { data: true, error: null };
          },
        },
      },
    }),
  ).toEqual({ allowed: true, mode: "offline-exploratory" });
});
