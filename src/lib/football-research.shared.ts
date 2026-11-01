/**
 * Private football research — client-safe, provider-independent contracts.
 * No betting placement, credentials, probabilistic guarantees or paid calls.
 */
export const FOOTBALL_LEAGUES = [
  { id: "GR-SL", country: "GR", label: "Ελλάδα — Super League", timezone: "Europe/Athens" },
  { id: "EN-PL", country: "GB", label: "Αγγλία — Premier League", timezone: "Europe/London" },
  { id: "ES-LL", country: "ES", label: "Ισπανία — La Liga", timezone: "Europe/Madrid" },
  { id: "IT-SA", country: "IT", label: "Ιταλία — Serie A", timezone: "Europe/Rome" },
  { id: "DE-BL", country: "DE", label: "Γερμανία — Bundesliga", timezone: "Europe/Berlin" },
  { id: "FR-L1", country: "FR", label: "Γαλλία — Ligue 1", timezone: "Europe/Paris" },
] as const;

export type FootballLeagueId = (typeof FOOTBALL_LEAGUES)[number]["id"];
export type FootballMarket =
  | "home_win"
  | "draw"
  | "away_win"
  | "double_chance_1x"
  | "double_chance_x2"
  | "double_chance_12"
  | "both_teams_score_yes"
  | "both_teams_score_no"
  | "goals_over_1_5"
  | "goals_under_1_5"
  | "goals_over_2_5"
  | "goals_under_2_5"
  | "goals_over_3_5"
  | "goals_under_3_5"
  | "corners_over_8_5"
  | "corners_under_8_5"
  | "corners_over_9_5"
  | "corners_under_9_5";

export type FootballFixture = {
  source: string;
  sourceFixtureId: string;
  leagueId: FootballLeagueId;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  state: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
  fetchedAtUtc: string;
  /** Official fixture status, including FT/AET/PEN distinctions for grading. */
  providerStatus?: string;
  homeGoals?: number | null;
  awayGoals?: number | null;
};

export type FootballResearchSource = {
  url: string;
  title: string;
  publishedAtUtc: string | null;
  retrievedAtUtc: string;
  language: string | null;
};

export type FootballMarketAssessment = {
  market: FootballMarket;
  /** Null means insufficient data; never manufacture a percentage. */
  estimatedProbability: number | null;
  /** Probability calibration and source quality must be separately tested. */
  evidenceQuality: "insufficient" | "limited" | "supported";
  rationale: string;
  sourceUrls: string[];
};

export type FootballResearchResult = {
  fixtureId: string;
  modelId: string;
  provider: "openrouter";
  createdAtUtc: string;
  dataCutoffUtc: string;
  sources: FootballResearchSource[];
  assessments: FootballMarketAssessment[];
  status: "completed" | "insufficient_evidence";
};

/** Compare a recorded probability to a binary outcome. Lower is better. */
export function brierScore(probability: number, occurred: boolean): number {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError("Probability must be a finite number between 0 and 1.");
  }
  return (probability - Number(occurred)) ** 2;
}

/** Exclusive of future fixtures: prevents look-ahead in historical evaluation. */
export function strictlyPredatesKickoff(createdAtUtc: string, kickoffUtc: string): boolean {
  const created = Date.parse(createdAtUtc);
  const kickoff = Date.parse(kickoffUtc);
  return Number.isFinite(created) && Number.isFinite(kickoff) && created < kickoff;
}
