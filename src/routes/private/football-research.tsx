import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
              ? "Ρυθμισμένο — η αναζήτηση δεν έχει ενεργοποιηθεί ακόμη."
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
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled
            className="mt-4 rounded-lg border border-input px-4 py-2 opacity-60"
          >
            Ανάλυση με AI — μη διαθέσιμη ακόμη
          </button>
        </section>
      </main>
    </AppShell>
  );
}
