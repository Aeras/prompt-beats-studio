import { z } from "zod";

const metric = z
  .object({
    name: z.string().max(80),
    value: z.string().max(100),
  })
  .strict();
const game = z
  .object({
    id: z.string().max(20),
    kickoffUtc: z.string().datetime(),
    opponent: z.string().max(160),
    homeAway: z.enum(["home", "away"]),
    goalsFor: z.number().int().min(0).max(99),
    goalsAgainst: z.number().int().min(0).max(99),
    xg: z.number().finite().min(0).max(100).optional(),
    xga: z.number().finite().min(0).max(100).optional(),
  })
  .strict();
const person = z
  .object({
    name: z.string().max(120),
    detail: z.string().max(240),
  })
  .strict();
const side = z
  .object({
    id: z.string().max(24).nullable(),
    name: z.string().max(160),
    standing: z
      .object({
        rank: z.number().int().positive().nullable(),
        metrics: z.array(metric).max(60),
      })
      .strict()
      .nullable(),
    recentResults: z.array(game).max(10),
    roster: z.array(person).max(45),
    injuries: z.array(person).max(25),
    matchStatistics: z.array(metric).max(35),
    previewStatistics: z.array(metric).max(35).optional(),
    teamStatistics: z.array(metric).max(60),
  })
  .strict();

/** Provider-owned read-only data; never upgrades Tavily snippets to verified facts. */
export const footballEspnContextSchema = z
  .object({
    provider: z.literal("espn"),
    diagnostics: z
      .array(
        z
          .object({
            resource: z.string().max(240),
            status: z.enum([
              "ok",
              "partial",
              "not_configured",
              "unsupported",
              "ambiguous",
              "conflict",
              "not_found",
              "unavailable",
              "access_denied",
              "rate_limited",
              "timeout",
              "invalid_response",
              "too_large",
            ]),
          })
          .strict(),
      )
      .max(16)
      .optional(),
    leagueId: z.string().max(20),
    fixtureId: z.string().regex(/^\d{1,12}$/),
    fetchedAtUtc: z.string().datetime(),
    home: side,
    away: side,
    availability: z
      .object({
        standings: z.boolean(),
        schedules: z.boolean(),
        rosters: z.boolean(),
        injuries: z.boolean(),
        matchStatistics: z.boolean(),
        teamStatistics: z.boolean(),
      })
      .strict(),
    missing: z.array(z.string().max(160)).max(12),
  })
  .strict();

export type FootballEspnContext = z.infer<typeof footballEspnContextSchema>;
