import { z } from "zod";
import { footballEspnContextSchema } from "./football-espn-context.shared";

export const FOOTBALL_EVIDENCE_PROVIDERS = [
  "espn",
  "api-football",
  "football-data",
  "pitchapi",
] as const;
export type FootballEvidenceProvider = (typeof FOOTBALL_EVIDENCE_PROVIDERS)[number];
export const FOOTBALL_EVIDENCE_LABELS: Record<FootballEvidenceProvider, string> = {
  espn: "ESPN",
  "api-football": "API-Football",
  "football-data": "football-data.org",
  pitchapi: "PitchAPI",
};
export const evidenceStatusSchema = z.enum([
  "ok",
  "partial",
  "not_configured",
  "unsupported",
  "not_found",
  "ambiguous",
  "conflict",
  "access_denied",
  "rate_limited",
  "timeout",
  "unavailable",
  "invalid_response",
  "too_large",
]);
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;
export const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, string> = {
  ok: "Διαθέσιμα στοιχεία",
  partial: "Μερικά στοιχεία",
  not_configured: "Δεν έχει ρυθμιστεί κλειδί",
  unsupported: "Μη υποστηριζόμενη διοργάνωση",
  not_found: "Δεν βρέθηκε αντίστοιχος αγώνας",
  ambiguous: "Αμφίβολη αντιστοίχιση",
  conflict: "Ασυμφωνία αγώνα ή στοιχείων",
  access_denied: "Δεν επιτρέπεται πρόσβαση με το διαθέσιμο πλάνο ή κλειδί",
  rate_limited: "Όριο αιτημάτων παρόχου",
  timeout: "Λήξη χρόνου ανάκτησης",
  unavailable: "Αποτυχία επικοινωνίας",
  invalid_response: "Μη αναγνωρίσιμη απάντηση",
  too_large: "Η απάντηση υπερβαίνει το ασφαλές μέγεθος",
};
const resource = z
  .object({
    url: z
      .string()
      .url()
      .max(400)
      .refine((value) => {
        try {
          const u = new URL(value);
          return (
            u.protocol === "https:" &&
            !u.username &&
            !u.password &&
            !u.port &&
            [
              "site.api.espn.com",
              "api.pitchapi.dev",
              "v3.football.api-sports.io",
              "api.football-data.org",
            ].includes(u.hostname)
          );
        } catch {
          return false;
        }
      }),
    status: evidenceStatusSchema,
    fetchedAtUtc: z.string().datetime(),
  })
  .strict();
export const footballProviderEvidenceSchema = z
  .object({
    version: z.literal(1),
    collectedAtUtc: z.string().datetime(),
    fixture: z
      .object({
        leagueId: z.string().max(20),
        homeTeam: z.string().max(200),
        awayTeam: z.string().max(200),
        kickoffUtc: z.string().datetime(),
      })
      .strict(),
    providers: z
      .array(
        z
          .object({
            provider: z.enum(FOOTBALL_EVIDENCE_PROVIDERS),
            status: evidenceStatusSchema,
            fixtureId: z.string().max(32).nullable(),
            home: footballEspnContextSchema.shape.home.nullable(),
            away: footballEspnContextSchema.shape.away.nullable(),
            resources: z.array(resource).max(40),
            notes: z.array(z.string().max(240)).max(16),
          })
          .strict(),
      )
      .max(4),
    conflicts: z.array(z.string().max(240)).max(12),
  })
  .strict();
export type FootballProviderEvidence = z.infer<typeof footballProviderEvidenceSchema>;
export type ProviderEvidence = FootballProviderEvidence["providers"][number];

// Conservative equivalence only. Never drop women, age groups, reserve or city qualifiers.
const aliases: Record<string, string> = {
  "arsenal fc": "arsenal",
  "chelsea fc": "chelsea",
  "liverpool fc": "liverpool",
  "everton fc": "everton",
  "manchester city fc": "manchester city",
  "manchester united fc": "manchester united",
  "juventus fc": "juventus",
  "fc bayern munchen": "bayern munich",
  "fc bayern münchen": "bayern munich",
  "bayern munchen": "bayern munich",
  "bayer 04 leverkusen": "bayer leverkusen",
  "fc internazionale milano": "inter milan",
  "fc barcelona": "barcelona",
  "real madrid cf": "real madrid",
  "paris saint-germain fc": "paris saint germain",
  "afc ajax": "ajax amsterdam",
  ajax: "ajax amsterdam",
  az: "az alkmaar",
  psv: "psv eindhoven",
  "feyenoord rotterdam": "feyenoord",
  "brighton & hove albion": "brighton and hove albion",
  "manchester utd": "manchester united",
  "newcastle utd": "newcastle united",
  tottenham: "tottenham hotspur",
  bournemouth: "afc bournemouth",
  internazionale: "inter milan",
  inter: "inter milan",
  "paris saint-germain": "paris saint germain",
};
export function footballEvidenceTeamKey(name: string): string {
  const key = name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  return aliases[key] ?? key;
}
export function sameEvidenceFixture(
  target: FootballProviderEvidence["fixture"],
  candidate: { homeTeam: string; awayTeam: string; kickoffUtc: string },
): boolean {
  return (
    Number.isFinite(Date.parse(target.kickoffUtc)) &&
    Date.parse(target.kickoffUtc) === Date.parse(candidate.kickoffUtc) &&
    footballEvidenceTeamKey(target.homeTeam) === footballEvidenceTeamKey(candidate.homeTeam) &&
    footballEvidenceTeamKey(target.awayTeam) === footballEvidenceTeamKey(candidate.awayTeam)
  );
}
export function providerEvidenceUrls(bundle: FootballProviderEvidence): string[] {
  return [
    ...new Set(
      bundle.providers
        .filter(
          (p) => (p.status === "ok" || p.status === "partial") && p.fixtureId && p.home && p.away,
        )
        .flatMap((p) => p.resources.filter((r) => r.status === "ok").map((r) => r.url)),
    ),
  ];
}

/** Optional history fields are server-owned, even if the model echoes a valid-shaped copy. */
export function withoutFootballSourceMetadata<T extends object>(assessment: T) {
  const result = { ...assessment } as Record<string, unknown>;
  for (const key of ["espnData", "providerEvidence", "researchBrief", "tavilySearchDepth"])
    delete result[key];
  return result as Omit<T, "espnData" | "providerEvidence" | "researchBrief" | "tavilySearchDepth">;
}
