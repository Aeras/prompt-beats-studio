import { footballSourceJson, FootballSourceError } from "./football-source-http.server";
import { ESPN_LEAGUE_CODES } from "./football-espn.server";
import {
  footballEspnContextSchema,
  type FootballEspnContext,
} from "./football-espn-context.shared";
import type { FootballAiDiscoveryLeagueId, FootballFixture } from "./football-research.shared";

/** Undocumented ESPN endpoints: fixed origin, bounded responses, no key or retries. */
type JsonRecord = Record<string, unknown>;
const record = (x: unknown): JsonRecord =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as JsonRecord) : {};
const array = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown, limit = 160): string =>
  typeof x === "string"
    ? x.slice(0, limit)
    : typeof x === "number" && Number.isFinite(x)
      ? String(x)
      : "";
const id = (x: unknown) => str(x, 24);
const numeric = (raw: unknown): number | null => {
  const x =
    raw && typeof raw === "object" ? (record(raw)["value"] ?? record(raw)["displayValue"]) : raw;
  if (typeof x !== "string" && typeof x !== "number") return null;
  if (typeof x === "string" && !/^\d{1,2}$/.test(x)) return null;
  const n = Number(x);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : null;
};
const metricList = (raw: unknown, max: number) =>
  array(raw)
    .slice(0, max)
    .map((v) => {
      const x = record(v);
      return {
        name: str(x["displayName"] ?? x["name"] ?? x["abbreviation"], 80),
        value: str(x["displayValue"] ?? x["value"] ?? x["summary"] ?? x["stat"], 100),
      };
    })
    .filter((v) => v.name && v.value);

export function parseEspnStandings(body: unknown) {
  const found: Array<{
    teamId: string;
    name: string;
    rank: number | null;
    metrics: ReturnType<typeof metricList>;
  }> = [];
  const pending: unknown[] = [body];
  let walked = 0;
  while (pending.length && walked++ < 300) {
    const node = record(pending.shift());
    const entries = array(node["entries"]);
    for (const raw of entries.slice(0, 100)) {
      const row = record(raw);
      const team = record(row["team"]);
      const teamId = id(team["id"]);
      if (!teamId) continue;
      const metrics = metricList(row["stats"], 60);
      const rank = Number(
        row["rank"] ?? metrics.find((m) => m.name.toLowerCase() === "rank")?.value,
      );
      found.push({
        teamId,
        name: str(team["displayName"] ?? team["name"]),
        rank: Number.isInteger(rank) && rank > 0 && rank <= 200 ? rank : null,
        metrics,
      });
    }
    for (const child of array(node["children"]).slice(0, 50)) pending.push(child);
    if (node["standings"]) pending.push(node["standings"]);
  }
  return found;
}

export function parseEspnRecentResults(body: unknown, teamId: string, cutoff: string) {
  const games: FootballEspnContext["home"]["recentResults"] = [];
  for (const raw of array(record(body)["events"]).slice(0, 120)) {
    const ev = record(raw);
    const kickoffUtc = str(ev["date"], 40);
    const timestamp = Date.parse(kickoffUtc);
    if (!Number.isFinite(timestamp) || timestamp >= Date.parse(cutoff)) continue;
    const competition = record(array(ev["competitions"])[0]);
    const competitors = array(competition["competitors"]).map(record);
    const own = competitors.find((c) => id(record(c["team"])["id"]) === teamId);
    const other = competitors.find((c) => id(record(c["team"])["id"]) !== teamId);
    if (!own || !other || !id(record(other["team"])["id"])) continue;
    const goalsFor = numeric(own["score"]);
    const goalsAgainst = numeric(other["score"]);
    const state = record(record(competition["status"])["type"]);
    const eventState = record(record(ev["status"])["type"]);
    if (
      goalsFor === null ||
      goalsAgainst === null ||
      !(state["completed"] === true || eventState["completed"] === true)
    ) {
      continue;
    }
    games.push({
      id: id(ev["id"]),
      kickoffUtc: new Date(timestamp).toISOString(),
      opponent: str(record(other["team"])["displayName"] ?? record(other["team"])["name"]),
      homeAway: own["homeAway"] === "away" ? "away" : "home",
      goalsFor,
      goalsAgainst,
    });
  }
  return games.sort((a, b) => b.kickoffUtc.localeCompare(a.kickoffUtc)).slice(0, 10);
}

const people = (body: unknown, key: "roster" | "injuries") => {
  const root = record(body);
  const expand = (items: unknown[]) =>
    items.flatMap((item) => {
      const nested = array(record(item)["items"]);
      return nested.length ? nested : [item];
    });
  const entries =
    key === "roster"
      ? [
          ...expand(array(root["athletes"])),
          ...array(root["groups"]).flatMap((g) => expand(array(record(g)["athletes"]))),
        ]
      : [...array(root["injuries"]), ...array(root["athletes"])];
  const result: FootballEspnContext["home"]["roster"] = [];
  for (const entry of entries.slice(0, 80)) {
    const row = record(entry);
    const athlete = Object.keys(record(row["athlete"])).length ? record(row["athlete"]) : row;
    const name = str(athlete["displayName"] ?? athlete["fullName"] ?? athlete["name"], 120);
    if (!name || result.some((v) => v.name === name)) continue;
    const details = [
      str(record(athlete["position"])["displayName"], 80),
      str(
        row["status"] ?? record(row["type"])["description"] ?? record(row["injury"])["description"],
        130,
      ),
    ].filter(Boolean);
    result.push({ name, detail: details.join(" · ").slice(0, 240) });
  }
  return result.slice(0, key === "roster" ? 45 : 25);
};

