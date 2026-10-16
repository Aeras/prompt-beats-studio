import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Compass, FolderOpen, Home, Lightbulb, Map, Music2, Orbit, Sparkles } from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useAppShellActions } from "@/components/promptbeats/AppShellActions";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { getHomeResume } from "@/lib/home.functions";
import type { HomeResumeItem } from "@/lib/home-resume.shared";
import { resolveHomeCreatorState, type HomeCreatorState } from "@/lib/home-creator-state";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
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

  const creatorState = resolveHomeCreatorState({
    authLoading: loading,
    resumeLoading: resume.isLoading,
    data: resume.data,
    queryError: resume.error,
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
            state={creatorState}
            onRetry={() => void resume.refetch()}
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
  state,
  onRetry,
}: {
  el: boolean;
  state: HomeCreatorState;
  onRetry: () => void;
}) {
  const { openTrackSubmission } = useAppShellActions();
  const generatorAccess = useFeatureAccess("ai_generator");
  const navigate = useNavigate();
  const items = state.kind === "available" || state.kind === "degraded" ? state.items : [];
  const primary = items[0];
  const secondary = items.slice(1);
  const retry = (
    <button type="button" onClick={onRetry} className="min-h-11 rounded-xl border border-accent/40 px-4 text-sm font-semibold text-accent focus-visible:ring-2 focus-visible:ring-accent">
      {el ? "Δοκίμασε ξανά" : "Retry"}
    </button>
  );
  return (
    <section className="space-y-6">
      <div className="glass-strong rounded-3xl p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {el ? "Συνέχισε τη δημιουργία σου" : "Continue creating"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {el ? "Η δημιουργική δουλειά σου, έτοιμη να τη συνεχίσεις." : "Pick up your creative work where you left off."}
        </p>
        {state.kind === "resume-loading" || state.kind === "auth-loading" ? (
          <p className="mt-6 text-sm text-muted-foreground" role="status">{el ? "Φόρτωση εργασιών..." : "Loading your work..."}</p>
        ) : primary ? (
          <div className="mt-6 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{el ? "Συνέχισε" : "Continue"}</h2>
            <div className="max-w-2xl"><ResumeCard item={primary} el={el} /></div>
          </div>
        ) : state.kind === "verified-empty" ? (
          <p className="mt-6 text-sm text-muted-foreground" role="status">
            {el ? "Δεν έχεις ξεκινήσει ακόμη δημιουργική δουλειά. Ξεκίνα το πρώτο σου τραγούδι." : "No creative work yet. Start your first song."}
          </p>
        ) : (
          <div className="mt-6 flex flex-wrap items-center gap-3" role="alert">
            <p className="text-sm text-muted-foreground">{el ? "Δεν ήταν δυνατή η φόρτωση της δουλειάς σου." : "Your work could not be loaded."}</p>
            {retry}
          </div>
        )}
        {state.kind === "degraded" && (
          <div className="mt-4 flex flex-wrap items-center gap-3" role="status">
            <p className="text-xs text-muted-foreground">{el ? "Κάποιες εργασίες δεν φορτώθηκαν." : "Some work could not be loaded."}</p>
            {retry}
          </div>
        )}
      </div>
      {secondary.length > 0 && (
        <section aria-labelledby="home-other-work" className="space-y-3">
          <h2 id="home-other-work" className="font-display text-xl font-bold">{el ? "Επίσης στη δουλειά σου" : "More to continue"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">{secondary.map(item => <ResumeCard key={item.type + ":" + item.id} item={item} el={el} />)}</div>
        </section>
      )}
      <section aria-labelledby="home-quick-actions" className="space-y-3">
        <h2 id="home-quick-actions" className="font-display text-xl font-bold">{el ? "Γρήγορες ενέργειες" : "Quick actions"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {generatorAccess.isLoading ? (
            <div className="glass rounded-2xl p-5 text-sm text-muted-foreground" role="status">{el ? "Έλεγχος πρόσβασης..." : "Checking access..."}</div>
          ) : generatorAccess.allowed ? (
            <button type="button" onClick={() => void navigate({ to: "/generate", search: { start: "new", session: crypto.randomUUID() } })}
              className="min-h-20 rounded-2xl border border-accent/30 bg-accent/10 p-5 text-left font-semibold focus-visible:ring-2 focus-visible:ring-accent">
              <Sparkles className="mb-2 h-5 w-5 text-accent" />{el ? "Νέο τραγούδι" : "New Song"}
            </button>
          ) : (
            <div className="rounded-2xl border border-white/10 p-5 text-sm text-muted-foreground" role="status">{el ? "Η δημιουργία τραγουδιού δεν είναι διαθέσιμη." : "New Song is not available for this account."}</div>
          )}
          <button type="button" onClick={openTrackSubmission} className="min-h-20 rounded-2xl border border-white/10 p-5 text-left font-semibold focus-visible:ring-2 focus-visible:ring-accent">
            <Music2 className="mb-2 h-5 w-5 text-accent" />{el ? "Πρόσθεσε τραγούδι" : "Add Song"}
          </button>
          <Link to="/library" search={{ tab: "prompts", view: "projects" }} className="min-h-20 rounded-2xl border border-white/10 p-5 font-semibold focus-visible:ring-2 focus-visible:ring-accent">
            <FolderOpen className="mb-2 h-5 w-5 text-accent" />{el ? "Όλα τα Projects" : "All Projects"}
          </Link>
          <Link to="/create" className="min-h-20 rounded-2xl border border-white/10 p-5 font-semibold focus-visible:ring-2 focus-visible:ring-accent">
            <Sparkles className="mb-2 h-5 w-5 text-accent" />Create
          </Link>
        </div>
        <Link to="/discover" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-accent">
          <Compass className="h-4 w-4" />Discover
        </Link>
      </section>
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
