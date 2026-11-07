import {
  FOOTBALL_SEARCH_PROFILES,
  type FootballSearchProfileVersion,
} from "@/lib/football-search-profiles.shared";
import type { DescriptiveMarket } from "@/lib/football-evidence-v2.shared";
export const independentMessages = {
  el: {
    title: "Ανεξάρτητη εκτίμηση AI",
    abstain: "Τα διαθέσιμα στοιχεία δεν επαρκούν για τεκμηριωμένη επιλογή.",
    sources: "Πηγές",
    agreement: "Συμφωνία αναλυτών",
    disagreement: "Διαφορετικές εκτιμήσεις",
    providerOnly:
      "Εκτίμηση από τα αγωνιστικά στοιχεία, χωρίς επιβεβαιωμένη συμφωνία δημοσιευμένων προγνωστικών.",
    noConsensus: "Δεν υπάρχει επαρκής σύγκριση ανεξάρτητων προγνωστικών.",
    opinions: "γνώμες πηγών, όχι πιθανότητα επιτυχίας",
    none: "Δεν υπάρχουν διαθέσιμες επαληθεύσιμες πηγές για αυτή την εκτίμηση.",
    qualitative: "Ποιοτική εκτίμηση, χωρίς εγγύηση αποτελέσματος ή προσφερόμενης απόδοσης.",
    confirm: (
      count: number,
      advanced: boolean,
      profile: FootballSearchProfileVersion = "v1_current",
    ) =>
      `${FOOTBALL_SEARCH_PROFILES[profile].label} · ${advanced ? "Advanced" : "Basic"}. Θα γίνουν ${count} ξεχωριστές έρευνες: ${FOOTBALL_SEARCH_PROFILES[profile].searchCalls} αναζητήσεις ανά αγώνα (${profile === "v1_current" ? "ελληνικά, αγγλικά, ρωσικά, στατιστικά και ειδήσεις" : "αγγλικά και ρωσικά προγνωστικά, χωρίς web αναζήτηση στατιστικών/ειδήσεων"}), έως ${FOOTBALL_SEARCH_PROFILES[profile].resultsPerSearch} αποτελέσματα ανά αναζήτηση, έως ${FOOTBALL_SEARCH_PROFILES[profile].maxCandidates} ανά αγώνα και ${profile === "v2_experimental" ? "έως πέντε κλήσεις AI για ανάγνωση όλων των πηγών και τελική σύνθεση, με συντηρητικό ανώτατο όριο 1.331.200 tokens εισόδου και 49.152 tokens εξόδου συνολικά" : "μία κλήση AI"}. Εκτιμώμενη χρήση αναζήτησης: έως ${count * FOOTBALL_SEARCH_PROFILES[profile].searchCalls * (advanced ? 2 : 1)} credits. Η AI χρεώνεται με βάση τη χρήση και το επιλεγμένο μοντέλο. Δεν γίνεται αυτόματη πληρωμένη επανάληψη. Επιβεβαιώνεις;`,
  },
  en: {
    title: "Independent AI assessment",
    abstain: "The available evidence does not support a defensible selection.",
    sources: "Sources",
    agreement: "Analyst agreement",
    disagreement: "Different assessments",
    providerOnly:
      "Assessment based on match data, without confirmed agreement among published forecasts.",
    noConsensus: "Insufficient comparable independent forecasts.",
    opinions: "source opinions, not a probability of success",
    none: "No checkable sources are available for this assessment.",
    qualitative: "Qualitative assessment, without an outcome guarantee or claim of offered odds.",
    confirm: (
      count: number,
      advanced: boolean,
      profile: FootballSearchProfileVersion = "v1_current",
    ) =>
      `${profile === "v1_current" ? "Version 1 — Current" : "Version 2 — Experimental"} · ${advanced ? "Advanced" : "Basic"}. ${count} separate research runs: ${FOOTBALL_SEARCH_PROFILES[profile].searchCalls} searches per match (${profile === "v1_current" ? "Greek, English, Russian, statistics and news" : "English/Russian forecasts only; no web statistics/news search"}), up to ${FOOTBALL_SEARCH_PROFILES[profile].resultsPerSearch} results per search, ${FOOTBALL_SEARCH_PROFILES[profile].maxCandidates} per match and ${profile === "v2_experimental" ? "up to five AI calls for full source reading and synthesis, a conservative upper bound of 1,331,200 input tokens and 49,152 output tokens in total" : "one AI call"}. Estimated search usage: up to ${count * FOOTBALL_SEARCH_PROFILES[profile].searchCalls * (advanced ? 2 : 1)} credits. AI is charged according to usage and the selected model. No automatic paid retry. Confirm?`,
  },
} as const;
export function legacyMarketAst(m: string): DescriptiveMarket | undefined {
  const simple: Record<string, DescriptiveMarket> = {
    home_win: { kind: "1x2", period: "FT", selection: "1" },
    draw: { kind: "1x2", period: "FT", selection: "X" },
    away_win: { kind: "1x2", period: "FT", selection: "2" },
    double_chance_1x: { kind: "dc", period: "FT", selection: "1X" },
    double_chance_x2: { kind: "dc", period: "FT", selection: "X2" },
    double_chance_12: { kind: "dc", period: "FT", selection: "12" },
    both_teams_score_yes: { kind: "btts", period: "FT", selection: "yes" },
    both_teams_score_no: { kind: "btts", period: "FT", selection: "no" },
  };
  if (Object.hasOwn(simple, m)) return simple[m];
  const line = m.match(/^goals_(over|under)_(\d)_(\d)$/);
  return line
    ? {
        kind: "total",
        period: "FT",
        selection: line[1] as "over" | "under",
        line: Number(line[2] + "." + line[3]),
      }
    : undefined;
}
