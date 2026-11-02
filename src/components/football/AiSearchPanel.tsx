import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { footballTeamDisplayName } from "@/lib/football-ai-team-names.shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/i18n";
import {
  getPrivateAiFixtureCandidates,
  refreshPrivateAiFixtureCandidates,
  reverifyPrivateAiFixtureCandidates,
} from "@/lib/football-ai-fixture.functions";
import {
  FOOTBALL_AI_DISCOVERY_LEAGUES,
  type FootballAiDiscoveryLeagueId,
} from "@/lib/football-research.shared";
import {
  aiFixtureGateCode,
  parseAiFixtureErrorCode,
} from "@/lib/football-ai-fixture-errors.shared";
import { aiFixtureFailureText } from "@/components/football/ai-search-messages";

const COPY = {
  el: {
    title: "Αγώνες εβδομάδας · AI Αναζήτηση BETA",
    note: "Η AI προτείνει αγώνες· ο server τους επαληθεύει ανεξάρτητα. «Επαληθευμένο» σημαίνει ότι τουλάχιστον 2 διαφορετικοί ιστότοποι επιβεβαιώνουν την ακριβή ώρα έναρξης (UTC). Ανάλυση μόνο για επαληθευμένους.",
    refresh: "Ανανέωση αγώνων (AI BETA)",
    reverify: "Επανέλεγχος υποψήφιων (χωρίς AI)",
    refreshing: "Αναζήτηση…",
    all: "Ανανέωση όλων (12)",
    stop: "Διακοπή μετά την τρέχουσα",
    progress: (done: number, total: number) => `Ανανέωση ${done}/${total} πρωταθλημάτων`,
    dialogTitle: "Χρεώσιμη αναζήτηση AI",
    dialogBody: (model: string, cost: string, total: number) =>
      `Θα γίνουν έως ${total} χρεώσιμες αναζητήσεις στο ${model} μέσω OpenRouter. Συνολικό μέγιστο εκτιμώμενο κόστος: ${cost}. Οι αναζητήσεις εκτελούνται μία-μία και δεν επαναλαμβάνονται αυτόματα.`,
    cancel: "Ακύρωση",
    confirm: "Επιβεβαίωση",
    verified: "Επαληθευμένο",
    candidate: "Υποψήφιο",
    analyze: "Ανάλυση",
    analyzeSelected: (n: number) => `Ανάλυση επιλεγμένων επαληθευμένων (${n})`,
    empty: "Δεν υπάρχουν αποθηκευμένοι αγώνες για αυτή την εβδομάδα.",
    failed: "Η ενημέρωση δεν ολοκληρώθηκε. Μπορεί να έχει πραγματοποιηθεί χρεώσιμη κλήση.",
    noPricing: "Το μοντέλο δεν είναι εγκατεστημένο με επαληθευμένη τιμολόγηση.",
    loading: "Φόρτωση…",
    sources: "πηγές",
  },
  en: {
    title: "Fixtures this week · AI Search BETA",
    note: "AI proposes fixtures; the server verifies them independently. “Verified” means at least 2 different websites confirm the exact kickoff time (UTC). Analysis only for verified fixtures.",
    refresh: "Refresh fixtures (AI BETA)",
    reverify: "Recheck candidates (no AI charge)",
    refreshing: "Searching…",
    all: "Refresh all (12)",
    stop: "Stop after current",
    progress: (done: number, total: number) => `Refreshed ${done}/${total} competitions`,
    dialogTitle: "Paid AI search",
    dialogBody: (model: string, cost: string, total: number) =>
      `Up to ${total} paid web searches using ${model} through OpenRouter. Total estimated maximum: ${cost}. Calls run sequentially without automatic retries.`,
    cancel: "Cancel",
    confirm: "Confirm",
    verified: "Verified",
    candidate: "Candidate",
    analyze: "Analyze",
    analyzeSelected: (n: number) => `Analyze selected verified (${n})`,
    empty: "No stored fixtures for this week.",
    failed: "Refresh did not complete. A paid request may have been dispatched.",
    noPricing: "Model is not installed with verified pricing.",
    loading: "Loading…",
    sources: "sources",
  },
} as const;

