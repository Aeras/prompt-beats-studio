import { z } from "zod";
import {
  FOOTBALL_LEAGUES,
  type FootballFixture,
  type FootballLeagueId,
} from "./football-research.shared";

const API_ORIGIN = "https://v3.football.api-sports.io";
const LEAGUE_IDS: Record<FootballLeagueId, number> = {
  "GR-SL": 197,
  "EN-PL": 39,
  "ES-LL": 140,
  "IT-SA": 135,
  "DE-BL": 78,
  "FR-L1": 61,
};
const dateSchema = /^\d{4}-\d{2}-\d{2}$/;
const apiFixture = z.object({
  fixture: z.object({
    id: z.number().int().positive(),
    date: z.string(),
    status: z.object({ short: z.string() }),
  }),
  league: z.object({ id: z.number().int().positive() }),
  teams: z.object({
    home: z.object({ name: z.string().min(1).max(200) }),
    away: z.object({ name: z.string().min(1).max(200) }),
  }),
});
const apiResponse = z.object({
  response: z.array(apiFixture).max(300),
  errors: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional(),
});

export function footballSeasonStartYear(date: string): number {
  if (!dateSchema.test(date) || !Number.isFinite(Date.parse(date + "T00:00:00Z"))) {
    throw new Error("Invalid football date");
  }
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month >= 7 ? year : year - 1;
}

export function footballWeekBounds(date: string): { from: string; to: string } {
  if (!dateSchema.test(date) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) {
    throw new Error("Invalid week date");
  }
  const start = new Date(date + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function stateFor(status: string): FootballFixture["state"] {
  if (["FT", "AET", "PEN"].includes(status)) return "finished";
  if (["PST", "SUSP"].includes(status)) return "postponed";
  if (["CANC", "ABD", "AWD", "WO"].includes(status)) return "cancelled";
  if (["NS", "TBD"].includes(status)) return "scheduled";
  return "live";
}

export async function fetchFootballWeek(
  leagueId: FootballLeagueId,
  date: string,
  fetcher: typeof fetch = fetch,
  apiKey = process.env["API_FOOTBALL_KEY"],
): Promise<FootballFixture[]> {
  if (!FOOTBALL_LEAGUES.some((l) => l.id === leagueId)) throw new Error("Unsupported league");
  if (!apiKey?.trim()) throw new Error("Football fixture provider is not configured");
  const { from, to } = footballWeekBounds(date);
  const id = LEAGUE_IDS[leagueId];
  const seasons = [...new Set([footballSeasonStartYear(from), footballSeasonStartYear(to)])];
  const results: FootballFixture[] = [];
  for (const season of seasons) {
    const url = new URL("/fixtures", API_ORIGIN);
    url.searchParams.set("league", String(id));
    url.searchParams.set("season", String(season));
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("timezone", "UTC");
    const response = await fetcher(url, {
      method: "GET",
      headers: { "x-apisports-key": apiKey },
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Football fixture provider unavailable");
    }
    const len = Number(response.headers.get("content-length") ?? "0");
    if (len > 500_000) {
      await response.body?.cancel();
      throw new Error("Football fixture response too large");
    }
    const body = await response.text();
    if (body.length > 500_000) throw new Error("Football fixture response too large");
    const parsed = apiResponse.parse(JSON.parse(body));
    if (parsed.errors && Object.keys(parsed.errors).length)
      throw new Error("Football fixture provider reported an error");
    const fetchedAtUtc = new Date().toISOString();
    for (const row of parsed.response) {
      if (row.league.id !== id) continue;
      if (!Number.isFinite(Date.parse(row.fixture.date))) continue;
      results.push({
        source: "api-football",
        sourceFixtureId: String(row.fixture.id),
        leagueId,
        homeTeam: row.teams.home.name,
        awayTeam: row.teams.away.name,
        kickoffUtc: new Date(row.fixture.date).toISOString(),
        state: stateFor(row.fixture.status.short),
        fetchedAtUtc,
      });
    }
  }
  return [...new Map(results.map((f) => [f.sourceFixtureId, f])).values()].sort((a, b) =>
    a.kickoffUtc.localeCompare(b.kickoffUtc),
  );
}
