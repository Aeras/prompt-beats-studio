import { describe, expect, test } from "bun:test";
import { calibratePredictions, evaluatePredictionEligibility } from "./football-prediction-evaluation";
import type { FootballFixture, FootballResearchResult } from "./football-research.shared";

const fixture: FootballFixture = {
  source: "api-football", sourceFixtureId: "91", leagueId: "GR-SL",
  homeTeam: "Home", awayTeam: "Away", kickoffUtc: "2026-11-02T18:00:00Z",
  fetchedAtUtc: "2026-11-02T19:59:00Z", state: "finished",
};
const prediction: FootballResearchResult = {
  fixtureId: "91", modelId: "example", provider: "openrouter",
  createdAtUtc: "2026-11-02T17:00:00Z", dataCutoffUtc: "2026-11-02T16:59:00Z",
  status: "completed", sources: [], assessments: [{
    market: "goals_over_2_5", estimatedProbability: 0.5,
    evidenceQuality: "limited", rationale: "Test only", sourceUrls: [],
  }],
};

describe("prediction evaluation temporal integrity", () => {
  test("only prior predictions for the finalized fixture are eligible", () => {
    expect(evaluatePredictionEligibility(prediction, fixture)).toEqual({ eligible: true, reason: "eligible" });
    expect(evaluatePredictionEligibility({ ...prediction, createdAtUtc: fixture.kickoffUtc }, fixture).eligible).toBe(false);
    expect(evaluatePredictionEligibility({ ...prediction, dataCutoffUtc: fixture.kickoffUtc }, fixture).eligible).toBe(false);
    expect(evaluatePredictionEligibility(prediction, { ...fixture, state: "live" }).eligible).toBe(false);
    expect(evaluatePredictionEligibility(prediction, { ...fixture, sourceFixtureId: "other" }).eligible).toBe(false);
    expect(evaluatePredictionEligibility({ ...prediction, assessments: [] }, fixture).eligible).toBe(false);
  });
  test("calibration handles empty sets and rejects invalid probabilities", () => {
    expect(calibratePredictions([])).toEqual({ samples: 0, brierScore: null });
    expect(calibratePredictions([{ probability: 0.5, occurred: true }, { probability: 1, occurred: true }]))
      .toEqual({ samples: 2, brierScore: 0.125 });
    expect(() => calibratePredictions([{ probability: NaN, occurred: true }])).toThrow(RangeError);
  });
});