export function AiSearchPanel(props: {
  leagueId: FootballAiDiscoveryLeagueId;
  weekDate: string;
  enabled: boolean;
  working: boolean;
  canAnalyze: boolean;
  onAnalyze: (fixtureIds: string[]) => void;
}) {
  const { language } = useI18n();
  const c = language === "el" ? COPY.el : COPY.en;
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reverifying, setReverifying] = useState(false);
  const [allMode, setAllMode] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const stopRequested = useRef(false);
  const [leagueResults, setLeagueResults] = useState<
    Record<string, "completed" | "failed" | "skipped">
  >({});
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ["private-ai-fixture-candidates", props.leagueId, props.weekDate],
    queryFn: () =>
      getPrivateAiFixtureCandidates({
        data: { leagueId: props.leagueId, weekDate: props.weekDate },
      }),
    enabled: props.enabled,
    retry: false,
  });
  const d = query.data;
  const gateCode = d ? aiFixtureGateCode(d.availability) : null;
  const refreshDisabled =
    refreshing || props.working || !d || d.maxCostUsd === null || gateCode !== null;

  const reverify = async () => {
    setReverifying(true);
    setError("");
    try {
      const result = await reverifyPrivateAiFixtureCandidates({
        data: { leagueId: props.leagueId, weekDate: props.weekDate },
      });
      await query.refetch();
      if (!result.verified) setError("Δεν επιβεβαιώθηκαν ακόμη αγώνες από δύο ανεξάρτητες πηγές. Δεν έγινε χρεώσιμη AI κλήση.");
    } catch {
      setError("Η επανεπαλήθευση απέτυχε, χωρίς πληρωμένη αναζήτηση AI.");
    } finally {
      setReverifying(false);
    }
  };
  const confirm = async () => {
    if (!d || d.maxCostUsd === null) return;
    const leagues: FootballAiDiscoveryLeagueId[] = allMode
      ? FOOTBALL_AI_DISCOVERY_LEAGUES.map((item) => item.id)
      : [props.leagueId];
    setOpen(false);
    setRefreshing(true);
    setProgress({ done: 0, total: leagues.length });
    setLeagueResults({});
    stopRequested.current = false;
    setError("");
    const errors: string[] = [];
    const completed = new Set<string>();
    try {
      for (let index = 0; index < leagues.length; index++) {
        if (stopRequested.current) break;
        try {
          await refreshPrivateAiFixtureCandidates({
            data: {
              leagueId: leagues[index]!,
              weekDate: props.weekDate,
              consent: { acknowledged: true, estimatedMaxUsd: d.maxCostUsd },
            },
          });
          completed.add(leagues[index]!);
          setLeagueResults((previous) => ({
            ...previous,
            [leagues[index]!]: "completed",
          }));
        } catch (err) {
          setLeagueResults((previous) => ({
            ...previous,
            [leagues[index]!]: "failed",
          }));
          const code = parseAiFixtureErrorCode(err);
          errors.push(
            leagues[index]! + ": " + aiFixtureFailureText(code, language === "el" ? "el" : "en"),
          );
          // Stop on a system-wide gate failure; continuing would only produce
          // more rejected requests (or ambiguous provider-cost outcomes).
          if (
            code === null ||
            code === "cost_changed" ||
            code === "dispatch_disabled" ||
            code === "spend_not_approved" ||
            code === "beta_disabled" ||
            code === "provider_key_missing" ||
            code === "model_pricing_unavailable" ||
            code === "dispatch_admission_failed" ||
            code === "admission_unavailable" ||
            code === "already_running"
          ) {
            setProgress({ done: index + 1, total: leagues.length });
            break;
          }
        }
        setProgress({ done: index + 1, total: leagues.length });
      }
      if (stopRequested.current) {
        setLeagueResults((previous) => ({
          ...Object.fromEntries(
            leagues
              .filter((id) => !completed.has(id))
              .map((id) => [id, previous[id] ?? "skipped"] as const),
          ),
          ...previous,
        }));
      }
      if (errors.length) setError(errors.join(" · "));
    } finally {
      setRefreshing(false);
      await query.refetch();
    }
  };
  const upcoming = (d?.fixtures ?? []).filter((f) => Date.parse(f.kickoffUtc) > Date.now());
  const verifiedPicked = picked.filter((id) =>
    upcoming.some((f) => String(f.fixtureId) === id && f.status === "verified"),
  );

  return (
    <section
      className="rounded-3xl border border-white/10 bg-[#152137] p-4 shadow-lg sm:p-6"
      aria-label={c.title}
    >
      <h2 className="text-lg font-bold">{c.title}</h2>
      <p className="mt-1 text-xs leading-5 text-amber-300">{c.note}</p>
      <div className="my-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={refreshDisabled}
          onClick={() => {
            setAllMode(false);
            setOpen(true);
          }}
          className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {refreshing ? c.refreshing : c.refresh}
        </button>
        <button
          type="button"
          disabled={refreshDisabled}
          onClick={() => {
            setAllMode(true);
            setOpen(true);
          }}
          className="rounded-xl border border-cyan-400/40 px-4 py-2.5 text-sm font-bold text-cyan-100 disabled:opacity-40"
        >
          {c.all}
        </button>
        <button type="button"
          disabled={refreshing || reverifying || props.working || !d}
          onClick={() => void reverify()}
          className="rounded-xl border border-amber-400/40 px-4 py-2.5 text-sm font-bold text-amber-100 disabled:opacity-40">
          {reverifying ? c.refreshing : c.reverify}
        </button>
        {refreshing && (
          <>
            <span role="status" className="text-xs text-slate-300">
              {c.progress(progress.done, progress.total)}
            </span>
            {progress.total > 1 && (
              <button
                type="button"
                onClick={() => {
                  stopRequested.current = true;
                }}
                className="text-xs font-semibold text-amber-300"
              >
                {c.stop}
              </button>
            )}
          </>
        )}
        {progress.total > 1 && Object.keys(leagueResults).length > 0 && (
          <p className="w-full text-xs text-slate-300" role="status">
            {FOOTBALL_AI_DISCOVERY_LEAGUES.filter((league) => leagueResults[league.id])
              .map(
                (league) =>
                  `${league.label}: ${leagueResults[league.id] === "completed" ? "✓" : leagueResults[league.id] === "failed" ? "✕" : "—"}`,
              )
              .join(" · ")}
          </p>
        )}
        {gateCode && (
          <span className="text-xs text-amber-300">
            {aiFixtureFailureText(gateCode, language === "el" ? "el" : "en")}
          </span>
        )}
        <button
          type="button"
          disabled={
            props.working ||
            !props.canAnalyze ||
            verifiedPicked.length === 0 ||
            verifiedPicked.length > 5
          }
          onClick={() => props.onAnalyze(verifiedPicked)}
          className="rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/15 px-4 py-2.5 text-sm font-bold text-fuchsia-100 disabled:opacity-40"
        >
          {c.analyzeSelected(verifiedPicked.length)}
        </button>
      </div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-amber-300">
          {error}
        </p>
      )}
      {query.isPending && props.enabled && <p className="text-sm text-slate-400">{c.loading}</p>}
      {d && upcoming.length === 0 && <p className="text-sm text-slate-400">{c.empty}</p>}
      <ul className="space-y-2">
        {upcoming.map((f) => {
          const id = String(f.fixtureId);
          const verified = f.status === "verified";
          return (
            <li
              key={id}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0d192b] p-3"
            >
              <input
                type="checkbox"
                aria-label={`${f.homeTeam} – ${f.awayTeam}`}
                disabled={!verified || props.working}
                checked={picked.includes(id)}
                onChange={() =>
                  setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
                }
                className="h-5 w-5 accent-cyan-400"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">
                  {footballTeamDisplayName(f.homeTeam, language)} –{" "}
                  {footballTeamDisplayName(f.awayTeam, language)}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(f.kickoffUtc).toLocaleString(language === "el" ? "el-GR" : "en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Europe/Athens",
                  })}
                  {verified && ` · ${f.verifiedSources} ${c.sources}`}
                </p>
              </div>
              <span
                data-testid="ai-fixture-status"
                className={`rounded-full px-2 py-1 text-[11px] ${verified ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}
              >
                {verified ? c.verified : c.candidate}
              </span>
            </li>
          );
        })}
      </ul>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{c.dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {d && d.maxCostUsd !== null
                ? c.dialogBody(
                    d.model,
                    (d.maxCostUsd * (allMode ? FOOTBALL_AI_DISCOVERY_LEAGUES.length : 1)).toFixed(
                      3,
                    ),
                    allMode ? FOOTBALL_AI_DISCOVERY_LEAGUES.length : 1,
                  )
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{c.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirm()}>{c.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