export function parseEspnLastFive(body: unknown, teamId: string, cutoff: string) {
  const group = array(record(body)["lastFiveGames"])
    .map(record)
    .find((g) => id(record(g["team"])["id"]) === teamId);
  return parseEspnRecentResults(
    {
      events: array(group?.["events"]).flatMap((raw) => {
        const game = record(raw),
          ownHome = id(game["homeTeamId"]) === teamId;
        if (!ownHome && id(game["awayTeamId"]) !== teamId) return [];
        return {
          id: game["id"],
          date: game["gameDate"],
          competitions: [
            {
              status: { type: { completed: ["W", "L", "D"].includes(str(game["gameResult"])) } },
              competitors: [
                {
                  team: { id: teamId },
                  homeAway: ownHome ? "home" : "away",
                  score: game[ownHome ? "homeTeamScore" : "awayTeamScore"],
                },
                {
                  team: game["opponent"],
                  homeAway: ownHome ? "away" : "home",
                  score: game[ownHome ? "awayTeamScore" : "homeTeamScore"],
                },
              ],
            },
          ],
        };
      }),
    },
    teamId,
    cutoff,
  );
}
function summaryTeams(body: unknown) {
  const root = record(body),
    header = record(root["header"]);
  const competition = record(array(header["competitions"])[0]);
  const boxTeams = array(record(root["boxscore"])["teams"]).map(record);
  const pairs = array(competition["competitors"]).length
    ? array(competition["competitors"])
    : boxTeams;
  const isPre = record(record(competition["status"])["type"])["state"] === "pre";
  return pairs.map((raw) => {
    const item = record(raw),
      team = record(item["team"]);
    const box = boxTeams.find((t) => id(record(t["team"])["id"]) === id(team["id"]));
    const stats = metricList(item["statistics"], 35),
      fallback = metricList(box?.["statistics"], 35);
    return {
      id: id(team["id"]),
      name: str(team["displayName"] ?? team["name"]),
      homeAway: str(item["homeAway"]),
      stats: isPre ? [] : stats.length ? stats : fallback,
      previewStats: isPre ? fallback : [],
    };
  });
}
async function boundedEspn(
  url: URL,
  fetcher: typeof fetch,
  diagnostics: NonNullable<FootballEspnContext["diagnostics"]>,
): Promise<unknown | null> {
  try {
    const data = await footballSourceJson(url, { fetcher });
    diagnostics.push({ resource: url.pathname + url.search, status: "ok" });
    return data;
  } catch (error) {
    diagnostics.push({
      resource: url.pathname + url.search,
      status: error instanceof FootballSourceError ? error.status : "unavailable",
    });
    return null;
  }
}
const cache = new Map<string, { until: number; data: FootballEspnContext }>();
const inFlight = new Map<string, Promise<FootballEspnContext>>();

