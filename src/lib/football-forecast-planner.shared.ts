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
/** Offline-only candidate plans. No caller may turn this into extra paid calls by request input. */
export function planFootballForecasts(f: OddsTarget, profile: ForecastProfile = "P0") {
  const local = fixtureLocalDate(f);
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
    enabledForPaidDispatch: false as const,
    venueTimezone: local.timezone,
    localDate: local.date,
    queries: [
      ...queries,
      ...facts.map((query) => ({ language: "en" as const, intent: "match_facts" as const, query })),
    ],
    searchCalls: queries.length + facts.length,
    resultsPerSearch: 3,
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
