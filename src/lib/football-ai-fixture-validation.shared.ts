import { z } from "zod";
import { FOOTBALL_AI_DISCOVERY_LEAGUES } from "./football-research.shared";
import { footballWeekBounds } from "./football-fixtures.server";

const leagueIds = FOOTBALL_AI_DISCOVERY_LEAGUES.map((league) => league.id) as [
  (typeof FOOTBALL_AI_DISCOVERY_LEAGUES)[number]["id"],
  ...(typeof FOOTBALL_AI_DISCOVERY_LEAGUES)[number]["id"][],
];
const httpsUrl = z.string().url().refine((url) => new URL(url).protocol === "https:");
const source = z.object({
  url: httpsUrl,
  title: z.string().trim().min(4).max(250),
}).strict();
const proposedFixture = z.object({
  leagueId: z.enum(leagueIds),
  homeTeam: z.string().trim().min(2).max(200),
  awayTeam: z.string().trim().min(2).max(200),
  kickoffUtc: z.string().datetime({ offset: true }),
  sources: z.array(source).min(2).max(8),
}).strict();
export const aiFixtureBatchSchema = z.object({
  fixtures: z.array(proposedFixture).max(80),
}).strict();

export type AiFixtureCandidate = z.infer<typeof proposedFixture> & {
  normalizedKey: string;
  observedAtUtc: string;
};

function canonicalTeam(team: string): string {
  return team.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

/**
 * Strict, fail-closed parsing of model-proposed fixtures. These checks do not
 * prove a real match exists: independent server-side source verification is
 * mandatory before any fixture may become eligible for paid analysis.
 */
export function validateAiFixtureBatch(
  raw: unknown,
  expectedLeague: (typeof leagueIds)[number],
  date: string,
  now: Date,
): AiFixtureCandidate[] {
  const parsed = aiFixtureBatchSchema.parse(raw);
  const { from, to } = footballWeekBounds(date);
  const earliest = Date.parse(from + "T00:00:00Z") - 86400000;
  const latest = Date.parse(to + "T23:59:59Z") + 86400000;
  const seen = new Set<string>();
  const observedAtUtc = now.toISOString();
  return parsed.fixtures.map((fixture) => {
    const kickoff = Date.parse(fixture.kickoffUtc);
    if (fixture.leagueId !== expectedLeague) throw new Error("Unexpected competition");
    if (!Number.isFinite(kickoff) || kickoff < earliest || kickoff > latest)
      throw new Error("Fixture outside requested week");
    if (kickoff <= now.getTime()) throw new Error("Historical or live fixture");
    const home = canonicalTeam(fixture.homeTeam);
    const away = canonicalTeam(fixture.awayTeam);
    if (home === away) throw new Error("Identical teams");
    if (new Set(fixture.sources.map((source) => new URL(source.url).hostname)).size < 2)
      throw new Error("Independent source domains required");
    const normalizedKey = [expectedLeague, home, away].join(":");
    if (seen.has(normalizedKey)) throw new Error("Duplicate fixture");
    seen.add(normalizedKey);
    return { ...fixture, kickoffUtc: new Date(kickoff).toISOString(), normalizedKey, observedAtUtc };
  });
}
