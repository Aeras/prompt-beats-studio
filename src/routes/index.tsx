import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { FolderOpen, Home, Sparkles } from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { getHomeRecentProject } from "@/lib/home.functions";
import type { HomeRecentProject } from "@/lib/home-recent-project.shared";
import { canonicalLink, canonicalUrl, robotsContent, safeJsonLd } from "@/lib/seo-policy";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = typeof search["q"] === "string" ? search["q"].trim() : "";
    return q ? { q } : {};
  },
  beforeLoad: ({ search }) => {
    if (!search.q) return;
    throw redirect({
      to: "/discover",
      search: { q: search.q },
      replace: true,
    });
  },
  head: () => {
    const canonical = canonicalLink("/");
    const ogUrl = canonicalUrl("/");
    const description =
      "PromptBeats is an AI-assisted songwriting and song development platform for developing ideas, lyrics, structure, style, mood, instrumentation, production direction, and song Projects.";
    return {
      meta: [
        { title: "PromptBeats — AI-Assisted Songwriting & Song Development" },
        { name: "description", content: description },
        { name: "robots", content: robotsContent("index") },
        {
          property: "og:title",
          content: "PromptBeats — AI-Assisted Songwriting & Song Development",
        },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        ...(ogUrl ? [{ property: "og:url", content: ogUrl }] : []),
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: canonical ? [canonical] : [],
      scripts: ogUrl
        ? [
            {
              type: "application/ld+json",
              children: safeJsonLd({
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: "PromptBeats",
                url: ogUrl,
                description:
                  "PromptBeats is an AI-assisted songwriting and song development platform.",
              }),
            },
          ]
        : [],
    };
  },
  component: HomePage,
});

function HomePage() {
  const { language } = useI18n();
  const { user, loading } = useAuth();
  const el = language === "el";
  const recentProject = useQuery({
    queryKey: ["home", "recent-project"],
    queryFn: () => getHomeRecentProject(),
    enabled: !loading && Boolean(user),
    staleTime: 30_000,
  });

  const header = (
    <div className="flex min-w-0 items-center gap-2">
      <Home className="h-5 w-5 shrink-0 text-accent" />
      <span className="truncate font-display text-base font-bold md:text-lg">
        {el ? "Αρχική" : "Home"}
      </span>
    </div>
  );

  return (
    <AppShell header={header}>
      <main className="mx-auto w-full max-w-5xl px-4 pb-[180px] pt-8 md:px-8 md:pb-[120px] md:pt-12">
        {loading ? (
          <div className="glass rounded-3xl p-8 text-sm text-muted-foreground" aria-live="polite">
            {el ? "Φόρτωση..." : "Loading..."}
          </div>
        ) : user ? (
          <AuthenticatedHome
            el={el}
            recentProject={recentProject.data ?? null}
            recentLoading={recentProject.isLoading}
            recentError={recentProject.isError}
          />
        ) : (
          <GuestHome el={el} />
        )}
      </main>
    </AppShell>
  );
}

function GuestHome({ el }: { el: boolean }) {
  return (
    <section className="space-y-6">
      <div className="glass-strong rounded-3xl p-6 sm:p-8 md:p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10">
          <Sparkles className="h-6 w-6 text-accent" />
        </div>
        <h1 className="mt-6 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {el ? "Ξεκίνα το επόμενο τραγούδι σου." : "Start your next song."}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {el
            ? "Ανάπτυξε την ιδέα, τους στίχους, τη δομή και το prompt σου σε ένα δημιουργικό workflow."
            : "Develop your idea, lyrics, structure, and prompt in one creative workflow."}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            to="/auth"
            search={{ next: "create" }}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gradient-neon px-5 py-3 text-sm font-semibold text-primary-foreground glow-neon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            {el ? "Ξεκίνα δημιουργία" : "Start creating"}
          </Link>
          <Link
            to="/discover"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            {el ? "Ανακάλυψε μουσική" : "Explore Discover"}
          </Link>
        </div>
      </div>
    </section>
  );
}

function AuthenticatedHome({
  el,
  recentProject,
  recentLoading,
  recentError,
}: {
  el: boolean;
  recentProject: HomeRecentProject | null;
  recentLoading: boolean;
  recentError: boolean;
}) {
  return (
    <section className="space-y-6">
      <div className="glass-strong rounded-3xl p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {el ? "Τι θέλεις να δημιουργήσεις σήμερα;" : "What do you want to create today?"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {el
            ? "Ξεκίνα κάτι νέο ή συνέχισε το πιο πρόσφατο Project σου."
            : "Start something new or continue your most recent Project."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/create"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gradient-neon px-5 py-3 text-sm font-semibold text-primary-foreground glow-neon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            {el ? "Νέα δημιουργία" : "Start creating"}
          </Link>
          <Link
            to="/discover"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            Discover
          </Link>
        </div>
      </div>

      {recentLoading ? (
        <div className="glass rounded-2xl p-5 text-sm text-muted-foreground" aria-live="polite">
          {el ? "Εύρεση πρόσφατου Project..." : "Finding your recent Project..."}
        </div>
      ) : recentError ? (
        <div className="glass rounded-2xl p-5 text-sm text-muted-foreground">
          {el
            ? "Δεν ήταν δυνατή η φόρτωση του πρόσφατου Project. Μπορείς να συνεχίσεις από τη Βιβλιοθήκη."
            : "Your recent Project could not be loaded. You can still continue from Library."}
        </div>
      ) : recentProject ? (
        <article className="glass rounded-2xl p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03]">
              <FolderOpen className="h-5 w-5 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {el ? "Πρόσφατο Project" : "Recent Project"}
              </p>
              <h2 className="mt-1 truncate font-display text-xl font-bold">
                {recentProject.projectName}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {recentProject.versionLabel ||
                  (el
                    ? `Έκδοση ${recentProject.versionNumber}`
                    : `Version ${recentProject.versionNumber}`)}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  to="/library"
                  search={{ tab: "prompts" }}
                  aria-label={
                    el
                      ? `Συνέχισε το Project ${recentProject.projectName}`
                      : `Continue Project ${recentProject.projectName}`
                  }
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  {el ? "Συνέχισε το Project" : "Continue Project"}
                </Link>
                <Link
                  to="/library"
                  search={{ tab: "prompts" }}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  {el ? "Όλα τα Projects" : "View all Projects"}
                </Link>
              </div>
            </div>
          </div>
        </article>
      ) : (
        <div className="glass rounded-2xl p-5 sm:p-6">
          <p className="text-sm font-semibold">
            {el ? "Δεν έχεις Project ακόμη." : "No Projects yet."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {el
              ? "Μπορείς να ξεκινήσεις μια νέα δημιουργία χωρίς να χρειάζεται πρώτα να φτιάξεις Project."
              : "You can start creating without creating a Project first."}
          </p>
        </div>
      )}
    </section>
  );
}
