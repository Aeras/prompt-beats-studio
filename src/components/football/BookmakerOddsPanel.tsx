import { useI18n } from "@/i18n";
import { footballTeamDisplayName } from "@/lib/football-ai-team-names.shared";
import { compareSubjectiveToOdds } from "@/lib/football-odds-core";
import {
  oddsProbabilities,
  usableOdds,
  type BookmakerOddsSnapshot,
} from "@/lib/football-odds.shared";
const labels: Record<string, string> = {
  home_win: "1",
  draw: "Χ",
  away_win: "2",
  double_chance_1x: "1Χ",
  double_chance_x2: "Χ2",
  double_chance_12: "12",
  both_teams_score_yes: "GG",
  both_teams_score_no: "NG",
  goals_over_1_5: "Over 1,5",
  goals_under_1_5: "Under 1,5",
  goals_over_2_5: "Over 2,5",
  goals_under_2_5: "Under 2,5",
  goals_over_3_5: "Over 3,5",
  goals_under_3_5: "Under 3,5",
};
const statuses: Record<BookmakerOddsSnapshot["status"], string> = {
  matched: "Ταυτοποιημένο ιστορικό στιγμιότυπο",
  missing: "Δεν βρέθηκαν αντίστοιχες αποδόσεις",
  ambiguous: "Αμφίσημη αντιστοίχιση",
  conflict: "Ασυμφωνία αγώνα",
  stale: "Μη πρόσφατες αποδόσεις",
  not_configured: "Δεν έχει ρυθμιστεί",
  unavailable: "Προσωρινά μη διαθέσιμο",
  busy: "Ανάκτηση σε εξέλιξη",
  recovery_pending: "Άγνωστη έκβαση ανάκτησης · αναμονή ασφαλούς ανανέωσης",
  quota_exhausted: "Εξαντλήθηκε η ποσόστωση παρόχου",
  rate_limited: "Περιορισμός παρόχου",
  access_denied: "Ο πάροχος αρνήθηκε πρόσβαση",
  invalid_response: "Μη έγκυρη απάντηση",
  timeout: "Λήξη χρόνου ανάκτησης",
  too_large: "Υπέρβαση μεγέθους απάντησης",
};
/** Pure rendering of server-owned snapshot. No refresh, AI, raw feed or secret. */
export function BookmakerOddsPanel({
  snapshot,
  estimates = [],
  outcomes = [],
}: {
  snapshot: BookmakerOddsSnapshot;
  estimates?: { market: string; percent: number }[];
  outcomes?: { market: string; outcome: boolean | null }[];
}) {
  const { language } = useI18n();
  const probabilities = oddsProbabilities(snapshot);
  const current = usableOdds(snapshot, new Date().toISOString());
  return (
    <section
      aria-label="Αποδόσεις Stoiximan"
      className="min-w-0 space-y-3 rounded-2xl border border-border bg-card/80 p-4 text-card-foreground"
    >
      <h3 className="font-bold">ArbPlay / Stoiximan · Αποδόσεις</h3>
      <p className="break-words text-sm">
        {footballTeamDisplayName(snapshot.fixture.homeTeam, language)} –{" "}
        {footballTeamDisplayName(snapshot.fixture.awayTeam, language)}
      </p>
      <p className="text-sm">
        {statuses[snapshot.status]}
        {snapshot.status === "matched" && !current ? " · Ληγμένο για νέα σύγκριση" : ""}
      </p>
      <p className="break-words text-xs text-muted-foreground">
        Ανάκτηση: {snapshot.retrievedAtUtc} · Ενημέρωση αρχείου:{" "}
        {snapshot.observedAtUtc ?? "Μη διαθέσιμη"}
      </p>
      {snapshot.feedStatuses?.map((f) => (
        <p key={f.file} className="text-xs text-muted-foreground">
          {f.file.includes("leagues") ? "soccer_leagues" : "soccer"}: {statuses[f.status]}
        </p>
      ))}
      {snapshot.quotes.length > 0 && (
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
          {snapshot.quotes.map((q) => {
            const estimate = estimates.find((e) => e.market === q.market);
            const comparison = compareSubjectiveToOdds(estimate?.percent ?? null, q.decimal, false);
            const outcome = outcomes.find((o) => o.market === q.market)?.outcome;
            return (
              <div
                key={q.selectionId}
                className="min-w-0 rounded-xl border border-border p-3 text-sm"
              >
                <p className="font-semibold">
                  {labels[q.market]} · {q.decimal.toFixed(2)}
                </p>
                <p className="break-words text-xs text-muted-foreground">
                  Αρχείο: {q.observedAtUtc}
                </p>
                {probabilities?.probabilities[q.market] != null && (
                  <p>
                    Αγορά χωρίς γκανιότα:{" "}
                    {(probabilities.probabilities[q.market]! * 100).toFixed(1)}%
                  </p>
                )}
                {comparison?.indicativeDifference != null && (
                  <p>
                    Διαφορά AI από break-even: {(comparison.indicativeDifference * 100).toFixed(1)}{" "}
                    μ.μ. · μόνο ενδεικτική
                  </p>
                )}
                {outcome != null && (
                  <p>Αποτέλεσμα 90′: {outcome ? "Επαληθεύτηκε" : "Δεν επαληθεύτηκε"}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {snapshot.notes.map((n, i) => (
        <p key={i} className="break-words text-xs text-muted-foreground">
          {n}
        </p>
      ))}
      <p className="text-xs text-muted-foreground">
        Αποδόσεις στιγμιότυπου, όχι σημερινή προσφορά. Οι πιθανότητες αγοράς και οι υποκειμενικές
        εκτιμήσεις AI δεν αποτελούν βαθμονομημένη πρόβλεψη ή αποδεδειγμένο πλεονέκτημα. Αγορές που
        δεν εμφανίζονται δεν έχουν επιβεβαιωμένες τιμές. Δεν εκτελείται στοιχηματισμός.
      </p>
    </section>
  );
}
