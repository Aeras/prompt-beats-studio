/**
 * Football research temporal and evidence safety checks.
 * Deliberately pure and executable in offline tests.
 */
import type { FootballFixture, FootballResearchResult } from "./football-research.shared";

export type PredictionEvaluation = {
  eligible: boolean;
  reason:
    | "eligible"
    | "not_finished"
    | "after_kickoff"
    | "different_fixture"
    | "invalid_timestamp"
    | "insufficient_evidence";
};

export function evaluatePredictionEligibility(
  prediction: FootballResearchResult,
  fixture: FootballFixture,
): PredictionEvaluation {
  if (prediction.fixtureId !== fixture.sourceFixtureId)
    return { eligible: false, reason: "different_fixture" };
  if (fixture.state !== "finished") return { eligible: false, reason: "not_finished" };
  const created = Date.parse(prediction.createdAtUtc);
  const cutoff = Date.parse(prediction.dataCutoffUtc);
  const kickoff = Date.parse(fixture.kickoffUtc);
  if (![created, cutoff, kickoff].every(Number.isFinite))
    return { eligible: false, reason: "invalid_timestamp" };
  if (created >= kickoff || cutoff > created) return { eligible: false, reason: "after_kickoff" };
  if (!prediction.assessments.some((assessment) => assessment.estimatedProbability !== null)) {
    return { eligible: false, reason: "insufficient_evidence" };
  }
  return { eligible: true, reason: "eligible" };
}

export function calibratePredictions(rows: readonly { probability: number; occurred: boolean }[]) {
  let squaredError = 0;
  for (const row of rows) {
    if (!Number.isFinite(row.probability) || row.probability < 0 || row.probability > 1) {
      throw new RangeError("Invalid probability");
    }
    squaredError += (row.probability - Number(row.occurred)) ** 2;
  }
  return {
    samples: rows.length,
    brierScore: rows.length ? squaredError / rows.length : null,
  };
}
