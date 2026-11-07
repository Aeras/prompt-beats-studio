import {
  type FootballSearchProfileVersion,
  FOOTBALL_SEARCH_PROFILES,
  FOOTBALL_V2_RU_LABELS,
} from "./football-search-profiles.shared";
import { footballTeamRegistry } from "./football-team-registry.shared";
import { fixtureLocalDate } from "./football-evidence-v2.shared";
import type { OddsTarget } from "./football-odds.shared";
export type ForecastProfile = "P0" | "P1-Lean" | "P1-Preserve";
const months = {
  el: [
    "Ιανουαρίου",
    "Φεβρουαρίου",
    "Μαρτίου",
    "Απριλίου",
    "Μαΐου",
    "Ιουνίου",
    "Ιουλίου",
    "Αυγούστου",
    "Σεπτεμβρίου",
    "Οκτωβρίου",
    "Νοεμβρίου",
    "Δεκεμβρίου",
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  ru: [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ],
};
function label(name: string, language: "el" | "en" | "ru") {
  const r = footballTeamRegistry.resolve(name);
  if (r.status !== "matched") return name.slice(0, 200);
  if (language === "el") return r.team.nameEl;
  if (language === "ru")
    return r.team.aliases.find((a) => /\p{Script=Cyrillic}/u.test(a)) ?? r.team.name;
  return r.team.name;
}
/** Server-owned plans. The real handler fixes P1-Preserve; request input cannot select a profile. */
export function planFootballForecasts(f: OddsTarget, profile: ForecastProfile = "P0") {
  const home = footballTeamRegistry.resolve(f.homeTeam);
  const local = fixtureLocalDate(f).date
    ? fixtureLocalDate(f)
    : home.status === "matched"
      ? fixtureLocalDate({ ...f, leagueId: home.team.domesticLeague })
      : fixtureLocalDate(f);
  if (!local.date) throw Error("verified_venue_timezone_required");
  const [year, month, day] = local.date.split("-").map(Number);
  const queries = (["el", "en", "ru"] as const).map((language) => ({
    language,
    intent: "external_forecasts" as const,
    query: `${label(f.homeTeam, language)} ${language === "en" ? "vs " : ""}${label(f.awayTeam, language)} ${day} ${months[language][month! - 1]} ${year} ${language === "el" ? "προγνωστικά αγώνα" : language === "en" ? "match prediction preview" : "прогноз на матч"}`,
  }));
  const base = `${f.homeTeam} vs ${f.awayTeam} ${local.date}`;
  const facts =
    profile === "P0"
      ? []
      : profile === "P1-Lean"
        ? [`${base} verified match statistics injuries team news`]
        : [
            `${base} expected goals xG xGA recent form home away verified match statistics`,
            `${base} latest injuries expected starting eleven rotation team news`,
          ];
  return {
    profile,
    enabledForPaidDispatch: profile === "P1-Preserve",
    venueTimezone: local.timezone,
    localDate: local.date,
    queries: [
      ...queries,
      ...facts.map((query) => ({ language: "en" as const, intent: "match_facts" as const, query })),
    ],
    searchCalls: queries.length + facts.length,
    resultsPerSearch: 5,
    extraCallsComparedWithProduction: facts.length,
    webFactsCoverage:
      profile === "P0"
        ? "removed"
        : profile === "P1-Lean"
          ? "consolidated_unmeasured"
          : "preserved",
    extractEnabled: false,
    llmExtractionEnabled: false,
    discoveryMeasured: false,
  };
}

export const FOOTBALL_V2_EN_SUFFIX =
  "Find independent published predictions and betting recommendations from distinct publishers for this exact match. Look for an explicit author's pick and reasoning—e.g. 1X2, double chance, totals, BTTS, score, handicap, player or corner bets, or any other bettable market. These are examples, not limits. Exclude odds-only pages, news and statistics without a pick.";
export const FOOTBALL_V2_RU_SUFFIX =
  "Найди независимые опубликованные прогнозы и рекомендации по ставкам от разных авторов на этот матч. Нужен конкретный выбор с обоснованием: например, исход, двойной шанс, тотал, обе забьют, счёт, фора, ставки на игроков, угловые или любой другой рынок. Это примеры, не ограничения. Исключи страницы только с коэффициентами, новостями и статистикой без прогноза.";
// Explicit manually-reviewed spellings; never runtime AI aliases or provider-ID guesses.

export function planFootballSearchProfile(
  f: OddsTarget,
  version: FootballSearchProfileVersion = "v1_current",
) {
  if (version === "v1_current")
    return {
      ...planFootballForecasts(f, "P1-Preserve"),
      searchProfileVersion: version,
      ledgerProfile: "P1-Preserve" as const,
    };
  if (version !== "v2_experimental") throw Error("invalid_football_search_profile");
  const h = footballTeamRegistry.resolve(f.homeTeam),
    a = footballTeamRegistry.resolve(f.awayTeam);
  const local = fixtureLocalDate(f);
  if (
    h.status !== "matched" ||
    a.status !== "matched" ||
    h.team.id === a.team.id ||
    !local.date ||
    h.team.domesticLeague !== f.leagueId ||
    a.team.domesticLeague !== f.leagueId
  )
    throw Error("verified_profile_fixture_identity_required");
  const [year, month, day] = local.date.split("-").map(Number);
  const queries = (["en", "ru"] as const).map((language) => {
    const date = `${day} ${months[language][month! - 1]} ${year}`;
    const suffix = language === "en" ? FOOTBALL_V2_EN_SUFFIX : FOOTBALL_V2_RU_SUFFIX;
    const options = (r: typeof h) => {
      if (r.status !== "matched") throw Error("unverified_team");
      const preferred =
        language === "ru"
          ? (FOOTBALL_V2_RU_LABELS[r.team.id] ??
            r.team.aliases.find((x) => /\p{Script=Cyrillic}/u.test(x)) ??
            r.team.name)
          : r.team.name;
      return [
        ...new Set([
          preferred,
          ...r.team.aliases.filter((alias) => {
            const x = footballTeamRegistry.resolve(alias);
            return (
              x.status === "matched" &&
              x.team.id === r.team.id &&
              !/\p{Script=Greek}/u.test(alias) &&
              (language === "ru" || !/\p{Script=Cyrillic}/u.test(alias))
            );
          }),
        ]),
      ];
    };
    const compose = (home: string, away: string) =>
      `${home}${language === "en" ? " vs " : " — "}${away}, ${date}. ${suffix}`;
    const hs = options(h),
      as = options(a);
    let query = compose(hs[0]!, as[0]!);
    if (Array.from(query).length > 400) {
      const pairs = hs
        .flatMap((home) => as.map((away) => ({ home, away, text: compose(home, away) })))
        .filter((x) => Array.from(x.text).length <= 400)
        .sort((x, y) => Array.from(x.text).length - Array.from(y.text).length);
      if (!pairs.length) throw Error("football_query_identity_exceeds_400_characters");
      query = pairs[0]!.text;
    }
    return { language, intent: "external_forecasts" as const, query };
  });
  return {
    profile: "forecast-only-2" as const,
    ledgerProfile: "forecast-only-2" as const,
    searchProfileVersion: version,
    venueTimezone: local.timezone,
    localDate: local.date,
    queries,
    searchCalls: FOOTBALL_SEARCH_PROFILES[version].searchCalls,
    resultsPerSearch: 10,
    enabledForPaidDispatch: true,
    webFactsCoverage: "providers_only",
    extractEnabled: false,
    llmExtractionEnabled: false,
    discoveryMeasured: false,
  };
}
