import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Compass, FolderOpen, Home, Lightbulb, Map, Music2, Orbit, Sparkles } from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useAppShellActions } from "@/components/promptbeats/AppShellActions";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { getHomeResume } from "@/lib/home.functions";
import type { HomeResumeItem } from "@/lib/home-resume.shared";
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
  const resume = useQuery({
    queryKey: ["home", "resume"],
    queryFn: () => getHomeResume(),
    enabled: !loading && Boolean(user),
    staleTime: 0,
    refetchOnMount: "always",
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
            items={resume.data?.items ?? []}
            resumeLoading={resume.isLoading}
            failedSourceCount={resume.data?.failedSources.length ?? 0}
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
  items,
  resumeLoading,
  failedSourceCount,
}: {
  el: boolean;
  items: HomeResumeItem[];
  resumeLoading: boolean;
  failedSourceCount: number;
}) {
  const { openTrackSubmission } = useAppShellActions();

  return (
    <section className="space-y-6">
      <div className="glass-strong rounded-3xl p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {el ? "Τι θέλεις να δημιουργήσεις σήμερα;" : "What do you want to create today?"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {el
            ? "Ξεκίνα κάτι νέο, πρόσθεσε ένα τραγούδι ή εξερεύνησε τη μουσική της κοινότητας."
            : "Start something new, add a song, or explore music from the community."}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Link
            to="/create"
            className="flex min-h-24 items-center gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-4 text-left transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <Sparkles className="h-5 w-5 shrink-0 text-accent" />
            <span>
              <span className="block text-sm font-semibold">
                {el ? "Νέα δημιουργία" : "New creation"}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {el ? "Μπες στο Create" : "Open Create"}
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={openTrackSubmission}
            className="flex min-h-24 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:border-accent/30 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <Music2 className="h-5 w-5 shrink-0 text-accent" />
            <span>
              <span className="block text-sm font-semibold">
                {el ? "Πρόσθεσε τραγούδι" : "Add a song"}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {el ? "Upload ή σύνδεσμος" : "Upload or link"}
              </span>
            </span>
          </button>
          <Link
            to="/discover"
            className="flex min-h-24 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:border-accent/30 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <Compass className="h-5 w-5 shrink-0 text-accent" />
            <span>
              <span className="block text-sm font-semibold">{el ? "Εξερεύνησε" : "Explore"}</span>
              <span className="mt-1 block text-xs text-muted-foreground">Discover</span>
            </span>
          </Link>
        </div>
      </div>

      {resumeLoading ? (
        <div className="glass rounded-2xl p-5 text-sm text-muted-foreground" aria-live="polite">
          {el ? "Εύρεση πρόσφατης δημιουργικής δουλειάς..." : "Finding recent creative work..."}
        </div>
      ) : items.length > 0 ? (
        <section aria-labelledby="home-resume-heading" className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="home-resume-heading" className="font-display text-xl font-bold">
                {el ? "Συνέχισε" : "Resume"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {el ? "Επέστρεψε εκεί που δούλευες πρόσφατα." : "Return to recent creative work."}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <ResumeCard key={`${item.type}:${item.id}`} item={item} el={el} />
            ))}
          </div>
          {failedSourceCount >= 2 && (
            <p className="text-xs text-muted-foreground" role="status">
              {el
                ? "Κάποια πρόσφατη δουλειά δεν μπόρεσε να φορτωθεί αυτή τη στιγμή."
                : "Some recent work could not be loaded right now."}
            </p>
          )}
        </section>
      ) : null}
    </section>
  );
}

function ResumeCard({ item, el }: { item: HomeResumeItem; el: boolean }) {
  const content = (
    <>
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03]">
        <ResumeIcon type={item.type} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {resumeTypeLabel(item.type, el)}
        </p>
        <h3 className="mt-1 truncate font-display text-lg font-bold">{item.title}</h3>
        <p className="mt-2 text-sm font-semibold text-accent">{el ? "Συνέχισε" : "Resume"}</p>
      </div>
    </>
  );
  const className =
    "flex min-h-28 items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition-colors hover:border-accent/30 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70";
  const ariaLabel = `${el ? "Συνέχισε" : "Resume"} ${resumeTypeLabel(item.type, el)} ${item.title}`;

  switch (item.type) {
    case "project":
      return (
        <Link
          to="/library"
          search={{ tab: "prompts", project: item.id }}
          className={className}
          aria-label={ariaLabel}
        >
          {content}
        </Link>
      );
    case "song_universe":
      return (
        <Link
          to="/song-universe"
          search={{ universe: item.id }}
          className={className}
          aria-label={ariaLabel}
        >
          {content}
        </Link>
      );
    case "story_map":
      return (
        <Link
          to="/story-map"
          search={{ map: item.id }}
          className={className}
          aria-label={ariaLabel}
        >
          {content}
        </Link>
      );
    case "inspiration_wall":
      return (
        <Link
          to="/inspiration-wall"
          search={{ wall: item.id }}
          className={className}
          aria-label={ariaLabel}
        >
          {content}
        </Link>
      );
  }
}

function ResumeIcon({ type }: { type: HomeResumeItem["type"] }) {
  const className = "h-5 w-5 text-accent";
  if (type === "project") return <FolderOpen className={className} />;
  if (type === "song_universe") return <Orbit className={className} />;
  if (type === "story_map") return <Map className={className} />;
  return <Lightbulb className={className} />;
}

function resumeTypeLabel(type: HomeResumeItem["type"], el: boolean) {
  if (type === "project") return el ? "Project" : "Project";
  if (type === "song_universe") return "Song Universe";
  if (type === "story_map") return "Story Map";
  return el ? "Πίνακας Έμπνευσης" : "Inspiration Wall";
}
