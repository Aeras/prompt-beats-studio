/**
 * PromptBeats football odds core (integrated, adapted from owner-supplied standalone candidate).
 * Pure functions: no network, credentials, persistence, AI calls, or betting dispatch.
 */
export type OddsOutcome = { id: string; label: string; decimal: number };
export type OddsMarket = { id: string; providerMarketId: string; selections: OddsOutcome[] };
export type OddsFixture = {
  provider: "joj-stoiximan";
  id: string;
  leagueId: string;
  competition: string;
  home: string;
  away: string;
  kickoffUtc: string;
  observedAtUtc: string;
  markets: OddsMarket[];
};
export type ProviderFixture = { leagueId: string; home: string; away: string; kickoffUtc: string };
export type MatchResult =
  { status: "matched"; fixture: OddsFixture } | { status: "missing" | "ambiguous" | "conflict" };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function epoch(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function decimal(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 1 && value < 10000
    ? value
    : null;
}
/** Observed MRES/BTSC/DBLC/HCTG only. Unknown, half-time, DNB and promotional markets never inferred. */
export function parseJoJLeagueDataset(input: unknown): OddsFixture[] {
  const root = record(input);
  if (
    !root ||
    root["company"] !== "stoiximan" ||
    !["site_pregame_stoiximan_soccer_leagues.json", "site_pregame_stoiximan_soccer.json"].includes(
      str(root["file"]),
    )
  )
    throw new Error("Unexpected JoJ dataset identity");
  const observedAtUtc = str(root["updated_at"]);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(observedAtUtc) ||
    !Number.isFinite(Date.parse(observedAtUtc))
  )
    throw new Error("Invalid observedAt");
  const output: OddsFixture[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(root["data"]) ? root["data"] : [root["data"]]) {
    const payload = record(record(item)?.["data"]);
    if (!payload || !Array.isArray(payload["blocks"])) throw new Error("Malformed feed blocks");
    for (const rawBlock of arr(payload["blocks"])) {
      const block = record(rawBlock);
      if (!block) continue;
      for (const rawEvent of arr(block["events"])) {
        const event = record(rawEvent);
        if (!event) continue;
        const id = str(event["id"]),
          leagueId = str(event["leagueId"]);
        const home = str(record(arr(event["participants"])[0])?.["name"]);
        const away = str(record(arr(event["participants"])[1])?.["name"]);
        const kickoffUtc = epoch(event["startTime"]);
        if (
          !id ||
          !leagueId ||
          !home ||
          !away ||
          arr(event["participants"]).length !== 2 ||
          home === away ||
          !kickoffUtc ||
          event["sportId"] !== "FOOT" ||
          event["isSuspended"] === true ||
          event["isLive"] === true
        )
          continue;
        if (seen.has(id)) throw new Error("Duplicate event");
        const markets: OddsMarket[] = [];
        for (const rawMarket of arr(event["markets"])) {
          const market = record(rawMarket);
          if (
            !market ||
            market["isSuspended"] === true ||
            market["notes"] ||
            market["isPromo"] === true
          )
            continue;
          const type = str(market["type"]);
          const line = market["handicap"];
          const labels =
            type === "MRES"
              ? ["1", "X", "2"]
              : type === "BTSC"
                ? ["Yes", "No"]
                : type === "DBLC"
                  ? ["1X", "X2", "12"]
                  : type === "HCTG" && [1.5, 2.5, 3.5].includes(Number(line))
                    ? [`Over ${line}`, `Under ${line}`]
                    : [];
          if (!labels.length) continue;
          const marketKey =
            type === "MRES"
              ? "1x2"
              : type === "BTSC"
                ? "btts"
                : type === "DBLC"
                  ? "double_chance"
                  : `goals_${line}`;
          const selectionMap = new Map<string, OddsOutcome>();
          for (const rawSelection of arr(market["selections"])) {
            const selection = record(rawSelection);
            if (!selection) continue;
            const label = str(selection["name"]);
            const price = decimal(selection["price"]);
            if (
              !labels.includes(label) ||
              price === null ||
              !str(selection["id"]) ||
              selection["isSuspended"] === true ||
              selectionMap.has(label)
            ) {
              selectionMap.clear();
              break;
            }
            selectionMap.set(label, { id: str(selection["id"]), label, decimal: price });
          }
          if (
            selectionMap.size === labels.length &&
            arr(market["selections"]).length === labels.length &&
            str(market["id"])
          ) {
            markets.push({
              id: marketKey,
              providerMarketId: str(market["id"]),
              selections: labels.map((k) => selectionMap.get(k)!),
            });
          }
        }
        if (!markets.some((m) => m.id === "1x2")) continue;
        if (new Set(markets.map((m) => m.id)).size !== markets.length)
          throw new Error("Conflicting markets");
        output.push({
          provider: "joj-stoiximan",
          id,
          leagueId,
          competition: str(event["leagueName"]),
          home,
          away,
          kickoffUtc,
          observedAtUtc: new Date(observedAtUtc).toISOString(),
          markets,
        });
        seen.add(id);
      }
    }
  }
  return output;
}
/** Deterministic, curated equivalence only; no fuzzy matching or destructive suffix removal. */
const TEAM_EQUIVALENTS: Readonly<Record<string, string>> = {
  "arsenal fc": "arsenal",
  arsenal: "arsenal",
  "liverpool fc": "liverpool",
  liverpool: "liverpool",
  "manchester city fc": "manchester city",
  "manchester city": "manchester city",
  "manchester united fc": "manchester united",
  "manchester united": "manchester united",
  "aek athens": "aek athens",
  aek: "aek athens",
  "fc bayern munchen": "bayern munich",
  "bayern munich": "bayern munich",
  "real madrid cf": "real madrid",
  "real madrid": "real madrid",
};
export function teamIdentityKey(name: string): string {
  const key = name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  return TEAM_EQUIVALENTS[key] ?? key;
}
/**
 * Trust the upstream ESPN fixture identity. Market availability alone is never proof of a match.
 * `competitionEquivalence` must be an explicitly vetted mapping ESPN ID -> JoJ ID(s).
 */
