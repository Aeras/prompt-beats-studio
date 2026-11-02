import { describe, expect, test } from "bun:test";
import {
  footballAiAssessmentSchema,
  footballAnalysisRequestSchema,
} from "./football-ai-research.shared";

describe("private football AI contracts", () => {
  test("explicit per-request paid-call approval is required", () => {
    const base = {
      leagueId: "GR-SL",
      weekDate: "2026-11-01",
      fixtureId: "123",
      requestKey: "bd849d54-8b2b-4c64-9692-5c937ecf2e71",
      modelId: "openai/gpt-5.6-luna",
      withTavily: false,
    };
    expect(footballAnalysisRequestSchema.safeParse(base).success).toBe(false);
    expect(
      footballAnalysisRequestSchema.safeParse({ ...base, approvePaidRequest: true }).success,
    ).toBe(true);
    expect(
      footballAnalysisRequestSchema.safeParse({ ...base, approvePaidRequest: false }).success,
    ).toBe(false);
    expect(
      footballAnalysisRequestSchema.safeParse({
        ...base,
        leagueId: "UNKNOWN",
        approvePaidRequest: true,
      }).success,
    ).toBe(false);
  });
  test("ESPN accepts supported fixture identity without AI source corroboration", () => {
    const base = {
      fixtureProvider: "espn",
      leagueId: "UEFA-CL",
      weekDate: "2026-11-02",
      fixtureId: "123456",
      requestKey: "bd849d54-8b2b-4c64-9692-5c937ecf2e71",
      modelId: "openai/gpt-5.6-luna",
      withTavily: true,
      approvePaidRequest: true,
    };
    expect(footballAnalysisRequestSchema.safeParse(base).success).toBe(true);
    expect(footballAnalysisRequestSchema.safeParse({ ...base, leagueId: "CH-SL" }).success).toBe(
      true,
    );
    expect(
      footballAnalysisRequestSchema.safeParse({ ...base, fixtureProvider: "unknown" }).success,
    ).toBe(false);
  });

  test("malformed AI output reports a safe schema field path", () => {
    const invalid = footballAiAssessmentSchema.safeParse({
      summary: "Η αξιολόγηση δεν μπορεί να ολοκληρωθεί χωρίς επαρκή ανάλυση.",
      suggestions: [{ market: "home_win", rationale: "ok", evidence: "limited" }],
      limitations: [],
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues.some((issue) => issue.path.join(".") === "suggestions.0.rationale")).toBe(true);
    }
  });

  test("unknown betting markets, invented probability and excessive suggestions rejected", () => {
    const example = {
      summary: "Η διαθέσιμη τεκμηρίωση είναι περιορισμένη και δεν στηρίζει ασφαλή πρόβλεψη.",
      suggestions: [
        {
          market: "goals_over_2_5",
          rationale: "Οι πηγές δεν παρέχουν επαληθευμένα δεδομένα.",
          evidence: "limited",
        },
      ],
      limitations: ["Ανεπαρκή δεδομένα"],
    };
    expect(footballAiAssessmentSchema.safeParse(example).success).toBe(true);
    expect(
      footballAiAssessmentSchema.safeParse({
        ...example,
        estimates: [
          {
            market: "home_win",
            percent: 35,
            reason: "Conservative judgement from verified source excerpts",
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      footballAiAssessmentSchema.safeParse({
        ...example,
        estimates: [{ market: "home_win", percent: 135, reason: "Impossible over-100 likelihood" }],
      }).success,
    ).toBe(false);
    expect(
      footballAiAssessmentSchema.safeParse({
        ...example,
        deepDive: {
          form: "Η πρόσφατη φόρμα εξετάζεται μόνο με επαληθευμένα αποτελέσματα αγώνων.",
          tactics: "Η τακτική προσέγγιση παραμένει αβέβαιη χωρίς επαρκείς πηγές.",
          teamNews: "Δεν εντοπίστηκε διασταυρωμένη πληροφορία για τις απουσίες.",
          uncertainty: "Οι πηγές παρουσιάζουν ελλείψεις και χρειάζεται επιφύλαξη.",
        },
      }).success,
    ).toBe(true);

    expect(footballAiAssessmentSchema.safeParse({ ...example, probability: 0.97 }).success).toBe(
      false,
    );
    expect(
      footballAiAssessmentSchema.safeParse({
        ...example,
        suggestions: [{ ...example.suggestions[0], market: "unknown" }],
      }).success,
    ).toBe(false);
    expect(
      footballAiAssessmentSchema.safeParse({
        ...example,
        suggestions: Array(9).fill(example.suggestions[0]),
      }).success,
    ).toBe(false);
  });
});
