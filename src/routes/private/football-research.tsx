import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getPrivateFootballResearchHistory,
  runPrivateFootballResearch,
} from "@/lib/football-ai-research.functions";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/promptbeats/AppShell";
import { FOOTBALL_LEAGUES } from "@/lib/football-research.shared";
import {
  getPrivateFootballResearchSetup,
  getPrivateFootballWeek,
} from "@/lib/football-research.functions";

export const Route = createFileRoute("/private/football-research")({
  head: () => ({
    meta: [
      { title: "Private Football Research — PromptBeats" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
  }),
  component: PrivateFootballResearchPage,
});

function PrivateFootballResearchPage() {
  const { user, loading } = useAuth();
  const setup = useQuery({
    queryKey: ["private-football-research-setup", user?.id],
    queryFn: () => getPrivateFootballResearchSetup(),
    enabled: Boolean(user),
    retry: false,
  });
  const [league, setLeague] = useState<string>(FOOTBALL_LEAGUES[0].id);
  const [model, setModel] = useState("");
  const [weekDate, setWeekDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" }),
  );
  const fixtures = useQuery({
    queryKey: ["football-week", user?.id, league, weekDate],
    queryFn: () =>
      getPrivateFootballWeek({
        data: { leagueId: league as (typeof FOOTBALL_LEAGUES)[number]["id"], weekDate },
      }),
    enabled: Boolean(user) && setup.isSuccess && setup.data.liveFixturesConfigured,
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
  const analysis = useMutation({
    mutationFn: (fixtureId: string) =>
      runPrivateFootballResearch({
        data: {
          leagueId: league as (typeof FOOTBALL_LEAGUES)[number]["id"],
          weekDate,
          fixtureId,
          modelId: model,
          requestKey: crypto.randomUUID(),
          withTavily: true,
          approvePaidRequest: true,
        },
      }),
    retry: false,
    onSuccess: () => {
      void history.refetch();
    },
  });
  const header = <span className="font-display text-lg font-bold">Football Research Studio</span>;

  if (loading)
    return (
      <AppShell header={header}>
        <main className="p-6">Φόρτωση…</main>
      </AppShell>
    );
  if (!user) {
    return (
      <AppShell header={header}>
        <main className="p-6">
          Απαιτείται σύνδεση.{" "}
          <Link to="/auth" className="underline">
            Σύνδεση
          </Link>
        </main>
      </AppShell>
    );
  }
  if (setup.isPending)
    return (
      <AppShell header={header}>
        <main className="p-6">Έλεγχος πρόσβασης…</main>
      </AppShell>
    );
  if (setup.isError || !setup.data) {
    return (
      <AppShell header={header}>
        <main className="p-6" role="alert">
          Δεν επιτρέπεται η πρόσβαση ή η υπηρεσία δεν είναι διαθέσιμη.
        </main>
      </AppShell>
    );
  }

  const selectedModel = setup.data.models.find((item) => item.id === model);
  return (
    <AppShell header={header}>
      <main className="mx-auto max-w-5xl space-y-6 px-4 pb-24 pt-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Ιδιωτική ανάλυση ποδοσφαίρου</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ερευνητική λειτουργία σε ανάπτυξη. Δεν παρουσιάζονται υποθετικά παιχνίδια ως πραγματικά.
          </p>
        </div>
        <section className="glass space-y-4 rounded-2xl p-5" aria-label="Επιλογές έρευνας">
          <div>
            <label htmlFor="football-league" className="mb-2 block text-sm font-medium">
              Πρωτάθλημα
            </label>
            <select
              id="football-league"
              value={league}
              onChange={(event) => setLeague(event.target.value)}
              className="w-full rounded-lg border border-input bg-background p-3"
            >
              {FOOTBALL_LEAGUES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="football-model" className="mb-2 block text-sm font-medium">
              Μοντέλο AI — OpenRouter
            </label>
            <select
              id="football-model"
              value={selectedModel?.id ?? ""}
              onChange={(event) => setModel(event.target.value)}
              className="w-full rounded-lg border border-input bg-background p-3"
            >
              <option value="">Επιλογή μοντέλου</option>
              {setup.data.models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            {setup.data.models.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Δεν υπάρχει διαθέσιμο συμβατό μοντέλο OpenRouter.
              </p>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Tavily:{" "}
            {setup.data.tavilyConfigured
              ? "Διαθέσιμη για έρευνα πηγών πριν από την ανάλυση."
              : "Δεν έχει ρυθμιστεί."}
          </p>
        </section>
        <section className="glass rounded-2xl p-5" aria-label="Αγώνες εβδομάδας">
          <h2 className="mb-2 text-lg font-bold">Αγώνες εβδομάδας</h2>
          <label htmlFor="football-date" className="mb-2 block text-sm">
            Εβδομάδα (επιλογή ημερομηνίας)
          </label>
          <input
            id="football-date"
            type="date"
            value={weekDate}
            onChange={(e) => setWeekDate(e.target.value)}
            className="mb-4 rounded-lg border border-input bg-background p-2"
          />
          {!setup.data.liveFixturesConfigured && (
            <p className="text-sm text-muted-foreground">
              Δεν έχει ρυθμιστεί πηγή πραγματικών αγώνων (API_FOOTBALL_KEY).
            </p>
          )}
          {fixtures.isPending && setup.data.liveFixturesConfigured && (
            <p className="text-sm text-muted-foreground">Ανάκτηση αγώνων…</p>
          )}
          {fixtures.isError && (
            <p role="alert" className="text-sm text-destructive">
              Αποτυχία ανάκτησης αγώνων.
            </p>
          )}
          {fixtures.data?.status === "ok" && fixtures.data.fixtures.length === 0 && (
            <p className="text-sm text-muted-foreground">Δεν βρέθηκαν αγώνες αυτή την εβδομάδα.</p>
          )}
          {fixtures.data?.status === "ok" && (
            <ul className="divide-y divide-border">
              {fixtures.data.fixtures.map((fixture) => (
                <li
                  key={fixture.sourceFixtureId}
                  className="flex flex-wrap justify-between gap-2 py-3"
                >
                  <span>
                    {fixture.homeTeam} — {fixture.awayTeam}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {new Intl.DateTimeFormat("el-GR", {
                      timeZone: "Europe/Athens",
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(fixture.kickoffUtc))}{" "}
                    · {fixture.state}
                  </span>
                  <button
                    type="button"
                    disabled={
                      !setup.data.aiAnalysisEnabled ||
                      !selectedModel ||
                      analysis.isPending ||
                      fixture.state !== "scheduled" ||
                      Date.parse(fixture.kickoffUtc) <= Date.now()
                    }
                    className="rounded-lg border border-input px-3 py-2 text-sm disabled:opacity-40"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Η έρευνα Tavily και η ανάλυση OpenRouter ενδέχεται να χρεωθούν. Να εκτελεστεί μία ανάλυση αυτού του αγώνα;",
                        )
                      ) {
                        analysis.mutate(fixture.sourceFixtureId);
                      }
                    }}
                  >
                    {analysis.isPending ? "Ανάλυση…" : "AI ανάλυση"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!setup.data.aiAnalysisEnabled && (
            <p className="mt-3 text-sm text-muted-foreground">
              Δεν είναι διαθέσιμη η ασφαλής AI ανάλυση στον τρέχοντα server.
            </p>
          )}
          {analysis.isError && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              Η ανάλυση απέτυχε ή δεν ήταν επιτρεπτή. Το αίτημα δεν επαναλαμβάνεται αυτόματα.
            </p>
          )}
          {analysis.isSuccess && (
            <div className="mt-5 space-y-4 rounded-xl border border-border p-4">
              <h3 className="font-bold">Αποτέλεσμα AI · {analysis.data.modelId}</h3>
              <p className="text-sm">{analysis.data.analysis.summary}</p>
              {analysis.data.analysis.suggestions.length === 0 && (
                <p className="text-sm">Δεν προκύπτει τεκμηριωμένη πρόταση.</p>
              )}
              <ul className="space-y-3">
                {analysis.data.analysis.suggestions.map((item) => (
                  <li key={item.market} className="rounded-lg bg-background p-3">
                    <strong>{item.market.replaceAll("_", " ")}</strong>
                    <p className="mt-1 text-sm">{item.rationale}</p>
                    <span className="text-xs text-muted-foreground">
                      Τεκμηρίωση: {item.evidence}
                    </span>
                  </li>
                ))}
              </ul>
              <h4 className="font-semibold">Πηγές έρευνας</h4>
              <ul className="space-y-2 text-sm">
                {analysis.data.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Οι εκτιμήσεις δεν αποτελούν εγγύηση ή απόδειξη στοιχηματικού πλεονεκτήματος.
                Καταχωρίστηκαν στο ιδιωτικό ιστορικό πριν από την έναρξη του αγώνα.
              </p>
            </div>
          )}
        </section>
        <section className="glass space-y-3 rounded-2xl p-5" aria-label="Ιστορικό προβλέψεων">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Prediction Tracker</h2>
            <button
              type="button"
              onClick={() => void history.refetch()}
              disabled={history.isFetching}
              className="rounded-lg border border-input px-3 py-2 text-sm disabled:opacity-40"
            >
              {history.isFetching ? "Έλεγχος αποτελεσμάτων…" : "Ανανέωση αποτελεσμάτων"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Αυτόματη αξιολόγηση έως τριών πρόσφατων ομάδων αγώνων ανά ανανέωση, μόνο με επίσημα
            αποτελέσματα κανονικής διάρκειας (FT). Στα κόρνερ δεν υπολογίζεται αποτέλεσμα χωρίς
            δεδομένα.
          </p>
          {history.isError && (
            <p role="alert" className="text-sm text-muted-foreground">
              Το ιστορικό δεν είναι διαθέσιμο ή η migration δεν έχει εφαρμοστεί.
            </p>
          )}
          {history.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Δεν έχουν καταχωριστεί αναλύσεις.</p>
          )}
          <ul className="space-y-3">
            {history.data?.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>
                    {entry.home_team} — {entry.away_team}
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    {entry.status} · {new Date(entry.created_at).toLocaleDateString("el-GR")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Μοντέλο: {entry.model_id}</p>
                {entry.outcomes.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                    {entry.outcomes.map((item) => (
                      <li key={item.market} className="rounded border border-border px-2 py-1">
                        {item.market.replaceAll("_", " ")}:{" "}
                        {item.outcome === true
                          ? "Επιτυχία"
                          : item.outcome === false
                            ? "Αποτυχία"
                            : "Εκκρεμεί"}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </AppShell>
  );
}
