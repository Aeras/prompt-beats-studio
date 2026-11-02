import { useState } from "react";
import { footballTeamDisplayName } from "@/lib/football-ai-team-names.shared";
import { useQuery } from "@tanstack/react-query";
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
} from "@/lib/football-ai-fixture.functions";
import type { FootballAiDiscoveryLeagueId } from "@/lib/football-research.shared";
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
    refreshing: "Αναζήτηση…",
    quota: (h: number, d: number) => `Υπόλοιπο: ${h}/3 ανά ώρα · ${d}/10 ανά ημέρα`,
    dialogTitle: "Χρεώσιμη αναζήτηση AI",
    dialogBody: (model: string, cost: string, h: number, d: number) =>
      `Θα γίνει μία κλήση στο ${model} με αναζήτηση στο web μέσω OpenRouter. Μέγιστο εκτιμώμενο κόστος: $${cost}. Η προσπάθεια μετράει στο όριο ακόμη κι αν αποτύχει. Υπόλοιπο μετά: ${Math.max(0, h - 1)}/3 ανά ώρα, ${Math.max(0, d - 1)}/10 ανά ημέρα.`,
    cancel: "Ακύρωση",
    confirm: "Επιβεβαίωση",
    verified: "Επαληθευμένο",
    candidate: "Υποψήφιο",
    analyze: "Ανάλυση",
    analyzeSelected: (n: number) => `Ανάλυση επιλεγμένων επαληθευμένων (${n})`,
    empty: "Δεν υπάρχουν αποθηκευμένοι αγώνες για αυτή την εβδομάδα.",
    failed: "Η ενημέρωση δεν ολοκληρώθηκε. Η προσπάθεια μετράει στο όριο.",
    noPricing: "Το μοντέλο δεν είναι εγκατεστημένο με επαληθευμένη τιμολόγηση.",
    loading: "Φόρτωση…",
    sources: "πηγές",
  },
  en: {
    title: "Fixtures this week · AI Search BETA",
    note: "AI proposes fixtures; the server verifies them independently. “Verified” means at least 2 different websites confirm the exact kickoff time (UTC). Analysis only for verified fixtures.",
    refresh: "Refresh fixtures (AI BETA)",
    refreshing: "Searching…",
    quota: (h: number, d: number) => `Remaining: ${h}/3 per hour · ${d}/10 per day`,
    dialogTitle: "Paid AI search",
    dialogBody: (model: string, cost: string, h: number, d: number) =>
      `One call to ${model} with web search via OpenRouter. Maximum estimated cost: $${cost}. The attempt counts toward your limit even if it fails. Remaining after: ${Math.max(0, h - 1)}/3 per hour, ${Math.max(0, d - 1)}/10 per day.`,
    cancel: "Cancel",
    confirm: "Confirm",
    verified: "Verified",
    candidate: "Candidate",
    analyze: "Analyze",
    analyzeSelected: (n: number) => `Analyze selected verified (${n})`,
    empty: "No stored fixtures for this week.",
    failed: "Refresh did not complete. The attempt counts toward your limit.",
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
  const quotaLeft = d ? Math.min(d.quota.hourRemaining, d.quota.dayRemaining) : 0;
  const gateCode = d ? aiFixtureGateCode(d.availability) : null;
  const refreshDisabled =
    refreshing ||
    props.working ||
    !d ||
    d.maxCostUsd === null ||
    gateCode !== null ||
    quotaLeft <= 0;

  const confirm = async () => {
    if (!d || d.maxCostUsd === null) return;
    setOpen(false);
    setRefreshing(true);
    setError("");
    try {
      await refreshPrivateAiFixtureCandidates({
        data: {
          leagueId: props.leagueId,
          weekDate: props.weekDate,
          consent: { acknowledged: true, estimatedMaxUsd: d.maxCostUsd },
        },
      });
    } catch (err) {
      setError(aiFixtureFailureText(parseAiFixtureErrorCode(err), language === "el" ? "el" : "en"));
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
          onClick={() => setOpen(true)}
          className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {refreshing ? c.refreshing : c.refresh}
        </button>
        {d && (
          <span className="text-xs text-slate-300">
            {c.quota(d.quota.hourRemaining, d.quota.dayRemaining)}
          </span>
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
                  {footballTeamDisplayName(f.homeTeam, language)} – {footballTeamDisplayName(f.awayTeam, language)}
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
                    d.maxCostUsd.toFixed(3),
                    d.quota.hourRemaining,
                    d.quota.dayRemaining,
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
