import { describe, expect, it } from "bun:test";
import {
  footballExpertDecisionSchema,
  FOOTBALL_EXPERT_ANALYST_SYSTEM,
  footballResearchBriefSchema,
} from "./football-ai-research-phases.shared";

describe("football phased research contracts", () => {
  it("expert prompt specifies the mandatory JSON contract", () => {
    expect(FOOTBALL_EXPERT_ANALYST_SYSTEM).toContain("strongestEvidence");
    expect(FOOTBALL_EXPERT_ANALYST_SYSTEM).toContain("mainRisk");
    expect(FOOTBALL_EXPERT_ANALYST_SYSTEM).toContain("abstentionReason");
    expect(FOOTBALL_EXPERT_ANALYST_SYSTEM).toContain("limitations");
    expect(FOOTBALL_EXPERT_ANALYST_SYSTEM).toContain("planB MUST be omitted");
  });

  it("accepts a fully structured independent pick and rejects missing evidence", () => {
    const pick = {
      decision: "pick",
      primary: {
        market: "double_chance_x2",
        percent: 65,
        confidence: "medium",
        rationale: "The limited available context supports only a cautious subjective estimate.",
        strongestEvidence: "Independent match source evidence",
        mainRisk: "Unconfirmed lineups and rotation",
      },
      avoid: "Avoid unsupported exact-score markets.",
      limitations: [],
    };
    expect(footballExpertDecisionSchema.safeParse(pick).success).toBe(true);
    expect(
      footballExpertDecisionSchema.safeParse({
        ...pick,
        primary: { ...pick.primary, strongestEvidence: "" },
      }).success,
    ).toBe(false);
  });

  it("rejects unsourced invented-looking output fields", () => {
    expect(
      footballResearchBriefSchema.safeParse({
        fixture: {
          leagueId: "EN-PL",
          homeTeam: "A",
          awayTeam: "B",
          kickoffUtc: "2026-11-07T15:00:00.000Z",
        },
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
      }).success,
    ).toBe(false);
  });

  it("requires an explicit reason without a pick when abstaining", () => {
    const base = { decision: "abstain", avoid: "", limitations: [] };
    expect(footballExpertDecisionSchema.safeParse(base).success).toBe(false);
    expect(
      footballExpertDecisionSchema.safeParse({
        ...base,
        abstentionReason: "Insufficient pre-match evidence",
      }).success,
    ).toBe(true);
    expect(
      footballExpertDecisionSchema.safeParse({
        ...base,
        abstentionReason: "Insufficient pre-match evidence",
        planB: { market: "home_win", rationale: "Unsupported selection" },
      }).success,
    ).toBe(false);
  });
});