export function matchJoJOdds(
  fixture: ProviderFixture,
  candidates: readonly OddsFixture[],
  competitionEquivalence: Readonly<Record<string, readonly string[]>>,
): MatchResult {
  const allowed = competitionEquivalence[fixture.leagueId] ?? [];
  const plausible = candidates.filter(
    (c) =>
      allowed.includes(c.leagueId) &&
      teamIdentityKey(c.home) === teamIdentityKey(fixture.home) &&
      teamIdentityKey(c.away) === teamIdentityKey(fixture.away),
  );
  if (plausible.length === 0) return { status: "missing" };
  const exactlyTimed = plausible.filter(
    (c) => Date.parse(c.kickoffUtc) === Date.parse(fixture.kickoffUtc),
  );
  if (exactlyTimed.length > 1) return { status: "ambiguous" };
  if (exactlyTimed.length === 0) return { status: "conflict" };
  return { status: "matched", fixture: exactlyTimed[0]! };
}
/** Returns margin and no-vig implied probabilities. These are market-implied, not model predictions. */
export function calculateNoVig(
  selections: readonly OddsOutcome[],
): { margin: number; probabilities: Record<string, number> } | null {
  if (selections.length < 2 || new Set(selections.map((s) => s.label)).size !== selections.length)
    return null;
  if (selections.some((s) => decimal(s.decimal) === null)) return null;
  const weights = selections.map((s) => 1 / s.decimal);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(sum) || sum < 1) return null;
  return {
    margin: sum - 1,
    probabilities: Object.fromEntries(selections.map((s, i) => [s.label, weights[i]! / sum])),
  };
}
/** An uncalibrated subjective percent must not be promoted to a verified value edge. */
export function compareSubjectiveToOdds(
  subjectivePercent: number | null,
  offeredDecimal: number,
  calibrated: boolean,
): {
  status: "unavailable" | "indicative_only" | "calibrated";
  breakEven: number;
  indicativeDifference: number | null;
} | null {
  const price = decimal(offeredDecimal);
  if (price === null) return null;
  const breakEven = 1 / price;
  if (
    subjectivePercent === null ||
    !Number.isFinite(subjectivePercent) ||
    subjectivePercent < 0 ||
    subjectivePercent > 100
  )
    return { status: "unavailable", breakEven, indicativeDifference: null };
  return {
    status: calibrated ? "calibrated" : "indicative_only",
    breakEven,
    indicativeDifference: subjectivePercent / 100 - breakEven,
  };
}
export function isFreshAt(observedAtUtc: string, nowUtc: string, maxAgeMinutes: number): boolean {
  const observed = Date.parse(observedAtUtc),
    now = Date.parse(nowUtc);
  return (
    Number.isFinite(observed) &&
    Number.isFinite(now) &&
    Number.isFinite(maxAgeMinutes) &&
    maxAgeMinutes >= 0 &&
    observed <= now &&
    now - observed <= maxAgeMinutes * 60_000
  );
}
