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
    consentVersion: "football-v2-full-evidence-1",
  },
} as const;
export const footballProfileConsentSchema = z
  .object({
    searchProfileVersion: footballSearchProfileSchema,
    depth: z.enum(["basic", "advanced"]),
    modelId: z.string().min(1).max(240),
    fixtureId: z.string().regex(/^\d{1,12}$/),
    evidenceVersion: z.literal("full-v2-1").optional(),
    maxModelCalls: z.literal(5).optional(),
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
    ...(profile === "v2_experimental"
      ? { evidenceVersion: "full-v2-1" as const, maxModelCalls: 5 as const }
      : {}),
  };
}

/** Reviewed spellings for the V2 query and article-binding boundary only. */
export const FOOTBALL_V2_RU_LABELS: Readonly<Record<string, string>> = {
  "it-napoli": "Наполи",
  "it-lazio": "Лацио",
  "it-internazionale": "Интер",
  "it-como": "Комо",
};

/** Static, safe pre-dispatch diagnostics; never display arbitrary provider exceptions. */
export const FOOTBALL_V2_PLANNING_FAILURES: Readonly<Record<string, string>> = {
  football_v2_team_identity_unverified:
    "Δεν επιβεβαιώθηκε με ασφάλεια η ταυτότητα των δύο ομάδων. Η αναζήτηση δεν ξεκίνησε.",
  football_v2_competition_mismatch:
    "Οι ομάδες δεν αντιστοιχούν στην επιλεγμένη διοργάνωση για τη Version 2. Η αναζήτηση δεν ξεκίνησε.",
  football_v2_venue_date_unverified:
    "Δεν επιβεβαιώθηκε η τοπική ημερομηνία του αγώνα. Η αναζήτηση δεν ξεκίνησε.",
  football_v2_query_too_long:
    "Τα επαληθευμένα ονόματα του αγώνα δεν χωρούν στην αναζήτηση των 400 χαρακτήρων. Η αναζήτηση δεν ξεκίνησε· μπορείς να επιλέξεις Version 1.",
};
export function footballV2PlanningMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (Object.hasOwn(FOOTBALL_V2_PLANNING_FAILURES, value))
    return FOOTBALL_V2_PLANNING_FAILURES[value];
  return Object.values(FOOTBALL_V2_PLANNING_FAILURES).find((message) => message === value);
}
