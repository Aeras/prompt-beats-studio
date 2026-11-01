import { describe, expect, test } from "bun:test";
import {
  footballAiAssessmentSchema,
  footballAnalysisRequestSchema,
} from "./football-ai-research.shared";

describe("private football AI contracts", () => {
  test("explicit per-request paid-call approval is required", () => {
    const base = {
      leagueId: "GR-SL", weekDate: "2026-11-01", fixtureId: "123",
      modelId: "openai/gpt-5.6-luna", withTavily: false,
    };
    expect(footballAnalysisRequestSchema.safeParse(base).success).toBe(false);
    expect(footballAnalysisRequestSchema.safeParse({ ...base, approvePaidRequest: true }).success).toBe(true);
    expect(footballAnalysisRequestSchema.safeParse({ ...base, approvePaidRequest: false }).success).toBe(false);
    expect(footballAnalysisRequestSchema.safeParse({ ...base, leagueId: "UNKNOWN", approvePaidRequest: true }).success).toBe(false);
  });
  test("unknown betting markets, invented probability and excessive suggestions rejected", () => {
    const example = {
      summary: "Η διαθέσιμη τεκμηρίωση είναι περιορισμένη και δεν στηρίζει ασφαλή πρόβλεψη.",
      suggestions: [{ market: "goals_over_2_5", rationale: "Οι πηγές δεν παρέχουν επαληθευμένα δεδομένα.", evidence: "limited" }],
      limitations: ["Ανεπαρκή δεδομένα"],
    };
    expect(footballAiAssessmentSchema.safeParse(example).success).toBe(true);
    expect(footballAiAssessmentSchema.safeParse({ ...example, probability: 0.97 }).success).toBe(false);
    expect(footballAiAssessmentSchema.safeParse({ ...example, suggestions: [{ ...example.suggestions[0], market: "unknown" }] }).success).toBe(false);
    expect(footballAiAssessmentSchema.safeParse({ ...example, suggestions: Array(9).fill(example.suggestions[0]) }).success).toBe(false);
  });
});
