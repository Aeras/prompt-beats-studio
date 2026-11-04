import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  getPrivateFootballResearchHistory,
  hidePrivateFootballResearchHistory,
  runPrivateFootballResearch,
} from "@/lib/football-ai-research.functions";
import { useAuth } from "@/hooks/useAuth";
import { runPrivateFootballExpertReview } from "@/lib/football-ai-expert.functions";
import { AiSearchPanel } from "@/components/football/AiSearchPanel";
import { KinoLivePanel } from "@/components/football/KinoLivePanel";
import { EspnDataPanel } from "@/components/football/EspnDataPanel";
import {
  FOOTBALL_AI_DISCOVERY_LEAGUES,
  FOOTBALL_LEAGUES,
  FOOTBALL_ESPN_LEAGUES,
  FOOTBALL_PROVIDERS,
  type FootballAiDiscoveryLeagueId,
  FOOTBALL_DATA_LEAGUES,
  type FootballProviderId,
} from "@/lib/football-research.shared";
import {
  getPrivateFootballResearchSetup,
  getPrivateFootballWeek,
  getPrivateFootballEspnContext,
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
const FAILURE_REASON: Record<string, string> = {
  output_token_limit: "Η απάντηση της AI ξεπέρασε το διαθέσιμο όριο tokens.",
  incomplete_ai_output: "Η AI δεν ολοκλήρωσε την απάντησή της.",
  invalid_ai_json: "Η AI επέστρεψε μη έγκυρη μορφή JSON.",
  invalid_ai_schema: "Η απάντηση της AI δεν πληρούσε τις απαιτήσεις της ανάλυσης.",
  inconsistent_market_probabilities: "Οι εκτιμήσεις πιθανοτήτων ήταν ασυνεπείς.",
  persistence_failed: "Η αποθήκευση του αποτελέσματος απέτυχε.",
  provider_failed: "Η επικοινωνία με το μοντέλο AI απέτυχε.",
  research_unavailable: "Η έρευνα δεν ήταν διαθέσιμη ή δεν ολοκληρώθηκε.",
  provider_or_persistence_failed: "Η προηγούμενη αποτυχία δεν έχει λεπτομερέστερη διάγνωση.",
};

const EXPERT_FAILURE_REASON: Record<string, string> = {
  output_token_limit: "Η απάντηση του Έμπειρου Αναλυτή έφτασε στο όριο tokens.",
  incomplete_ai_output: "Το μοντέλο δεν ολοκλήρωσε την αξιολόγηση.",
  invalid_ai_json: "Το μοντέλο επέστρεψε μη έγκυρο JSON.",
  invalid_ai_schema: "Η αξιολόγηση δεν πληρούσε τη δομή που απαιτείται.",
  persistence_failed: "Η αποθήκευση της αξιολόγησης απέτυχε.",
  provider_failed: "Η κλήση προς το μοντέλο απέτυχε.",
  dispatch_unavailable: "Η εκτέλεση δεν ήταν διαθέσιμη.",
  provider_or_save_failed: "Η προηγούμενη αποτυχία δεν έχει ειδικότερη διάγνωση.",
  unavailable: "Η προηγούμενη εκτέλεση δεν ήταν διαθέσιμη.",
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
  const [provider, setProvider] = useState<FootballProviderId | "ai-search">("football-data");
  const [league, setLeague] = useState<string>("EN-PL");
  const [model, setModel] = useState("");
  const [weekDate, setWeekDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" }),
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [tavilySearchDepth, setTavilySearchDepth] = useState<"basic" | "advanced">("basic");
  const [expertBusy, setExpertBusy] = useState<string | null>(null);
  const [espnPreview, setEspnPreview] = useState<string | null>(null);
  const [expertError, setExpertError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [batchError, setBatchError] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [clearMenu, setClearMenu] = useState(false);
  const [clearMode, setClearMode] = useState<"none" | "selected">("none");
  const [clearSelected, setClearSelected] = useState<string[]>([]);
  const [clearConfirm, setClearConfirm] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"predictions" | "kino">("predictions");
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState("");
  const fixtures = useQuery({
    queryKey: ["football-week", user?.id, provider, league, weekDate],
    queryFn: () =>
      getPrivateFootballWeek({
        data: {
          fixtureProvider: provider === "ai-search" ? "football-data" : provider,
          leagueId: league as (typeof FOOTBALL_LEAGUES)[number]["id"],
          weekDate,
        },
      }),
    enabled:
      Boolean(user) &&
      setup.isSuccess &&
      provider !== "ai-search" &&
      Boolean(setup.data.fixtureProviders.find((item) => item.id === provider)?.configured) &&
      (provider !== "football-data" || league !== "GR-SL"),
    retry: false,
    staleTime: 300000,
  });
  const espnDetails = useQuery({
    queryKey: ["football-espn-details", user?.id, league, weekDate, espnPreview],
    queryFn: () =>
      getPrivateFootballEspnContext({
        data: {
          leagueId: league as (typeof FOOTBALL_ESPN_LEAGUES)[number]["id"],
          weekDate,
          fixtureId: espnPreview!,
        },
      }),
    enabled: Boolean(user) && setup.isSuccess && provider === "espn" && Boolean(espnPreview),
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
  const history = useQuery({
    queryKey: ["football-research-history", user?.id],
    queryFn: () => getPrivateFootballResearchHistory(),
    enabled: Boolean(user) && setup.isSuccess,
    retry: false,
    staleTime: 300000,
  });
  const saveResults = () => {
    const records = history.data ?? [];
    if (!records.length) return;
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), analyses: records }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `football-research-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const clearResults = async (ids: string[]) => {
    if (clearing || working || !ids.length) return;
    setClearing(true);
    setClearError("");
    try {
      await hidePrivateFootballResearchHistory({ data: { ids } });
      setClearMode("none");
      setClearSelected([]);
      setClearConfirm([]);
      setClearMenu(false);
      await history.refetch();
    } catch {
      setClearError("Η εκκαθάριση απέτυχε. Τα αποτελέσματα διατηρήθηκαν.");
    } finally {
      setClearing(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen bg-[#090d16] text-slate-100">
        <main className="p-6">Φόρτωση…</main>
      </div>
    );
  if (!user)
    return (
      <div className="min-h-screen bg-[#090d16] text-slate-100">
        <main className="p-6">
          Απαιτείται{" "}
          <Link to="/auth" className="underline">
            σύνδεση
          </Link>
          .
        </main>
      </div>
    );
  if (setup.isPending)
    return (
      <div className="min-h-screen bg-[#090d16] text-slate-100">
        <main className="p-6">Έλεγχος πρόσβασης…</main>
      </div>
    );
  if (setup.isError || !setup.data)
    return (
      <div className="min-h-screen bg-[#090d16] text-slate-100">
        <main className="p-6" role="alert">
          Η πρόσβαση δεν επιτρέπεται ή η υπηρεσία δεν είναι διαθέσιμη.
        </main>
      </div>
    );

  const selectedModel = setup.data.models.find((item) => item.id === model);
  const isAi = provider === "ai-search";
  const configured =
    isAi || Boolean(setup.data.fixtureProviders.find((item) => item.id === provider)?.configured);
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
        `Θα γίνουν ${ids.length} ξεχωριστές έρευνες Tavily (${tavilySearchDepth === "advanced" ? "Advanced" : "Basic"}, 3 αναζητήσεις ανά αγώνα, περίπου ${ids.length * (tavilySearchDepth === "advanced" ? 6 : 3)} credits συνολικά) και κλήσεις OpenRouter, με ενδεχόμενη χρέωση ανά αγώνα. Επιβεβαιώνεις;`,
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
              leagueId: league as FootballAiDiscoveryLeagueId,
              weekDate,
              fixtureId: ids[i]!,
              modelId: selectedModel.id,
              requestKey: crypto.randomUUID(),
              withTavily: true,
              tavilySearchDepth,
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
      setEspnPreview(null);
    }
  };
  const allIds = upcoming.map((f) => f.sourceFixtureId);
  const picked = upcoming
    .filter((f) => selected.includes(fixtureKey(f.sourceFixtureId)))
    .map((f) => f.sourceFixtureId);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      <header className="w-full border-b border-cyan-400/20 bg-gradient-to-br from-[#102a48] via-[#142139] to-[#241b3e] px-4 py-5 shadow-lg shadow-cyan-950/20 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-4xl">
            Football <span className="text-cyan-300">Research Studio</span>
          </h1>
          <p className="mt-1 text-xs leading-5 text-slate-300 sm:text-sm">
            Πολλαπλές αναλύσεις, τεκμηριωμένα συμπεράσματα και ιστορικό ανά αγώνα.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Εργαλεία">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "predictions"}
              aria-controls="football-predictions"
              onClick={() => setActiveTab("predictions")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${activeTab === "predictions" ? "bg-cyan-500 text-slate-950" : "border border-white/20 text-slate-200"}`}
            >
              Προβλέψεις
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "kino"}
              aria-controls="football-kino"
              onClick={() => setActiveTab("kino")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${activeTab === "kino" ? "bg-cyan-500 text-slate-950" : "border border-white/20 text-slate-200"}`}
            >
              Κίνο
            </button>
          </div>
        </div>
      </header>
      <main
        id="football-predictions"
        role="tabpanel"
        hidden={activeTab !== "predictions"}
        className="mx-auto max-w-6xl space-y-5 px-3 pb-10 pt-4 text-slate-100 sm:px-6"
      >
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
                  const v = e.target.value as FootballProviderId | "ai-search";
                  setProvider(v);
                  setSelected([]);
                  setEspnPreview(null);
                  if (v === "football-data" && league === "GR-SL") setLeague("EN-PL");
                  if (v === "espn" && !FOOTBALL_ESPN_LEAGUES.some((x) => x.id === league))
                    setLeague("EN-PL");
                  if (
                    v !== "ai-search" &&
                    v !== "espn" &&
                    !FOOTBALL_LEAGUES.some((x) => x.id === league)
                  )
                    setLeague("EN-PL");
                }}
              >
                {FOOTBALL_PROVIDERS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                    {x.id === "football-data" ? " · Προεπιλογή" : ""}
                  </option>
                ))}
                <option value="ai-search">AI Αναζήτηση BETA · Gemini 3.8 Flash</option>
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
                  setEspnPreview(null);
                }}
              >
                {isAi &&
                  FOOTBALL_AI_DISCOVERY_LEAGUES.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.symbol} {x.label}
                    </option>
                  ))}
                {!isAi &&
                  (provider === "espn" ? FOOTBALL_ESPN_LEAGUES : FOOTBALL_LEAGUES).map((x) => (
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
                  setEspnPreview(null);
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
            {configured ? "Διαθέσιμος" : "Δεν έχει ρυθμιστεί API key"}.
          </p>
        </section>

        <fieldset
          disabled={working}
          className="rounded-2xl border border-cyan-300/20 bg-[#152137] p-4"
        >
          <legend className="px-1 text-sm font-semibold text-cyan-100">
            Αναζήτηση Tavily για την ανάλυση
          </legend>
          <div className="mt-1 flex flex-wrap gap-5 text-sm text-slate-100">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="football-tavily-depth"
                value="basic"
                checked={tavilySearchDepth === "basic"}
                onChange={() => setTavilySearchDepth("basic")}
                className="h-4 w-4 accent-cyan-400"
              />
              Basic · ~3 credits/αγώνα
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="football-tavily-depth"
                value="advanced"
                checked={tavilySearchDepth === "advanced"}
                onChange={() => setTavilySearchDepth("advanced")}
                className="h-4 w-4 accent-cyan-400"
              />
              Advanced · ~6 credits/αγώνα
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Ισχύει για κάθε αγώνα που αναλύεις, με τρεις αναζητήσεις Tavily. Η επιλογή δεν επηρεάζει
            την ξεχωριστή AI αναζήτηση αγώνων ούτε τη δεύτερη κλήση του Έμπειρου Αναλυτή. Τα credits
            είναι εκτιμήσεις.
          </p>
        </fieldset>
        {isAi && (
          <AiSearchPanel
            leagueId={league as FootballAiDiscoveryLeagueId}
            weekDate={weekDate}
            enabled={Boolean(user) && setup.isSuccess}
            working={working}
            canAnalyze={Boolean(selectedModel) && setup.data.aiAnalysisEnabled}
            onAnalyze={(ids) => void start(ids)}
          />
        )}
        {!isAi && (
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
              Έως 5 αναλύσεις ανά ώρα. Κάθε αγώνας χρεώνεται ξεχωριστά μετά από επιβεβαίωση. Η
              μαζική εκτέλεση γίνεται διαδοχικά όσο παραμένει ανοιχτή η σελίδα. Αποθηκεύεται κάθε
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
              <p className="text-sm text-amber-300">
                Δεν υπάρχει API key για τον επιλεγμένο πάροχο.
              </p>
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
                  const canAnalyze =
                    f.state === "scheduled" && Date.parse(f.kickoffUtc) > Date.now();
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
                      {provider === "espn" && canAnalyze && (
                        <button
                          type="button"
                          onClick={() => setEspnPreview(f.sourceFixtureId)}
                          className="rounded-lg border border-cyan-400/40 px-2 py-1.5 text-xs text-cyan-200"
                          aria-label={`Στοιχεία ESPN ${f.homeTeam} – ${f.awayTeam}`}
                        >
                          Στοιχεία ESPN
                        </button>
                      )}
                    </li>
                  );
                })}
            </ul>
            {provider === "espn" && espnPreview && (
              <div className="mt-4 space-y-2">
                {espnDetails.isPending && (
                  <p role="status" className="text-sm text-slate-300">
                    Ανάκτηση δεδομένων ESPN…
                  </p>
                )}
                {espnDetails.isError && (
                  <p role="alert" className="text-sm text-amber-200">
                    Τα πρόσθετα στοιχεία ESPN δεν είναι διαθέσιμα για τον αγώνα.
                  </p>
                )}
                {espnDetails.data && <EspnDataPanel data={espnDetails.data} />}
              </div>
            )}
          </section>
        )}

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
                  <div className="flex items-center">
                    {clearMode === "selected" && entry.status !== "processing" && (
                      <input
                        type="checkbox"
                        aria-label={`Επιλογή ανάλυσης ${entry.home_team} – ${entry.away_team}`}
                        checked={clearSelected.includes(entry.id)}
                        onChange={() =>
                          setClearSelected((prev) =>
                            prev.includes(entry.id)
                              ? prev.filter((id) => id !== entry.id)
                              : [...prev, entry.id],
                          )
                        }
                        className="ml-3 h-5 w-5 shrink-0 accent-cyan-400"
                      />
                    )}
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
                          {new Date(entry.created_at).toLocaleDateString("el-GR")} ·{" "}
                          {entry.model_id}
                          {entry.analysis?.tavilySearchDepth && (
                            <>
                              {" · Tavily "}
                              {entry.analysis.tavilySearchDepth === "advanced"
                                ? "Advanced"
                                : "Basic"}
                            </>
                          )}
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
                  </div>
                  {open && (
                    <div className="space-y-4 border-t border-white/10 p-4">
                      {entry.analysis ? (
                        <>
                          {entry.analysis.espnData && (
                            <details className="rounded-xl border border-cyan-300/20 bg-[#0a2036] p-3">
                              <summary className="cursor-pointer font-semibold text-cyan-200">
                                Δεδομένα ESPN που χρησιμοποιήθηκαν
                              </summary>
                              <div className="mt-3">
                                <EspnDataPanel data={entry.analysis.espnData} />
                              </div>
                            </details>
                          )}
                          <section className="rounded-xl border border-cyan-300/20 bg-[#0a2036] p-4">
                            <h3 className="text-base font-bold text-cyan-200">
                              Εκτιμώμενες πιθανότητες AI
                            </h3>
                            <p className="mb-4 mt-1 text-xs text-slate-400">
                              Υποκειμενικές εκτιμήσεις από διασταύρωση πηγών — όχι στατιστικά
                              βαθμονομημένες πιθανότητες.
                            </p>
                            {entry.analysis.estimates?.length ? (
                              <div className="space-y-3">
                                {entry.analysis.estimates.map((estimate) => (
                                  <div key={estimate.market} className="space-y-1">
                                    <div className="flex justify-between gap-3 text-sm">
                                      <span className="font-medium text-slate-100">
                                        {MARKET_LABELS[estimate.market] ?? estimate.market}
                                      </span>
                                      <strong className="tabular-nums text-cyan-200">
                                        {estimate.percent}%
                                      </strong>
                                    </div>
                                    <div
                                      className="h-2.5 overflow-hidden rounded-full bg-slate-700/80"
                                      role="progressbar"
                                      aria-label={MARKET_LABELS[estimate.market] ?? estimate.market}
                                      aria-valuenow={estimate.percent}
                                      aria-valuemin={0}
                                      aria-valuemax={100}
                                    >
                                      <div
                                        className={`h-full rounded-full ${estimate.percent >= 65 ? "bg-emerald-400" : estimate.percent >= 40 ? "bg-cyan-400" : "bg-amber-400"}`}
                                        style={{ width: `${estimate.percent}%` }}
                                      />
                                    </div>
                                    <p className="text-xs text-slate-400">{estimate.reason}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-amber-200">
                                Παλαιότερη ανάλυση χωρίς αριθμητικές εκτιμήσεις. Δεν κατασκευάζουμε
                                ποσοστά εκ των υστέρων.
                              </p>
                            )}
                          </section>
                          {entry.sources.length > 0 && (
                            <details className="rounded-xl border border-white/10 bg-[#0d192b] p-3">
                              <summary className="cursor-pointer font-semibold text-white">
                                Πηγές έρευνας ({entry.sources.length})
                              </summary>
                              <p className="mt-2 text-xs text-slate-400">
                                Τα δημοσιεύματα αποτελούν ερευνητικό υλικό, όχι αυτόματα
                                επαληθευμένα γεγονότα.
                              </p>
                              <ul className="mt-2 space-y-2 text-sm">
                                {entry.sources.map((source, index) => (
                                  <li key={`${source.url}-${index}`}>
                                    <a
                                      href={source.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="break-all text-cyan-300 underline"
                                    >
                                      {source.title || source.url}
                                    </a>
                                    <span className="ml-2 text-xs text-slate-400">
                                      {source.researchIntent === "external_forecasts"
                                        ? "Εξωτερική εκτίμηση"
                                        : "Στοιχεία αγώνα"}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                          <section className="rounded-xl border border-amber-400/20 bg-[#1b2131] p-4">
                            <h3 className="font-semibold text-amber-200">
                              Έμπειρος Αναλυτής · Πειραματικό
                            </h3>
                            {entry.expertReview?.decision ? (
                              <div className="mt-2 space-y-2 text-sm">
                                <p>
                                  {entry.expertReview.decision.decision === "abstain"
                                    ? "Αποχή — δεν προκύπτει τεκμηριωμένη επιλογή"
                                    : `Προσωπική εκτίμηση: ${MARKET_LABELS[entry.expertReview.decision.primary?.market ?? ""] ?? entry.expertReview.decision.primary?.market}`}
                                </p>
                                <p>
                                  {entry.expertReview.decision.primary?.rationale ??
                                    entry.expertReview.decision.abstentionReason}
                                </p>
                                {entry.expertReview.decision.primary && (
                                  <>
                                    <p>
                                      {`Εμπιστοσύνη: ${entry.expertReview.decision.primary.confidence} · εκτίμηση: ${entry.expertReview.decision.primary.percent ?? "—"}%`}
                                    </p>
                                    <p>
                                      Κύριος κίνδυνος:{" "}
                                      {entry.expertReview.decision.primary.mainRisk}
                                    </p>
                                  </>
                                )}
                                {entry.expertReview.decision.planB && (
                                  <p>
                                    Εναλλακτική: {entry.expertReview.decision.planB.market} —{" "}
                                    {entry.expertReview.decision.planB.rationale}
                                  </p>
                                )}
                              </div>
                            ) : entry.expertReview ? (
                              <p className="mt-2 text-sm text-slate-400">
                                Κατάσταση αξιολόγησης:{" "}
                                {STATUS[entry.expertReview.status] ?? entry.expertReview.status}
                                {entry.expertReview.status === "failed" && (
                                  <>
                                    {" · "}
                                    {EXPERT_FAILURE_REASON[entry.expertReview.errorCode ?? ""] ??
                                      "Δεν υπάρχουν επαρκή διαγνωστικά για αυτή την αποτυχία."}
                                  </>
                                )}
                              </p>
                            ) : entry.analysis.researchBrief &&
                              Date.parse(entry.kickoff_utc) > Date.now() ? (
                              <button
                                type="button"
                                disabled={working || !!expertBusy || !model}
                                className="mt-3 rounded-lg border border-amber-300/40 px-3 py-2 text-sm text-amber-100 disabled:opacity-40"
                                onClick={async () => {
                                  const selectedModel = setup.data?.models.find(
                                    (m) => m.id === model,
                                  );
                                  if (
                                    !selectedModel ||
                                    !window.confirm(
                                      "Πειραματική ανεξάρτητη εκτίμηση με νέα χρεώσιμη AI κλήση, χωρίς νέα αναζήτηση. Συνέχεια;",
                                    )
                                  )
                                    return;
                                  setExpertBusy(entry.id);
                                  setExpertError("");
                                  try {
                                    await runPrivateFootballExpertReview({
                                      data: {
                                        runId: entry.id,
                                        modelId: selectedModel.id,
                                        approvePaidRequest: true,
                                      },
                                    });
                                    await history.refetch();
                                  } catch {
                                    setExpertError(
                                      "Η πειραματική ανάλυση απέτυχε ή καταχωρίστηκε ήδη. Δεν επαναλαμβάνεται αυτόματα.",
                                    );
                                    await history.refetch();
                                  } finally {
                                    setExpertBusy(null);
                                  }
                                }}
                              >
                                {expertBusy === entry.id
                                  ? "Αξιολόγηση…"
                                  : "Εκτίμηση Έμπειρου Αναλυτή"}
                              </button>
                            ) : (
                              <p className="mt-2 text-sm text-slate-400">
                                Δεν υπάρχει κατάλληλο αποθηκευμένο ερευνητικό δελτίο ή ο αγώνας έχει
                                αρχίσει.
                              </p>
                            )}
                            {expertError && expertBusy === null && (
                              <p className="mt-2 text-xs text-rose-300" role="alert">
                                {expertError}
                              </p>
                            )}
                          </section>
                          {entry.analysis.matchContext && (
                            <details className="rounded-xl border border-white/10 bg-[#0d192b] p-3">
                              <summary className="cursor-pointer font-semibold text-white">
                                Δεδομένα αγώνα · βαθμολογία, φόρμα, κίνητρο και απουσίες
                              </summary>
                              <ul className="mt-2 space-y-2 text-sm text-slate-200">
                                {entry.analysis.matchContext.claims.map((claim, index) => (
                                  <li key={index}>
                                    <strong>{claim.category}:</strong> {claim.claim}
                                    <a
                                      href={claim.sourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ml-2 text-cyan-300 underline"
                                    >
                                      Πηγή
                                    </a>
                                    {claim.status === "scenario" && (
                                      <span className="ml-2 text-amber-200">(σενάριο)</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                              {entry.analysis.matchContext.missing.length > 0 && (
                                <p className="mt-2 text-xs text-amber-100">
                                  Ελλείψεις: {entry.analysis.matchContext.missing.join(" · ")}
                                </p>
                              )}
                              {entry.analysis.matchContext.conflicts.length > 0 && (
                                <p className="mt-2 text-xs text-amber-100">
                                  Αντικρουόμενα: {entry.analysis.matchContext.conflicts.join(" · ")}
                                </p>
                              )}
                            </details>
                          )}
                          <div className="rounded-xl bg-cyan-400/5 p-4">
                            <h3 className="mb-2 font-semibold text-cyan-200">Σύνοψη ανάλυσης</h3>
                            <p className="line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-200">
                              {entry.analysis.summary}
                            </p>
                          </div>
                          <details className="rounded-xl border border-white/10 bg-[#0d192b] p-3">
                            <summary className="mb-3 cursor-pointer font-semibold text-white">
                              Προτεινόμενα σημεία και αιτιολόγηση
                            </summary>
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
                            Τα ποσοστά είναι εκτιμήσεις της AI, όχι εγγυήσεις ή μετρημένες
                            πιθανότητες. Δεν αποτελούν απόδειξη στοιχηματικού πλεονεκτήματος.
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-slate-400">
                          {entry.status === "failed"
                            ? `${FAILURE_REASON[entry.error_code ?? ""] ?? "Η ανάλυση απέτυχε."} Δεν επαναλαμβάνεται αυτόματα.`
                            : "Η ανάλυση δεν έχει ολοκληρωθεί."}
                        </p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="relative min-w-0 flex-1">
              <button
                type="button"
                disabled={
                  clearing ||
                  working ||
                  !(history.data ?? []).some((item) => item.status !== "processing")
                }
                onClick={() => setClearMenu((value) => !value)}
                className="w-full whitespace-nowrap rounded-xl border border-white/20 px-2 py-2 text-sm font-semibold text-slate-200 disabled:opacity-40"
              >
                Εκκαθάριση ▾
              </button>
              {clearMenu && (
                <div className="absolute bottom-full left-0 z-20 mb-1 w-52 rounded-xl border border-white/20 bg-[#0c1728] p-2 shadow-xl">
                  <button
                    type="button"
                    className="block w-full rounded-lg p-2 text-left text-sm hover:bg-white/10"
                    onClick={() => {
                      setClearConfirm(
                        (history.data ?? [])
                          .filter((item) => item.status !== "processing")
                          .map((item) => item.id),
                      );
                      setClearMenu(false);
                    }}
                  >
                    Εκκαθάριση όλων
                  </button>
                  <button
                    type="button"
                    className="block w-full rounded-lg p-2 text-left text-sm hover:bg-white/10"
                    onClick={() => {
                      setClearMode("selected");
                      setClearConfirm([]);
                      setClearMenu(false);
                    }}
                  >
                    Εκκαθάριση επιλεγμένων
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={saveResults}
              disabled={!history.data?.length}
              className="min-w-0 flex-1 whitespace-nowrap rounded-xl bg-cyan-500 px-2 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
            >
              Εξαγωγή
            </button>
          </div>
          {clearMode === "selected" && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={!clearSelected.length || clearing}
                onClick={() => void clearResults(clearSelected)}
                className="rounded-xl bg-rose-500/20 px-3 py-2 text-sm text-rose-200 disabled:opacity-40"
              >
                Επιβεβαίωση ({clearSelected.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setClearMode("none");
                  setClearSelected([]);
                  setClearConfirm([]);
                }}
                className="rounded-xl border border-white/20 px-3 py-2 text-sm"
              >
                Ακύρωση
              </button>
            </div>
          )}
          {clearConfirm.length > 0 && (
            <div className="mt-3 rounded-xl border border-rose-400/30 bg-[#0c1728] p-3">
              <p className="text-sm">
                Εκκαθάριση {clearConfirm.length} αναλύσεων από την προβολή; Τα στοιχεία ελέγχου
                διατηρούνται.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={clearing}
                  onClick={() => void clearResults(clearConfirm)}
                  className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Επιβεβαίωση
                </button>
                <button
                  type="button"
                  onClick={() => setClearConfirm([])}
                  className="rounded-lg border border-white/20 px-3 py-2 text-sm"
                >
                  Ακύρωση
                </button>
              </div>
            </div>
          )}
          {clearError && (
            <p role="alert" className="mt-2 text-sm text-rose-300">
              {clearError}
            </p>
          )}
        </section>
      </main>
      <section id="football-kino" role="tabpanel" hidden={activeTab !== "kino"}>
        {activeTab === "kino" && <KinoLivePanel />}
      </section>
    </div>
  );
}
