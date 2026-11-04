/** Versioned, deterministic local research. No network, betting or prospective eligibility. */
export const KINO_LAB_VERSION = "kino-lab-1.0.0";
export const KINO_LAB_MAX_BYTES = 4 * 1024 * 1024;
export const KINO_LAB_MAX_ROWS = 5000;
export type LabDraw = Readonly<{ id: number; time: number; numbers: readonly number[] }>;
export type LabMethod = "P00" | "F00" | "P01";
export type LabObservation = { index: number; drawId: number; content: string; conflict: boolean };
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const validNumber = (v: unknown): v is number => integer(v) && v >= 1 && v <= 80;
const validK = (k: number) => {
  if (!integer(k) || k < 1 || k > 12) throw Error("invalid_k");
};
export function validateLabDraw(raw: unknown): LabDraw {
  const d = obj(raw),
    winning = obj(d?.["winningNumbers"]);
  const numbers = winning?.["list"] ?? d?.["results"];
  if (
    !d ||
    d["status"] !== "results" ||
    (d["gameId"] !== undefined && d["gameId"] !== 1100) ||
    !integer(d["drawId"]) ||
    d["drawId"] <= 0 ||
    !integer(d["drawTime"]) ||
    d["drawTime"] <= 0 ||
    d["drawTime"] >= 4100000000000 ||
    !Array.isArray(numbers) ||
    numbers.length !== 20 ||
    !numbers.every(validNumber) ||
    new Set(numbers).size !== 20
  )
    throw Error("invalid_completed_draw");
  const bonus = winning?.["bonus"],
    second = winning?.["secondChance"];
  if (
    bonus !== undefined &&
    (!Array.isArray(bonus) || bonus.length !== 1 || !numbers.includes(bonus[0]))
  )
    throw Error("invalid_bonus");
  if (
    second !== undefined &&
    (!Array.isArray(second) ||
      second.length !== 3 ||
      !second.every(validNumber) ||
      new Set(second).size !== 3 ||
      second.some((v) => numbers.includes(v)))
  )
    throw Error("invalid_second_chance");
  return Object.freeze({
    id: d["drawId"],
    time: d["drawTime"],
    numbers: Object.freeze([...numbers].sort((a, b) => a - b)),
  });
}
export function parseLabDraws(text: string) {
  if (new TextEncoder().encode(text).byteLength > KINO_LAB_MAX_BYTES) throw Error("file_too_large");
  const payload: unknown = JSON.parse(text),
    p = obj(payload);
  const items: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(p?.["draws"])
      ? p["draws"]
      : Array.isArray(p?.["content"])
        ? p["content"]
        : p?.["last"]
          ? [p["last"]]
          : [payload];
  if (items.length > KINO_LAB_MAX_ROWS) throw Error("too_many_rows");
  const seen = new Map<number, LabDraw>(),
    blocked = new Set<number>(),
    observations: LabObservation[] = [];
  const errors: Array<{ index: number; reason: string }> = [];
  for (const [index, item] of items.entries()) {
    try {
      const d = validateLabDraw(item),
        old = seen.get(d.id),
        content = JSON.stringify(d);
      const conflict = blocked.has(d.id) || (!!old && JSON.stringify(old) !== content);
      observations.push({ index, drawId: d.id, content, conflict });
      if (conflict) {
        blocked.add(d.id);
        seen.delete(d.id);
        errors.push({ index, reason: "conflicting_draw" });
      } else seen.set(d.id, d);
    } catch {
      errors.push({ index, reason: "invalid_completed_draw" });
    }
  }
  return {
    draws: [...seen.values()].sort((a, b) => a.time - b.time || a.id - b.id),
    errors,
    observations,
    requested: items.length,
    conflictingIds: [...blocked],
    completeness: "COMPLETENESS_UNVERIFIED" as const,
    historicalAvailability: "RETROSPECTIVE_POINT_IN_TIME_APPROXIMATE" as const,
  };
}
export type LabDataset = ReturnType<typeof parseLabDraws>;
function ordered(draws: readonly LabDraw[]) {
  if (
    draws.length > KINO_LAB_MAX_ROWS ||
    new Set(draws.map((d) => d.id)).size !== draws.length ||
    draws.some((d, i) => i > 0 && draws[i - 1]!.time > d.time)
  )
    throw Error("invalid_history_order");
}
export function labStats(draws: readonly LabDraw[]) {
  ordered(draws);
  const counts = Array<number>(80).fill(0),
    gaps: Array<number | null> = Array(80).fill(null);
  let odd = 0,
    low = 0,
    overlaps = 0;
  for (const [i, d] of draws.entries()) {
    const numbers = new Set(d.numbers);
    for (let n = 1; n <= 80; n++) {
      if (numbers.has(n)) {
        counts[n - 1] = counts[n - 1]! + 1;
        gaps[n - 1] = 0;
      } else if (gaps[n - 1] !== null) gaps[n - 1] = gaps[n - 1]! + 1;
    }
    for (const n of d.numbers) {
      if (n % 2) odd++;
      if (n <= 40) low++;
    }
    if (i > 0) overlaps += d.numbers.filter((n) => draws[i - 1]!.numbers.includes(n)).length;
  }
  const expected = draws.length / 4;
  return {
    n: draws.length,
    counts,
    gaps,
    expected,
    odd,
    even: draws.length * 20 - odd,
    low,
    high: draws.length * 20 - low,
    observedNeighborOverlap: draws.length > 1 ? overlaps / (draws.length - 1) : null,
    dispersion: expected ? counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0) : null,
  };
}
function rng(seed: string) {
  if (!seed || seed.length > 200) throw Error("invalid_seed");
  let x = 2166136261;
  for (const c of seed) {
    x ^= c.charCodeAt(0);
    x = Math.imul(x, 16777619);
  }
  x = x >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
/** Reproducibility PRNG inherited from the starter; not security/betting randomness. */
export function labRandomPick(k: number, seed: string): number[] {
  if (!integer(k) || k < 1 || k > 80) throw Error("invalid_random_size");
  const random = rng(seed),
    a = Array.from({ length: 80 }, (_, i) => i + 1);
  for (let i = 79; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, k).sort((a, b) => a - b);
}
const ranked = (counts: readonly number[], n: number, k: number) =>
  counts
    .map((c, i) => ({ num: i + 1, score: (c + 8 * 0.25) / (n + 8) }))
    .sort((a, b) => b.score - a.score || a.num - b.num)
    .slice(0, k)
    .map((x) => x.num)
    .sort((a, b) => a - b);
export function labPick(k: number, method: LabMethod, history: readonly LabDraw[], seed: string) {
  validK(k);
  ordered(history);
  if (method === "P00") return labRandomPick(k, seed);
  if (method !== "F00" && method !== "P01") throw Error("unsupported_method");
  if (!history.length) throw Error("history_required");
  const selected = method === "P01" ? history.slice(-100) : history;
  return ranked(labStats(selected).counts, selected.length, k);
}
export function labHitVariance(k: number) {
  validK(k);
  return (k * 0.25 * 0.75 * (80 - k)) / 79;
}
export function labPairedVariance(k: number, m: number) {
  validK(k);
  if (!integer(m) || m < 0 || m > k) throw Error("invalid_overlap");
  return (2 * (k - m) * 0.25 * 0.75 * 80) / 79;
}
/** Retrospective archive order only: no assumption of historical source availability. */
export function labBacktest(
  draws: readonly LabDraw[],
  options: { method: LabMethod; k: number; warmup: number; maxTargets: number; seed: string },
) {
  const { method, k, warmup, maxTargets, seed } = options;
  validK(k);
  ordered(draws);
  rng(seed);
  if (
    !["P00", "F00", "P01"].includes(method) ||
    !integer(warmup) ||
    warmup < 1 ||
    !integer(maxTargets) ||
    maxTargets < 1 ||
    maxTargets > 500
  )
    throw Error("invalid_protocol");
  const results: Array<{
    drawId: number;
    cutoff: number;
    trainingCount: number;
    selected: number[];
    baseline: number[];
    hits: number;
    comparatorHits: number;
    pairedNullVariance: number;
  }> = [];
  const expanding = Array<number>(80).fill(0),
    recent = Array<number>(80).fill(0);
  let historyEnd = 0,
    recentStart = 0,
    warmupExcluded = 0;
  for (const target of draws) {
    // Equal timestamps never enter each other's features. ID adjacency is not schedule proof.
    while (historyEnd < draws.length && draws[historyEnd]!.time < target.time) {
      for (const n of draws[historyEnd]!.numbers) {
        expanding[n - 1] = expanding[n - 1]! + 1;
        recent[n - 1] = recent[n - 1]! + 1;
      }
      historyEnd++;
      while (historyEnd - recentStart > 100) {
        for (const n of draws[recentStart]!.numbers) recent[n - 1] = recent[n - 1]! - 1;
        recentStart++;
      }
    }
    if (historyEnd < warmup) {
      warmupExcluded++;
      continue;
    }
    if (results.length >= maxTargets) break;
    const baseline = ranked(expanding, historyEnd, k);
    const selected =
      method === "P00"
        ? labRandomPick(k, `${seed}:${target.id}`)
        : ranked(
            method === "P01" ? recent : expanding,
            method === "P01" ? historyEnd - recentStart : historyEnd,
            k,
          );
    const hits = (p: number[]) => p.filter((n) => target.numbers.includes(n)).length;
    const overlap = selected.filter((n) => baseline.includes(n)).length;
    results.push({
      drawId: target.id,
      cutoff: target.time,
      trainingCount: historyEnd,
      selected,
      baseline,
      hits: hits(selected),
      comparatorHits: hits(baseline),
      pairedNullVariance: labPairedVariance(k, overlap),
    });
  }
  const n = results.length,
    mean = n ? results.reduce((s, r) => s + r.hits, 0) / n : null;
  return {
    version: KINO_LAB_VERSION,
    options: { ...options },
    n,
    warmupExcluded,
    scheduledSlots: null,
    meanHits: mean,
    uniformExpected: k / 4,
    uniformLift: mean === null ? null : mean - k / 4,
    pairedDiff: n ? results.reduce((s, r) => s + r.hits - r.comparatorHits, 0) / n : null,
    results,
    provenance: "RETROSPECTIVE_POINT_IN_TIME_APPROXIMATE" as const,
    evidence: n ? ("EXPLORATORY" as const) : ("INSUFFICIENT_DATA" as const),
  };
}
const athensParts = (time: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
function validDay(day: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day
  )
    throw Error("invalid_day");
}
export function athensLabDayRange(day: string) {
  validDay(day);
  // Binary-search actual IANA calendar transitions; does not assume a 24-hour Greek day.
  const center = Date.parse(day + "T00:00:00Z");
  const boundary = (after: boolean) => {
    let lo = center - 24 * 3600000,
      hi = center + 48 * 3600000;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2),
        date = athensParts(mid);
      if (after ? date <= day : date < day) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return { start: boundary(false), end: boundary(true) };
}
export type LabFilter =
  | { kind: "latest"; n: number }
  | { kind: "day"; day: string }
  | { kind: "utc"; start: string; end: string };
function strictUtc(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?Z$/.test(value))
    throw Error("utc_required");
  const parsed = Date.parse(value);
  if (
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 16) !== value.slice(0, 16)
  )
    throw Error("invalid_interval");
  return parsed;
}
export function filterLabDraws(draws: readonly LabDraw[], filter: LabFilter) {
  ordered(draws);
  if (filter.kind === "latest") {
    if (!integer(filter.n) || filter.n < 1 || filter.n > KINO_LAB_MAX_ROWS)
      throw Error("invalid_window");
    return draws.slice(-filter.n);
  }
  const range =
    filter.kind === "day"
      ? athensLabDayRange(filter.day)
      : { start: strictUtc(filter.start), end: strictUtc(filter.end) };
  if (filter.kind === "utc" && (!/Z$/.test(filter.start) || !/Z$/.test(filter.end)))
    throw Error("utc_required");
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start)
    throw Error("invalid_interval");
  return draws.filter((d) => d.time >= range.start && d.time < range.end);
}
