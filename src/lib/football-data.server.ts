import { z } from "zod";
import type { FootballFixture, FootballLeagueId } from "./football-research.shared";
import { footballWeekBounds } from "./football-fixtures.server";

const CODES: Partial<Record<FootballLeagueId, string>> = {
  "EN-PL": "PL",
  "ES-LL": "PD",
  "IT-SA": "SA",
  "DE-BL": "BL1",
  "FR-L1": "FL1",
};
const matchSchema = z.object({
  id: z.number().int().positive(),
  utcDate: z.string(),
  status: z.string(),
  homeTeam: z.object({ name: z.string().min(1).max(200) }),
  awayTeam: z.object({ name: z.string().min(1).max(200) }),
  score: z.object({
    fullTime: z.object({
      home: z.number().int().nonnegative().nullable(),
      away: z.number().int().nonnegative().nullable(),
    }).nullable().optional(),
    duration: z.string().optional(),
  }).optional(),
});
const responseSchema = z.object({ matches: z.array(matchSchema).max(400) });

function normalizeState(status: string): FootballFixture["state"] {
  if (status === "FINISHED") return "finished";
  if (["SCHEDULED", "TIMED"].includes(status)) return "scheduled";
  if (status === "POSTPONED") return "postponed";
  if (["CANCELLED", "SUSPENDED"].includes(status)) return "cancelled";
  return "live";
}

export async function fetchFootballDataWeek(
  leagueId: FootballLeagueId,
  date: string,
  fetcher: typeof fetch = fetch,
  apiKey = process.env["FOOTBALL_DATA_API_KEY"],
): Promise<FootballFixture[]> {
  const code = CODES[leagueId];
  if (!code) throw new Error("Football-data.org Free does not include this competition.");
  if (!apiKey?.trim()) throw new Error("Football-data.org key is not configured.");
  const { from, to } = footballWeekBounds(date);
  const url = new URL(`https://api.football-data.org/v4/competitions/${code}/matches`);
  url.searchParams.set("dateFrom", from);
  url.searchParams.set("dateTo", to);
  const response = await fetcher(url, {
    method: "GET",
    headers: { "X-Auth-Token": apiKey.trim() },
    redirect: "manual",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403) throw new Error("Football-data.org authentication or competition access denied.");
    if (response.status === 429) throw new Error("Football-data.org free-plan rate limit reached.");
    throw new Error("Football-data.org unavailable.");
  }
  const size = Number(response.headers.get("content-length") ?? "0");
  if (size > 500_000) {
    await response.body?.cancel();
    throw new Error("Football-data.org response too large.");
  }
  const body = await response.text();
  if (body.length > 500_000) throw new Error("Football-data.org response too large.");
  const parsed = responseSchema.parse(JSON.parse(body));
  const fetchedAtUtc = new Date().toISOString();
  return parsed.matches.flatMap((match): FootballFixture[] => {
    const kickoff = Date.parse(match.utcDate);
    if (!Number.isFinite(kickoff)) return [];
    const status = normalizeState(match.status);
    const fullTime = match.score?.fullTime;
    const isRegularTime = match.score?.duration === "REGULAR";
    return [{
      source: "football-data",
      sourceFixtureId: String(match.id),
      leagueId,
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      kickoffUtc: new Date(kickoff).toISOString(),
      state: status,
      fetchedAtUtc,
      providerStatus: status === "finished" && isRegularTime ? "FT" : match.status,
      homeGoals: fullTime?.home ?? null,
      awayGoals: fullTime?.away ?? null,
    }];
  }).sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
}
