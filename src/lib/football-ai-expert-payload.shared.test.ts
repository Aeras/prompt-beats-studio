import { describe, expect, test } from "bun:test";
import { buildFootballExpertPayload } from "./football-ai-expert-payload.shared";
import { footballAiAssessmentSchema } from "./football-ai-research.shared";
import { FOOTBALL_EXPERT_ANALYST_SYSTEM } from "./football-ai-research-phases.shared";

describe("independent football expert evidence handoff", () => {
  const base = {
    summary: "Προσεκτική αποτίμηση του αγώνα με βάση τα διαθέσιμα δεδομένα.",
    suggestions: [],
    limitations: ["Η ενδεκάδα δεν έχει επιβεβαιωθεί."],
  };

  test("passes the complete base deep dive, estimates, claims and source extracts", () => {
    const assessment = footballAiAssessmentSchema.parse({
      ...base,
      deepDive: {
        form: "Η πρόσφατη αγωνιστική εικόνα παραμένει αβέβαιη λόγω μικρού δείγματος.",
        tactics: "Η τακτική προσέγγιση μπορεί να αλλάξει ανάλογα με τις ενδεκάδες.",
        teamNews: "Δεν υπάρχουν επιβεβαιωμένες ενδεκάδες κατά την ώρα της ανάλυσης.",
        uncertainty: "Η έλλειψη πρόσφατων στοιχείων αφήνει σημαντικό περιθώριο αβεβαιότητας.",
      },
      estimates: [
        { market: "home_win", percent: 40, reason: "Συντηρητική αξιολόγηση περιορισμένων πηγών." },
      ],
      matchContext: {
        claims: [
          {
            category: "form",
            claim: "Οι πηγές διαφωνούν για την πρόσφατη αγωνιστική εικόνα.",
            sourceUrl: "https://example.com/match",
            status: "reported",
          },
        ],
        missing: ["Ενδεκάδες"],
        conflicts: ["Διαφωνία εξωτερικών προβλέψεων"],
      },
      researchBrief: {
        collectedAtUtc: "2026-11-03T08:00:00.000Z",
        matchFacts: [
          {
            title: "Match facts",
            url: "https://example.com/match",
            accessedAt: "2026-11-03T08:00:00.000Z",
            excerpt: "Source extract",
            researchIntent: "match_facts",
          },
        ],
        externalForecasts: [],
        evidenceStatus: "unverified_source_extracts",
      },
    });
    const input = buildFootballExpertPayload(assessment);
    expect(input.baseAssessment.deepDive).toEqual(assessment.deepDive);
    expect(input.baseAssessment.estimates).toEqual(assessment.estimates);
    expect(input.matchContext).toEqual(assessment.matchContext);
    expect(input.researchBrief).toEqual(assessment.researchBrief);
    expect(input.baseAssessment.limitations).toEqual(assessment.limitations);
  });

  test("legacy optional fields remain explicitly absent without inventing evidence", () => {
    const input = buildFootballExpertPayload(footballAiAssessmentSchema.parse(base));
    expect(input.researchBrief).toBeNull();
    expect(input.matchContext).toBeNull();
    expect(input.baseAssessment.deepDive).toBeNull();
    expect(input.baseAssessment.estimates).toEqual([]);
  });

  test("experimental expert asks for independent football judgment without forced pick", () => {
    expect(FOOTBALL_EXPERT_ANALYST_SYSTEM).toContain("independent");
    expect(FOOTBALL_EXPERT_ANALYST_SYSTEM).toContain("subjective");
    expect(FOOTBALL_EXPERT_ANALYST_SYSTEM).toContain("abstain");
    expect(FOOTBALL_EXPERT_ANALYST_SYSTEM).toContain("planB MUST be omitted");
    expect(FOOTBALL_EXPERT_ANALYST_SYSTEM).toContain("Do not force a pick");
  });
});
