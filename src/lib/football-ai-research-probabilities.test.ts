import { describe, expect, it } from "vitest";
import { validateFootballMarketProbabilities } from "./football-ai-research.shared";

const estimate = (market: string, percent: number) => ({
  market,
  percent,
  reason: "Test reasoning with supporting context.",
});

describe("football probability consistency", () => {
  const base = {
    summary: "Sufficiently long explanatory pre-match summary.",
    suggestions: [],
    limitations: [],
  };
  it("accepts coherent markets", () => {
    const assessment = {
      ...base,
      estimates: [
        estimate("home_win", 50),
        estimate("draw", 30),
        estimate("away_win", 20),
        estimate("double_chance_1x", 80),
        estimate("both_teams_score_yes", 55),
        estimate("both_teams_score_no", 45),
        estimate("goals_over_1_5", 70),
        estimate("goals_over_2_5", 50),
        estimate("goals_over_3_5", 25),
      ],
    };
    expect(validateFootballMarketProbabilities(assessment as never)).toEqual([]);
  });
  it("flags impossible totals, duplicate markets and non-monotonic thresholds", () => {
    const assessment = {
      ...base,
      estimates: [
        estimate("home_win", 50),
        estimate("draw", 30),
        estimate("away_win", 30),
        estimate("home_win", 50),
        estimate("goals_over_1_5", 35),
        estimate("goals_over_2_5", 55),
      ],
    };
    expect(validateFootballMarketProbabilities(assessment as never)).toEqual(
      expect.arrayContaining(["duplicate_markets", "one_x_two_sum", "nonmonotonic_goals_over_1_5"]),
    );
  });
  it("accepts qualitative-only analyses without fabricated numbers", () => {
    expect(validateFootballMarketProbabilities(base)).toEqual([]);
  });
});
