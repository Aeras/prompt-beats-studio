import { describe, expect, it } from "vitest";
import {
  footballExpertDecisionSchema,
  footballResearchBriefSchema,
} from "./football-ai-research-phases.shared";

describe("football phased research contracts", () => {
  it("rejects unsourced invented-looking output fields", () => {
    expect(footballResearchBriefSchema.safeParse({
      fixture: { leagueId: "EN-PL", homeTeam: "A", awayTeam: "B", kickoffUtc: "2026-11-07T15:00:00.000Z" },
      retrievedAtUtc: "2026-11-02T12:00:00.000Z",
      standingsAndMotivation: [],
      recentFormAndHomeAway: [],
      underlyingStats: [],
      teamNewsAndLineups: [],
      scheduleRotationAndConditions: [],
      externalPredictions: [],
      contradictoryEvidence: [],
      missingData: ["No current lineups verified"],
      fabricatedStat: 100,
    }).success).toBe(false);
  });

  it("requires an explicit reason without a pick when abstaining", () => {
    const base = { decision: "abstain", avoid: "", limitations: [] };
    expect(footballExpertDecisionSchema.safeParse(base).success).toBe(false);
    expect(footballExpertDecisionSchema.safeParse({
      ...base, abstentionReason: "Insufficient pre-match evidence",
    }).success).toBe(true);
    expect(footballExpertDecisionSchema.safeParse({
      ...base, abstentionReason: "Insufficient pre-match evidence",
      planB: { market: "home_win", rationale: "Unsupported selection" },
    }).success).toBe(false);
  });
});