/** One fixture, up to eleven bounded requests; missing endpoints stay explicitly missing. */
export async function fetchEspnMatchContext(
  leagueId: FootballAiDiscoveryLeagueId,
  fixture: FootballFixture,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<FootballEspnContext> {
  const slug = ESPN_LEAGUE_CODES[leagueId];
  if (
    !slug ||
    fixture.source !== "espn" ||
    fixture.leagueId !== leagueId ||
    !/^\d{1,12}$/.test(fixture.sourceFixtureId)
  ) {
    throw new Error("Invalid ESPN fixture");
  }
  const key = leagueId + ":" + fixture.sourceFixtureId;
  if (fetcher === fetch) {
    const hit = cache.get(key);
    if (hit && hit.until > now()) return structuredClone(hit.data);
    const pending = inFlight.get(key);
    if (pending) return structuredClone(await pending);
  }
  const task = (async () => {
    const diagnostics: NonNullable<FootballEspnContext["diagnostics"]> = [];
    const get = (url: URL, f: typeof fetch) => boundedEspn(url, f, diagnostics);
    const origin = "https://site.api.espn.com";
    const site = origin + "/apis/site/v2/sports/soccer/" + slug;
    const [summary, standings, scoreboard] = await Promise.all([
      get(new URL(site + "/summary?event=" + fixture.sourceFixtureId), fetcher),
      get(new URL(origin + "/apis/v2/sports/soccer/" + slug + "/standings"), fetcher),
      get(
        new URL(site + "/scoreboard?dates=" + fixture.kickoffUtc.slice(0, 10).replaceAll("-", "")),
        fetcher,
      ),
    ]);
    const headerId = id(record(record(summary)["header"])["id"]);
    const boundSummary = !headerId || headerId === fixture.sourceFixtureId ? summary : null;
    if (headerId && !boundSummary) {
      for (const diagnostic of diagnostics)
        if (diagnostic.resource.includes("/summary?event=")) diagnostic.status = "conflict";
    }
    const fromSummary = summaryTeams(boundSummary);
    const ev = array(record(scoreboard)["events"])
      .map(record)
      .find((item) => id(item["id"]) === fixture.sourceFixtureId);
    const comps = array(record(array(record(ev)["competitions"])[0])["competitors"]).map(record);
    const identify = (homeAway: "home" | "away", name: string) => {
      const fromHeader = fromSummary.find(
        (t) => t.homeAway === homeAway && t.name.trim().toLowerCase() === name.trim().toLowerCase(),
      );
      const fromScore = comps.find((c) => c["homeAway"] === homeAway);
      return {
        id: fromHeader?.id || id(record(fromScore?.["team"])["id"]) || null,
        name,
        matchStatistics: fromHeader?.stats ?? [],
        previewStatistics: fromHeader?.previewStats ?? [],
      };
    };
    const standingRows = parseEspnStandings(standings);
    const home = identify("home", fixture.homeTeam);
    const away = identify("away", fixture.awayTeam);
    async function teamData(side: typeof home): Promise<FootballEspnContext["home"]> {
      const row = standingRows.find((r) => r.teamId === side.id);
      if (!side.id || !/^\d{1,12}$/.test(side.id)) {
        return {
          ...side,
          standing: row ? { rank: row.rank, metrics: row.metrics } : null,
          recentResults: [],
          roster: [],
          injuries: [],
          teamStatistics: [],
        };
      }
      const base = site + "/teams/" + side.id;
      const [schedule, roster, injuries, details] = await Promise.all([
        get(new URL(base + "/schedule"), fetcher),
        get(new URL(base + "/roster"), fetcher),
        get(new URL(base + "/injuries"), fetcher),
        get(new URL(base), fetcher),
      ]);
      return {
        ...side,
        standing: row ? { rank: row.rank, metrics: row.metrics } : null,
        recentResults: [
          ...new Map(
            [
              ...parseEspnRecentResults(
                schedule,
                side.id,
                new Date(Math.min(now(), Date.parse(fixture.kickoffUtc))).toISOString(),
              ),
              ...parseEspnLastFive(
                boundSummary,
                side.id,
                new Date(Math.min(now(), Date.parse(fixture.kickoffUtc))).toISOString(),
              ),
            ].map((game) => [game.id, game]),
          ).values(),
        ]
          .sort((a, b) => b.kickoffUtc.localeCompare(a.kickoffUtc))
          .slice(0, 10),
        roster: people(roster, "roster"),
        injuries: people(injuries, "injuries"),
        teamStatistics: metricList(
          record(record(details)["team"])["statistics"] ??
            record(array(record(record(record(details)["team"])["record"])["items"])[0])["stats"],
          60,
        ),
      };
    }
    const [h, a] = await Promise.all([teamData(home), teamData(away)]);
    const availability = {
      standings: !!(h.standing || a.standing),
      schedules: !!(h.recentResults.length || a.recentResults.length),
      rosters: !!(h.roster.length || a.roster.length),
      injuries: !!(h.injuries.length || a.injuries.length),
      matchStatistics: !!(h.matchStatistics.length || a.matchStatistics.length),
      teamStatistics: !!(h.teamStatistics.length || a.teamStatistics.length),
    };
    const labels: Record<string, string> = {
      standings: "Βαθμολογία",
      schedules: "Πρόσφατα αποτελέσματα",
      rosters: "Ρόστερ",
      injuries: "Αναφορές απουσιών",
      matchStatistics: "Στατιστικά συγκεκριμένου αγώνα",
      teamStatistics: "Στατιστικά ομάδων",
    };
    const missing = Object.entries(availability)
      .filter(([, value]) => !value)
      .map(([name]) => (labels[name] ?? name) + ": μη διαθέσιμο από ESPN");
    // No xG assumption: generic ESPN tables do not guarantee the metric.
    const hasXg = [h, a].some((side) =>
      [...(side.standing?.metrics ?? []), ...side.matchStatistics, ...side.teamStatistics].some(
        (m) => /^(xg|xga|expected goals|expected goals against)$/i.test(m.name),
      ),
    );
    if (!hasXg) missing.push("xG/xGA: μη διαθέσιμο από ESPN");
    return footballEspnContextSchema.parse({
      provider: "espn",
      diagnostics,
      leagueId,
      fixtureId: fixture.sourceFixtureId,
      fetchedAtUtc: new Date(now()).toISOString(),
      home: h,
      away: a,
      availability,
      missing,
    });
  })();
  if (fetcher !== fetch) return task;
  inFlight.set(key, task);
  try {
    const data = await task;
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { data, until: now() + 10 * 60 * 1000 });
    return structuredClone(data);
  } finally {
    if (inFlight.get(key) === task) inFlight.delete(key);
  }
}
