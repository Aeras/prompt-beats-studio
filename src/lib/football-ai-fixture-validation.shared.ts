import { z } from "zod";
import { FOOTBALL_AI_LEAGUE_IDS, type FootballAiDiscoveryLeagueId } from "./football-research.shared";

/** Monday–Sunday UTC bounds; mirrors footballWeekBounds without a server import. */
export function aiFixtureWeekBounds(date: string): { from: string; to: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) {
    throw new Error("Invalid week date");
  }
  const start = new Date(date + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

const httpsUrl = z
  .string()
  .max(2000)
  .url()
  .refine((url) => new URL(url).protocol === "https:");
const source = z.object({ url: httpsUrl, title: z.string().trim().max(250).default("") }).strict();
const proposedFixture = z
  .object({
    leagueId: z.enum(FOOTBALL_AI_LEAGUE_IDS),
    homeTeam: z.string().trim().min(2).max(200),
    awayTeam: z.string().trim().min(2).max(200),
    kickoffUtc: z.string().datetime({ offset: true }),
    sources: z.array(source).max(8).default([]),
  })
  .strict();
export const aiFixtureBatchSchema = z.object({ fixtures: z.array(proposedFixture).max(80) }).strict();

/** JSON schema sent to OpenRouter as `response_format` (structured output). */
export const AI_FIXTURE_JSON_SCHEMA = {
  name: "football_fixture_candidates",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["fixtures"],
    properties: {
      fixtures: {
        type: "array",
        maxItems: 80,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["leagueId", "homeTeam", "awayTeam", "kickoffUtc", "sources"],
          properties: {
            leagueId: { type: "string", enum: FOOTBALL_AI_LEAGUE_IDS },
            homeTeam: { type: "string" },
            awayTeam: { type: "string" },
            kickoffUtc: { type: "string", description: "ISO 8601 with Z or offset" },
            sources: {
              type: "array",
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["url", "title"],
                properties: { url: { type: "string" }, title: { type: "string" } },
              },
            },
          },
        },
      },
    },
  },
} as const;

export type AiFixtureCandidate = z.infer<typeof proposedFixture> & {
  normalizedKey: string;
  observedAtUtc: string;
};

export function canonicalTeam(team: string): string {
  return team.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

/**
 * Fail-closed filtering of model-proposed fixtures. Invalid items are DROPPED
 * (one bad item never poisons the batch). Passing this check proves nothing:
 * only server HTTP corroboration may mark a fixture verified.
 */
export function validateAiFixtureBatch(
  raw: unknown,
  expectedLeague: FootballAiDiscoveryLeagueId,
  date: string,
  now: Date,
): AiFixtureCandidate[] {
  const parsed = aiFixtureBatchSchema.parse(raw);
  const { from, to } = aiFixtureWeekBounds(date);
  const earliest = Date.parse(from + "T00:00:00Z");
  const latest = Date.parse(to + "T23:59:59Z");
  const seen = new Set<string>();
  const observedAtUtc = now.toISOString();
  const out: AiFixtureCandidate[] = [];
  for (const fixture of parsed.fixtures) {
    const kickoff = Date.parse(fixture.kickoffUtc);
    if (fixture.leagueId !== expectedLeague) continue;
    if (!Number.isFinite(kickoff) || kickoff < earliest || kickoff > latest) continue;
    if (kickoff <= now.getTime()) continue;
    const home = canonicalTeam(fixture.homeTeam);
    const away = canonicalTeam(fixture.awayTeam);
    if (home === away) continue;
    const normalizedKey = [expectedLeague, home, away, from].join(":");
    if (seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    out.push({
      ...fixture,
      kickoffUtc: new Date(kickoff).toISOString(),
      normalizedKey,
      observedAtUtc,
    });
  }
  return out;
}
