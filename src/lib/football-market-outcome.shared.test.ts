import { describe, expect, test } from "bun:test";
import { footballMarketOutcome } from "./football-market-outcome.shared";
import type { FootballFixture } from "./football-research.shared";

const final: FootballFixture = {
  source: "api-football", sourceFixtureId: "1", leagueId: "GR-SL",
  homeTeam: "Home", awayTeam: "Away", kickoffUtc: "2026-11-01T17:00:00Z",
  state: "finished", providerStatus: "FT", homeGoals: 2, awayGoals: 1,
  fetchedAtUtc: "2026-11-01T19:00:00Z",
};

describe("football research evaluation against official results", () => {
  test("1X2, double-chance, GG, totals are settled on FT", () => {
    expect(footballMarketOutcome("home_win", final)).toBe(true);
    expect(footballMarketOutcome("draw", final)).toBe(false);
    expect(footballMarketOutcome("double_chance_1x", final)).toBe(true);
    expect(footballMarketOutcome("double_chance_x2", final)).toBe(false);
    expect(footballMarketOutcome("both_teams_score_yes", final)).toBe(true);
    expect(footballMarketOutcome("goals_over_2_5", final)).toBe(true);
    expect(footballMarketOutcome("goals_under_3_5", final)).toBe(true);
    expect(footballMarketOutcome("corners_over_8_5", final)).toBeNull();
  });
  test("never grades provisional, post-90-minute or missing scores", () => {
    expect(footballMarketOutcome("home_win", { ...final, providerStatus: "PEN" })).toBeNull();
    expect(footballMarketOutcome("home_win", { ...final, state: "live" })).toBeNull();
    expect(footballMarketOutcome("home_win", { ...final, homeGoals: null })).toBeNull();
  });
});
