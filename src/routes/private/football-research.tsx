import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  getPrivateFootballResearchHistory,
  runPrivateFootballResearch,
} from "@/lib/football-ai-research.functions";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/promptbeats/AppShell";
import {
  FOOTBALL_LEAGUES,
  FOOTBALL_PROVIDERS,
  FOOTBALL_DATA_LEAGUES,
  type FootballProviderId,
} from "@/lib/football-research.shared";
import {
  getPrivateFootballResearchSetup,
  getPrivateFootballWeek,
} from "@/lib/football-research.functions";

export const Route = createFileRoute("/private/football-research")({
  head: () => ({
    meta: [
      { title: "Football Research Studio — PromptBeats" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
  }),
  component: PrivateFootballResearchPage,
});

const MARKET_LABELS: Record<string, string> = {
  home_win: "1 · Νίκη γηπεδούχου",
  draw: "Χ · Ισοπαλία",
  away_win: "2 · Νίκη φιλοξενούμενου",
  double_chance_1x: "Διπλή ευκαιρία 1Χ",
  double_chance_x2: "Διπλή ευκαιρία Χ2",
  double_chance_12: "Διπλή ευκαιρία 12",
  both_teams_score_yes: "Goal / Goal",
  both_teams_score_no: "No Goal",
  goals_over_1_5: "Over 1,5",
  goals_under_1_5: "Under 1,5",
  goals_over_2_5: "Over 2,5",
  goals_under_2_5: "Under 2,5",
  goals_over_3_5: "Over 3,5",
  goals_under_3_5: "Under 3,5",
  corners_over_8_5: "Κόρνερ Over 8,5",
  corners_under_8_5: "Κόρνερ Under 8,5",
  corners_over_9_5: "Κόρνερ Over 9,5",
  corners_under_9_5: "Κόρνερ Under 9,5",
};
const EVIDENCE: Record<string, string> = {
  supported: "Υποστηρίζεται από πηγές",
  limited: "Περιορισμένη τεκμηρίωση",
  insufficient: "Ανεπαρκή στοιχεία",
};
const STATUS: Record<string, string> = {
  completed: "Ολοκληρώθηκε",
  processing: "Σε εξέλιξη",
  failed: "Απέτυχε",
};
const field =
  "w-full rounded-xl border border-white/15 bg-[#101d32] px-3 py-3 text-sm text-slate-50 outline-none focus:border-cyan-400";

function PrivateFootballResearchPage() {
  const { user, loading } = useAuth();
  const setup = useQuery({
    queryKey: ["private-football-research-setup", user?.id],
    queryFn: () => getPrivateFootballResearchSetup(),
    enabled: Boolean(user),
    retry: false,
  });
  const [provider, setProvider] = useState<FootballProviderId>("football-data");
  const [league, setLeague] = useState<string>("EN-PL");
  const [model, setModel] = useState("");
  const [weekDate, setWeekDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" }),
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [batchError, setBatchError] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const fixtures = useQuery({
    queryKey: ["football-week", user?.id, provider, league, weekDate],
    queryFn: () =>
      getPrivateFootballWeek({
        data: {
          fixtureProvider: provider,
          leagueId: league as (typeof FOOTBALL_LEAGUES)[number]["id"],
          weekDate,
        },
      }),
    enabled:
      Boolean(user) &&
      setup.isSuccess &&
      Boolean(setup.data.fixtureProviders.find((item) => item.id === provider)?.configured) &&
      (provider !== "football-data" || league !== "GR-SL"),
    retry: false,
    staleTime: 300000,
  });
  const history = useQuery({
    queryKey: ["football-research-history", user?.id],
    queryFn: () => getPrivateFootballResearchHistory(),
    enabled: Boolean(user) && setup.isSuccess,
    retry: false,
    staleTime: 300000,
  });
  const header = <span className="font-display text-lg font-bold">Football Research Studio</span>;

  if (loading)
    return (
      <AppShell header={header}>
        <main className="p-6">Φόρτωση…</main>
      </AppShell>
    );
  if (!user)
    return (
      <AppShell header={header}>
        <main className="p-6">
          Απαιτείται{" "}
          <Link to="/auth" className="underline">
            σύνδεση
          </Link>
          .
        </main>
      </AppShell>
    );
  if (setup.isPending)
    return (
      <AppShell header={header}>
        <main className="p-6">Έλεγχος πρόσβασης…</main>
      </AppShell>
    );
  if (setup.isError || !setup.data)
    return (
      <AppShell header={header}>
        <main className="p-6" role="alert">
          Η πρόσβαση δεν επιτρέπεται ή η υπηρεσία δεν είναι διαθέσιμη.
        </main>
      </AppShell>
    );

  const selectedModel = setup.data.models.find((item) => item.id === model);
  const configured = Boolean(
    setup.data.fixtureProviders.find((item) => item.id === provider)?.configured,
  );
  const upcoming = (fixtures.data?.status === "ok" ? fixtures.data.fixtures : []).filter(
    (f) => f.state === "scheduled" && Date.parse(f.kickoffUtc) > Date.now(),
  );
  const fixtureKey = (id: string) => provider + ":" + id;
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const start = async (ids: string[]) => {
    if (working || !selectedModel || !setup.data.aiAnalysisEnabled || ids.length === 0) return;
    // Existing per-user admission is 5 / hour. Never suggest this executes unlimited work.
    if (ids.length > 5) {
      setBatchError("Επιτρέπονται έως 5 αιτήματα ανά ώρα. Επίλεξε έως 5 αγώνες.");
      return;
    }
    if (
      !window.confirm(
        `Θα γίνουν ${ids.length} ξεχωριστές έρευνες Tavily και κλήσεις OpenRouter, με ενδεχόμενη χρέωση ανά αγώνα. Επιβεβαιώνεις;`,
      )
    )
      return;
    setWorking(true);
    setProgress({ done: 0, total: ids.length });
    setBatchError("");
    try {
      // Foreground sequential dispatch is deliberate: do not masquerade as a durable background job.
      for (let i = 0; i < ids.length; i++) {
        try {
          await runPrivateFootballResearch({
            data: {
              fixtureProvider: provider,
              leagueId: league as (typeof FOOTBALL_LEAGUES)[number]["id"],
              weekDate,
              fixtureId: ids[i]!,
              modelId: selectedModel.id,
              requestKey: crypto.randomUUID(),
              withTavily: true,
              approvePaidRequest: true,
            },
          });
        } catch {
          setBatchError(
            "Κάποια ανάλυση απέτυχε ή απορρίφθηκε. Η συγκεκριμένη προσπάθεια καταχωρίστηκε και δεν επαναλαμβάνεται αυτόματα.",
          );
          break;
        } finally {
          setProgress({ done: i + 1, total: ids.length });
          await history.refetch();
        }
      }
    } finally {
      setWorking(false);
      setSelected([]);
    }
  };
  const allIds = upcoming.map((f) => f.sourceFixtureId);
  const picked = upcoming
    .filter((f) => selected.includes(fixtureKey(f.sourceFixtureId)))
    .map((f) => f.sourceFixtureId);

  return (
    <AppShell header={header}>
      <main className="mx-auto max-w-6xl space-y-5 px-3 pb-28 pt-4 text-slate-100 sm:px-6">
        <div className="overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-[#102a48] via-[#142139] to-[#241b3e] p-5 shadow-xl shadow-cyan-950/20 sm:p-8">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Private analytics · Super Admin
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-4xl">
            Football <span className="text-cyan-300">Research Studio</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Πολλαπλές αναλύσεις, τεκμηριωμένα συμπεράσματα και οργανωμένο ιστορικό ανά αγώνα.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-cyan-400/10 px-3 py-1.5 text-cyan-200">
              Αγγλικά · Ρωσικά · Γλώσσα πρωταθλήματος
            </span>
            <span className="rounded-full bg-fuchsia-400/10 px-3 py-1.5 text-fuchsia-200">
              Αποθήκευση αποτελεσμάτων
            </span>
          </div>
        </div>

        <section
          className="rounded-3xl border border-white/10 bg-[#152137] p-4 shadow-lg sm:p-6"
          aria-label="Επιλογές έρευνας"
        >
          <h2 className="mb-4 text-lg font-bold text-white">Ρυθμίσεις ανάλυσης</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              Πάροχος αγώνων
              <select
                className={field}
                value={provider}
                onChange={(e) => {
                  const v = e.target.value as FootballProviderId;
                  setProvider(v);
                  setSelected([]);
                  if (v === "football-data" && league === "GR-SL") setLeague("EN-PL");
                }}
              >
                {FOOTBALL_PROVIDERS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                    {x.id === "football-data" ? " · Προεπιλογή" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Πρωτάθλημα
              <select
                className={field}
                value={league}
                onChange={(e) => {
                  setLeague(e.target.value);
                  setSelected([]);
                }}
              >
                {FOOTBALL_LEAGUES.map((x) => (
                  <option
                    key={x.id}
                    value={x.id}
                    disabled={
                      provider === "football-data" &&
                      !FOOTBALL_DATA_LEAGUES.some((id) => id === x.id)
                    }
                  >
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Ημερομηνία εβδομάδας
              <input
                className={field}
                type="date"
                value={weekDate}
                onChange={(e) => {
                  setWeekDate(e.target.value);
                  setSelected([]);
                }}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Μοντέλο AI
              <select
                className={field}
                value={selectedModel?.id ?? ""}
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="">Επιλογή μοντέλου</option>
                {setup.data.models.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Tavily: {setup.data.tavilyConfigured ? "Διαθέσιμο" : "Μη διαθέσιμο"} · Πάροχος:{" "}
            {configured ? "Ρυθμισμένος" : "Δεν έχει ρυθμιστεί API key"}.
          </p>
        </section>

        <section
          className="rounded-3xl border border-white/10 bg-[#152137] p-4 shadow-lg sm:p-6"
          aria-label="Αγώνες εβδομάδας"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">Αγώνες εβδομάδας</h2>
              <p className="text-xs text-slate-400">Επιλογή αγώνων για νέα ανάλυση</p>
            </div>
            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
              {upcoming.length} διαθέσιμοι πριν από τη σέντρα
            </span>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                working ||
                !selectedModel ||
                allIds.length === 0 ||
                allIds.length > 5 ||
                !setup.data.aiAnalysisEnabled
              }
              onClick={() => void start(allIds)}
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              Ανάλυση όλων ({allIds.length})
            </button>
            <button
              type="button"
              disabled={
                working ||
                !selectedModel ||
                picked.length === 0 ||
                picked.length > 5 ||
                !setup.data.aiAnalysisEnabled
              }
              onClick={() => void start(picked)}
              className="rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/15 px-4 py-2.5 text-sm font-bold text-fuchsia-100 disabled:opacity-40"
            >
              Ανάλυση επιλεγμένων ({picked.length})
            </button>
          </div>
          <p className="mb-3 text-xs leading-5 text-slate-400">
            Έως 5 αναλύσεις ανά ώρα. Κάθε αγώνας χρεώνεται ξεχωριστά μετά από επιβεβαίωση. Η μαζική
            εκτέλεση γίνεται διαδοχικά όσο παραμένει ανοιχτή η σελίδα. Αποθηκεύεται κάθε
            ολοκληρωμένο αποτέλεσμα.
          </p>
          {working && (
            <p role="status" className="mb-3 rounded-xl bg-cyan-400/10 p-3 text-sm text-cyan-200">
              Ανάλυση {progress.done} / {progress.total} · Μην κλείσεις τη σελίδα μέχρι να
              ολοκληρωθούν τα αιτήματα.
            </p>
          )}
          {batchError && (
            <p role="alert" className="mb-3 text-sm text-amber-300">
              {batchError}
            </p>
          )}
          {fixtures.isPending && configured && (
            <p className="text-sm text-slate-400">Ανάκτηση αγώνων…</p>
          )}
          {fixtures.isError && (
            <p role="alert" className="text-sm text-rose-300">
              Αποτυχία ανάκτησης αγώνων.
            </p>
          )}
          {!configured && (
            <p className="text-sm text-amber-300">Δεν υπάρχει API key για τον επιλεγμένο πάροχο.</p>
          )}
          {allIds.length > 5 && (
            <p className="mb-3 text-xs text-amber-300">
              Η εβδομάδα έχει περισσότερους από 5 αγώνες. Χρησιμοποίησε την επιλογή έως 5 αγώνων,
              σύμφωνα με το υπάρχον όριο ασφαλείας.
            </p>
          )}
          {fixtures.data?.status === "ok" && fixtures.data.fixtures.length === 0 && (
            <p className="text-sm text-slate-400">Δεν βρέθηκαν αγώνες.</p>
          )}
          <ul className="space-y-2">
            {fixtures.data?.status === "ok" &&
              fixtures.data.fixtures.map((f) => {
                const canAnalyze = f.state === "scheduled" && Date.parse(f.kickoffUtc) > Date.now();
                const key = fixtureKey(f.sourceFixtureId);
                return (
                  <li
                    key={key}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0d192b] p-3"
                  >
                    <input
                      aria-label={`Επιλογή αγώνα ${f.homeTeam} – ${f.awayTeam}`}
                      type="checkbox"
                      disabled={!canAnalyze || working}
                      checked={selected.includes(key)}
                      onChange={() => toggle(key)}
                      className="h-5 w-5 accent-cyan-400"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white">
                        {f.homeTeam} – {f.awayTeam}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(f.kickoffUtc).toLocaleString("el-GR", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Europe/Athens",
                        })}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] ${canAnalyze ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-600/30 text-slate-400"}`}
                    >
                      {canAnalyze
                        ? "Πριν τη σέντρα"
                        : f.state === "live"
                          ? "Σε εξέλιξη"
                          : "Μη διαθέσιμος"}
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>

        <section
          className="rounded-3xl border border-white/10 bg-[#152137] p-4 shadow-lg sm:p-6"
          aria-label="Αποθηκευμένες αναλύσεις"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">Αποτελέσματα αναλύσεων</h2>
              <p className="text-xs text-slate-400">
                Κάθε ανάλυση παραμένει αποθηκευμένη στο ιδιωτικό ιστορικό.
              </p>
            </div>
            <button
              type="button"
              disabled={history.isFetching}
              onClick={() => void history.refetch()}
              className="rounded-xl border border-white/15 px-3 py-2 text-xs text-cyan-200 disabled:opacity-40"
            >
              Ανανέωση
            </button>
          </div>
          {history.isError && (
            <p role="alert" className="text-sm text-rose-300">
              Το ιστορικό δεν είναι διαθέσιμο.
            </p>
          )}
          {history.data?.length === 0 && (
            <p className="text-sm text-slate-400">Δεν έχουν αποθηκευτεί αναλύσεις.</p>
          )}
          <div className="space-y-3">
            {history.data?.map((entry) => {
              const open = expanded.includes(entry.id);
              return (
                <article
                  key={entry.id}
                  className="overflow-hidden rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-[#12233b] to-[#171c32]"
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleExpanded(entry.id)}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block font-bold text-white">
                        {entry.home_team} – {entry.away_team}
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
                        {new Date(entry.created_at).toLocaleDateString("el-GR")} · {entry.model_id}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] ${entry.status === "completed" ? "bg-emerald-400/15 text-emerald-300" : entry.status === "failed" ? "bg-rose-400/15 text-rose-300" : "bg-amber-400/15 text-amber-200"}`}
                      >
                        {STATUS[entry.status] ?? entry.status}
                      </span>
                      <span className="text-cyan-300">{open ? "⌃" : "⌄"}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="space-y-4 border-t border-white/10 p-4">
                      {entry.analysis ? (
                        <>
                          <section className="rounded-xl border border-cyan-300/20 bg-[#0a2036] p-4">
                            <h3 className="text-base font-bold text-cyan-200">Εκτιμώμενες πιθανότητες AI</h3>
                            <p className="mb-4 mt-1 text-xs text-slate-400">Υποκειμενικές εκτιμήσεις από διασταύρωση πηγών — όχι στατιστικά βαθμονομημένες πιθανότητες.</p>
                            {entry.analysis.estimates?.length ? (
                              <div className="space-y-3">
                                {entry.analysis.estimates.map((estimate) => (
                                  <div key={estimate.market} className="space-y-1">
                                    <div className="flex justify-between gap-3 text-sm">
                                      <span className="font-medium text-slate-100">{MARKET_LABELS[estimate.market] ?? estimate.market}</span>
                                      <strong className="tabular-nums text-cyan-200">{estimate.percent}%</strong>
                                    </div>
                                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-700/80" role="progressbar" aria-label={MARKET_LABELS[estimate.market] ?? estimate.market} aria-valuenow={estimate.percent} aria-valuemin={0} aria-valuemax={100}>
                                      <div className={`h-full rounded-full ${estimate.percent >= 65 ? "bg-emerald-400" : estimate.percent >= 40 ? "bg-cyan-400" : "bg-amber-400"}`} style={{ width: `${estimate.percent}%` }} />
                                    </div>
                                    <p className="text-xs text-slate-400">{estimate.reason}</p>
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-sm text-amber-200">Παλαιότερη ανάλυση χωρίς αριθμητικές εκτιμήσεις. Δεν κατασκευάζουμε ποσοστά εκ των υστέρων.</p>}
                          </section>
                          <div className="rounded-xl bg-cyan-400/5 p-4">
                            <h3 className="mb-2 font-semibold text-cyan-200">Σύνοψη ανάλυσης</h3>
                            <p className="whitespace-pre-line text-sm leading-7 text-slate-200">
                              {entry.analysis.summary}
                            </p>
                          </div>
                          <details className="rounded-xl border border-white/10 bg-[#0d192b] p-3">
                            <summary className="mb-3 cursor-pointer font-semibold text-white">
                              Προτεινόμενα σημεία και αιτιολόγηση
                            </h3>
                            <div className="space-y-2">
                              {entry.analysis.suggestions.length === 0 && (
                                <p className="text-sm text-slate-400">
                                  Δεν προκύπτει τεκμηριωμένη επιλογή.
                                </p>
                              )}
                              {entry.analysis.suggestions.map((item) => (
                                <div
                                  key={item.market}
                                  className="rounded-xl border border-white/10 bg-[#0c1728] p-3"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <strong className="text-sm text-white">
                                      {MARKET_LABELS[item.market] ?? item.market}
                                    </strong>
                                    <span className="text-xs text-amber-200">
                                      {EVIDENCE[item.evidence] ?? item.evidence}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-sm leading-6 text-slate-300">
                                    {item.rationale}
                                  </p>
                                  {entry.outcomes.find((x) => x.market === item.market)?.outcome !=
                                    null && (
                                    <p className="mt-2 text-xs text-cyan-300">
                                      Επίσημη επαλήθευση:{" "}
                                      {entry.outcomes.find((x) => x.market === item.market)?.outcome
                                        ? "Επιτυχία"
                                        : "Αποτυχία"}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </details>
                          <details className="rounded-xl border border-white/10 bg-[#0d192b] p-4">
                            <summary className="cursor-pointer font-semibold text-cyan-200">
                              Λεπτομέρειες ανάλυσης
                            </summary>
                            <div className="mt-3 space-y-3 text-sm leading-7 text-slate-300">
                              {entry.analysis.deepDive ? (
                                <>
                                  <h4 className="font-semibold text-white">Πρόσφατη φόρμα</h4>
                                  <p>{entry.analysis.deepDive.form}</p>
                                  <h4 className="font-semibold text-white">Τακτική εικόνα</h4>
                                  <p>{entry.analysis.deepDive.tactics}</p>
                                  <h4 className="font-semibold text-white">
                                    Ειδήσεις και απουσίες
                                  </h4>
                                  <p>{entry.analysis.deepDive.teamNews}</p>
                                  <h4 className="font-semibold text-amber-200">Αβεβαιότητες</h4>
                                  <p>{entry.analysis.deepDive.uncertainty}</p>
                                </>
                              ) : (
                                <p>{entry.analysis.summary}</p>
                              )}
                              {entry.analysis.suggestions.map((item) => (
                                <p key={item.market}>
                                  <strong>{MARKET_LABELS[item.market] ?? item.market}:</strong>{" "}
                                  {item.rationale}
                                </p>
                              ))}
                              {entry.analysis.limitations.length > 0 && (
                                <>
                                  <h4 className="font-semibold text-amber-200">Περιορισμοί</h4>
                                  {entry.analysis.limitations.map((x, i) => (
                                    <p key={i}>{x}</p>
                                  ))}
                                </>
                              )}
                            </div>
                          </details>
                          <p className="text-xs leading-5 text-slate-400">
                            Τα ποσοστά είναι εκτιμήσεις της AI, όχι εγγυήσεις ή μετρημένες πιθανότητες. Δεν αποτελούν απόδειξη στοιχηματικού πλεονεκτήματος.
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-slate-400">
                          {entry.status === "failed"
                            ? "Η ανάλυση απέτυχε και δεν επαναλαμβάνεται αυτόματα."
                            : "Η ανάλυση δεν έχει ολοκληρωθεί."}
                        </p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
