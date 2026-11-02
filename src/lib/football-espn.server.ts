import { z } from "zod";
import { footballWeekBounds } from "./football-fixtures.server";
import {
  FOOTBALL_ESPN_LEAGUES,
  type FootballAiDiscoveryLeagueId,
  type FootballFixture,
} from "./football-research.shared";

/** Fixed ESPN host, allowlisted league slugs; never proxy arbitrary user URLs. */
export const ESPN_LEAGUE_CODES: Partial<Record<FootballAiDiscoveryLeagueId, string>> = {
  "IT-SA": "ita.1",
  "EN-PL": "eng.1",
  "ES-LL": "esp.1",
  "FR-L1": "fra.1",
  "DE-BL": "ger.1",
  "GR-SL": "gre.1",
  "NL-ED": "ned.1",
  "PT-PL": "por.1",
  "BE-PL": "bel.1",
  "UEFA-CL": "uefa.champions",
  "UEFA-EL": "uefa.europa",
};

const competitor = z.object({
  homeAway: z.enum(["home", "away"]),
  team: z.object({ displayName: z.string().min(1).max(200) }),
  score: z.union([z.string(), z.number()]).nullable().optional(),
});
const event = z.object({
  id: z.string().regex(/^\\d{1,12}$/),
  date: z.string(),
  competitions: z.array(z.object({
    competitors: z.array(competitor).max(4),
    status: z.object({ type: z.object({
      name: z.string().optional(),
      state: z.string().optional(),
      completed: z.boolean().optional(),
    }) }).optional(),
  })).min(1).max(4),
  status: z.object({ type: z.object({
    name: z.string().optional(),
    state: z.string().optional(),
    completed: z.boolean().optional(),
  }) }).optional(),
});
const scoreboard = z.object({ events: z.array(event).max(200).default([]) });
const cache = new Map<string, { expiresAt: number; fixtures: FootballFixture[] }>();
const inFlight = new Map<string, Promise<FootballFixture[]>>();

export function parseEspnScoreboard(
  body: unknown,
  leagueId: FootballAiDiscoveryLeagueId,
  from: string,
  to: string,
  fetchedAtUtc: string,
): FootballFixture[] {
  const parsed = scoreboard.parse(body);
  const results: FootballFixture[] = [];
  for (const item of parsed.events) {
    const match = item.competitions[0];
    const home = match?.competitors.find((c) => c.homeAway === "home");
    const away = match?.competitors.find((c) => c.homeAway === "away");
    const start = Date.parse(item.date);
    if (!home || !away || !Number.isFinite(start)) continue;
    const kickoffUtc = new Date(start).toISOString();
    if (kickoffUtc.slice(0, 10) < from || kickoffUtc.slice(0, 10) > to) continue;
    const status = match?.status?.type ?? item.status?.type;
    const name = status?.name ?? "";
    const state = status?.completed || name.includes("FINAL") ? "finished"
      : name.includes("POSTPONED") ? "postponed"
      : name.includes("CANCELED") || name.includes("CANCELLED") ? "cancelled"
      : status?.state === "in" ? "live" : "scheduled";
    const goal = (v: string | number | null | undefined) => {
      const n = Number(v);
      return v === null || v === undefined || v === "" || !Number.isInteger(n) || n < 0 ? null : n;
    };
    results.push({
      source: "espn",
      sourceFixtureId: item.id,
      leagueId,
      homeTeam: home.team.displayName,
      awayTeam: away.team.displayName,
      kickoffUtc,
      state,
      fetchedAtUtc,
      providerStatus: name,
      homeGoals: goal(home.score),
      awayGoals: goal(away.score),
    });
  }
  return results;
}

/** Fetch a UTC Monday–Sunday window without paid AI calls or an API key. */
export async function fetchEspnFootballWeek(
  leagueId: FootballAiDiscoveryLeagueId,
  date: string,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<FootballFixture[]> {
  const slug = ESPN_LEAGUE_CODES[leagueId];
  if (!slug || !FOOTBALL_ESPN_LEAGUES.some((league) => league.id === leagueId)) {
    throw new Error("Unsupported ESPN competition");
  }
  const { from, to } = footballWeekBounds(date);
  const key = leagueId + ":" + from;
  if (fetcher === fetch) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now()) return hit.fixtures.map((f) => ({ ...f }));
    const pending = inFlight.get(key);
    if (pending) return (await pending).map((f) => ({ ...f }));
  }
  const run = async () => {
    const results: FootballFixture[] = [];
    for (let d = Date.parse(from + "T00:00:00Z"); d <= Date.parse(to + "T00:00:00Z"); d += 86400000) {
      const day = new Date(d).toISOString().slice(0, 10).replaceAll("-", "");
      const url = new URL("https://site.api.espn.com/apis/site/v2/sports/soccer/" + slug + "/scoreboard");
      url.searchParams.set("dates", day);
      const response = await fetcher(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("ESPN fixture feed unavailable");
      }
      const length = Number(response.headers.get("content-length") ?? "0");
      if (length > 800000) {
        await response.body?.cancel();
        throw new Error("ESPN response too large");
      }
      const text = await response.text();
      if (text.length > 800000) throw new Error("ESPN response too large");
      results.push(...parseEspnScoreboard(JSON.parse(text), leagueId, from, to, new Date(now()).toISOString()));
    }
    const fixtures = [...new Map(results.map((f) => [f.sourceFixtureId, f])).values()]
      .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
    return fixtures;
  };
  const task = run();
  if (fetcher !== fetch) return task;
  inFlight.set(key, task);
  try {
    const fixtures = await task;
    if (cache.size >= 48) cache.delete(cache.keys().next().value!);
    cache.set(key, { fixtures, expiresAt: now() + 15 * 60 * 1000 });
    return fixtures.map((f) => ({ ...f }));
  } finally {
    if (inFlight.get(key) === task) inFlight.delete(key);
  }
}
