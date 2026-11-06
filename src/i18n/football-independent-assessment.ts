import type { DescriptiveMarket } from "@/lib/football-evidence-v2.shared";
export const independentMessages = {
  el: {
    title: "Ανεξάρτητη εκτίμηση AI",
    abstain: "Τα διαθέσιμα στοιχεία δεν επαρκούν για τεκμηριωμένη επιλογή.",
    sources: "Πηγές",
    agreement: "Συμφωνία αναλυτών",
    disagreement: "Διαφορετικές εκτιμήσεις",
    noConsensus: "Δεν υπάρχει επαρκής σύγκριση ανεξάρτητων προγνωστικών.",
    opinions: "γνώμες πηγών, όχι πιθανότητα επιτυχίας",
    none: "Δεν υπάρχουν διαθέσιμες επαληθεύσιμες πηγές για αυτή την εκτίμηση.",
    qualitative: "Ποιοτική εκτίμηση, χωρίς εγγύηση αποτελέσματος ή προσφερόμενης απόδοσης.",
    confirm: (count: number, advanced: boolean) =>
      `Θα γίνουν ${count} ξεχωριστές έρευνες: 5 αναζητήσεις ανά αγώνα (ελληνικά, αγγλικά, ρωσικά, στατιστικά και ειδήσεις), έως 25 αποτελέσματα και μία κλήση AI ανά αγώνα. Εκτιμώμενη χρήση αναζήτησης: έως ${count * (advanced ? 10 : 5)} credits. Η AI χρεώνεται με βάση τη χρήση και το επιλεγμένο μοντέλο. Δεν γίνεται αυτόματη πληρωμένη επανάληψη. Επιβεβαιώνεις;`,
  },
  en: {
    title: "Independent AI assessment",
    abstain: "The available evidence does not support a defensible selection.",
    sources: "Sources",
    agreement: "Analyst agreement",
    disagreement: "Different assessments",
    noConsensus: "Insufficient comparable independent forecasts.",
    opinions: "source opinions, not a probability of success",
    none: "No checkable sources are available for this assessment.",
    qualitative: "Qualitative assessment, without an outcome guarantee or claim of offered odds.",
    confirm: (count: number, advanced: boolean) =>
      `${count} separate research runs: 5 searches per match (Greek, English, Russian, statistics and news), up to 25 results and one AI call per match. Estimated search usage: up to ${count * (advanced ? 10 : 5)} credits. AI is charged according to usage and the selected model. No automatic paid retry. Confirm?`,
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
