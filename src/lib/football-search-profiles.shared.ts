import { z } from "zod";
export const footballSearchProfileSchema = z.enum(["v1_current", "v2_experimental"]);
export type FootballSearchProfileVersion = z.infer<typeof footballSearchProfileSchema>;
export const FOOTBALL_SEARCH_PROFILES = {
  v1_current: {
    label: "Version 1 — Τρέχον",
    searchCalls: 5,
    resultsPerSearch: 5,
    maxCandidates: 25,
    consentVersion: "football-search-v1-consent-1",
  },
  v2_experimental: {
    label: "Version 2 — Πειραματικό",
    searchCalls: 2,
    resultsPerSearch: 10,
    maxCandidates: 20,
    consentVersion: "football-search-v2-consent-1",
  },
} as const;
export const footballProfileConsentSchema = z
  .object({
    searchProfileVersion: footballSearchProfileSchema,
    depth: z.enum(["basic", "advanced"]),
    modelId: z.string().min(1).max(240),
    fixtureId: z.string().regex(/^\d{1,12}$/),
    searchCalls: z.number().int(),
    resultsPerSearch: z.number().int(),
  })
  .strict();
export function footballProfileConsent(
  profile: FootballSearchProfileVersion,
  depth: "basic" | "advanced",
  modelId: string,
  fixtureId: string,
) {
  const p = FOOTBALL_SEARCH_PROFILES[profile];
  return {
    searchProfileVersion: profile,
    depth,
    modelId,
    fixtureId,
    searchCalls: p.searchCalls,
    resultsPerSearch: p.resultsPerSearch,
  };
}

/** Reviewed spellings for the V2 query and article-binding boundary only. */
export const FOOTBALL_V2_RU_LABELS: Readonly<Record<string, string>> = {
  "it-napoli": "Наполи",
  "it-lazio": "Лацио",
  "it-internazionale": "Интер",
  "it-como": "Комо",
};
