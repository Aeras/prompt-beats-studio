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

/**
 * "AI Search BETA" catalogue (12 competitions). IDs are application-owned,
 * never external provider IDs. `kind` drives flag vs trophy rendering.
 */
export const FOOTBALL_AI_DISCOVERY_LEAGUES = [
  {
    id: "IT-SA",
    country: "IT",
    kind: "flag",
    label: "Ιταλία — Serie A",
    labelEn: "Italy — Serie A",
    symbol: "🇮🇹",
  },
  {
    id: "EN-PL",
    country: "GB",
    kind: "flag",
    label: "Αγγλία — Premier League",
    labelEn: "England — Premier League",
    symbol: "🏴",
  },
  {
    id: "ES-LL",
    country: "ES",
    kind: "flag",
    label: "Ισπανία — La Liga",
    labelEn: "Spain — La Liga",
    symbol: "🇪🇸",
  },
  {
    id: "FR-L1",
    country: "FR",
    kind: "flag",
    label: "Γαλλία — Ligue 1",
    labelEn: "France — Ligue 1",
    symbol: "🇫🇷",
  },
  {
    id: "DE-BL",
    country: "DE",
    kind: "flag",
    label: "Γερμανία — Bundesliga",
    labelEn: "Germany — Bundesliga",
    symbol: "🇩🇪",
  },
  {
    id: "GR-SL",
    country: "GR",
    kind: "flag",
    label: "Ελλάδα — Super League",
    labelEn: "Greece — Super League",
    symbol: "🇬🇷",
  },
  {
    id: "NL-ED",
    country: "NL",
    kind: "flag",
    label: "Ολλανδία — Eredivisie",
    labelEn: "Netherlands — Eredivisie",
    symbol: "🇳🇱",
  },
  {
    id: "PT-PL",
    country: "PT",
    kind: "flag",
    label: "Πορτογαλία — Primeira Liga",
    labelEn: "Portugal — Primeira Liga",
    symbol: "🇵🇹",
  },
  {
    id: "BE-PL",
    country: "BE",
    kind: "flag",
    label: "Βέλγιο — Pro League",
    labelEn: "Belgium — Pro League",
    symbol: "🇧🇪",
  },
  {
    id: "CH-SL",
    country: "CH",
    kind: "flag",
    label: "Ελβετία — Super League",
    labelEn: "Switzerland — Super League",
    symbol: "🇨🇭",
  },
  {
    id: "UEFA-CL",
    country: "EU",
    kind: "cup",
    label: "UEFA Champions League",
    labelEn: "UEFA Champions League",
    symbol: "🏆",
  },
  {
    id: "UEFA-EL",
    country: "EU",
    kind: "cup",
    label: "UEFA Europa League",
    labelEn: "UEFA Europa League",
    symbol: "🏆",
  },
] as const;
export const FOOTBALL_AI_SOURCE_ID = "ai-search" as const;
/** Per-user paid refresh quota; authoritative enforcement is in SQL admission. */
export const FOOTBALL_AI_REFRESH_QUOTA = { perHour: 3, perDay: 10 } as const;
export type FootballAiDiscoveryLeagueId = (typeof FOOTBALL_AI_DISCOVERY_LEAGUES)[number]["id"];
export const FOOTBALL_AI_LEAGUE_IDS = FOOTBALL_AI_DISCOVERY_LEAGUES.map((x) => x.id) as [
  FootballAiDiscoveryLeagueId,
  ...FootballAiDiscoveryLeagueId[],
];

export const FOOTBALL_PROVIDERS = [
  { id: "football-data", label: "football-data.org" },
  { id: "api-football", label: "API-Football" },
  { id: "espn", label: "ESPN · χωρίς API key" },
] as const;
export type FootballProviderId = (typeof FOOTBALL_PROVIDERS)[number]["id"];
export const FOOTBALL_ESPN_LEAGUES = FOOTBALL_AI_DISCOVERY_LEAGUES.filter(
  (league) => league.id !== "CH-SL",
);
export type FootballEspnLeagueId = (typeof FOOTBALL_ESPN_LEAGUES)[number]["id"];
export const FOOTBALL_DATA_LEAGUES = ["EN-PL", "ES-LL", "IT-SA", "DE-BL", "FR-L1"] as const;

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
  leagueId: FootballAiDiscoveryLeagueId;
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
