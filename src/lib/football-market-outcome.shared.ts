import type { FootballFixture, FootballMarket } from "./football-research.shared";

/** Resolve only markets unambiguously settled by 90-minute official FT goals. */
export function footballMarketOutcome(
  market: FootballMarket,
  fixture: FootballFixture,
): boolean | null {
  if (fixture.providerStatus !== "FT" || fixture.state !== "finished") return null;
  const home = fixture.homeGoals;
  const away = fixture.awayGoals;
  if (
    home == null ||
    away == null ||
    !Number.isSafeInteger(home) ||
    !Number.isSafeInteger(away) ||
    home < 0 ||
    away < 0
  )
    return null;
  const total = home + away;
  switch (market) {
    case "home_win":
      return home > away;
    case "draw":
      return home === away;
    case "away_win":
      return home < away;
    case "double_chance_1x":
      return home >= away;
    case "double_chance_x2":
      return away >= home;
    case "double_chance_12":
      return home !== away;
    case "both_teams_score_yes":
      return home > 0 && away > 0;
    case "both_teams_score_no":
      return home === 0 || away === 0;
    case "goals_over_1_5":
      return total > 1.5;
    case "goals_under_1_5":
      return total < 1.5;
    case "goals_over_2_5":
      return total > 2.5;
    case "goals_under_2_5":
      return total < 2.5;
    case "goals_over_3_5":
      return total > 3.5;
    case "goals_under_3_5":
      return total < 3.5;
    case "corners_over_8_5":
    case "corners_under_8_5":
    case "corners_over_9_5":
    case "corners_under_9_5":
      return null;
  }
}
