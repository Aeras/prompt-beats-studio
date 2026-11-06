import type { z } from "zod";
import type { footballAiAssessmentSchema } from "./football-ai-research.shared";

/** Build the complete, bounded existing analysis payload for the independent expert. */
export function buildFootballExpertPayload(assessment: z.infer<typeof footballAiAssessmentSchema>) {
  return {
    researchBrief: assessment.researchBrief ?? null,
    espnData: assessment.espnData ?? null,
    providerEvidence: assessment.providerEvidence ?? null,
    bookmakerOddsSnapshot: assessment.bookmakerOddsSnapshot ?? null,
    matchContext: assessment.matchContext ?? null,
    baseAssessment: {
      summary: assessment.summary,
      deepDive: assessment.deepDive ?? null,
      estimates: assessment.estimates ?? [],
      suggestions: assessment.suggestions,
      limitations: assessment.limitations,
    },
  };
}
