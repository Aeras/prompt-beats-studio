import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Menu, Search, X, Compass, Flame, Sparkles, Library } from "lucide-react";
import { SidebarNav, type NavId } from "@/components/promptbeats/Sidebar";
import { TrackCard } from "@/components/promptbeats/TrackCard";
import { PlayerBar } from "@/components/promptbeats/PlayerBar";
import { StudioModal } from "@/components/promptbeats/StudioModal";
import { ProfileBanner } from "@/components/promptbeats/ProfileBanner";
import { GENRES, TRACKS, type Track } from "@/lib/tracks";
import { listPublishedTracks } from "@/lib/tracks.functions";
import artFallback from "@/assets/art-3.jpg";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number | null) {
  if (!seconds) return "--:--";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PromptBeats — AI Music Prompts, Tracks & Studio" },
      {
        name: "description",
        content:
          "Discover AI-generated tracks, copy the exact prompts behind them, and craft your own lyrics in the PromptBeats studio.",
      },
      { property: "og:title", content: "PromptBeats — AI Music Prompts, Tracks & Studio" },
      {
        property: "og:description",
        content: "Share AI music, copy prompts, and build your next track in a neon studio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const MOBILE_TABS = [
  { id: "discover", label: "Feed", icon: Compass },
  { id: "trending", label: "Trending", icon: Flame },
  { id: "studio", label: "Studio", icon: Sparkles },
  { id: "library", label: "Library", icon: Library },
] as const;

function Index() {
  const [nav, setNav] = useState<NavId>("discover");
  const [genre, setGenre] = useState("All");
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [studio, setStudio] = useState(false);
  const [current, setCurrent] = useState<Track>(TRACKS[0]!);
  const [playing, setPlaying] = useState(false);

  const openStudio = () => {
    setStudio(true);
    setDrawer(false);
  };

  const select = (id: NavId) => {
    setNav(id);
    setDrawer(false);
    if (id === "studio") setStudio(true);
  };

  const { data } = useQuery({
    queryKey: ["tracks", "published"],
    queryFn: () => listPublishedTracks(),
  });

  const uploaded: Track[] = (data?.tracks ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    handle: t.handle,
    genre: t.genre,
    art: t.art_url ?? artFallback,
    duration: formatDuration(t.duration_seconds),
    plays: String(t.plays),
    prompt: t.prompt,
    lyrics: t.lyrics,
    audioUrl: t.audio_url,
  }));

  const all = [...uploaded, ...TRACKS];

  const list = all.filter(
    (t) =>
      (genre === "All" || t.genre === genre) &&
      (t.title + t.handle + t.prompt).toLowerCase().includes(query.toLowerCase()),
  );

  const play = (t: Track) => {
    if (current.id === t.id) return setPlaying((p) => !p);
    setCurrent(t);
    setPlaying(true);
  };

  const step = (dir: 1 | -1) => {
    const i = all.findIndex((t) => t.id === current.id);
    setCurrent(all[(i + dir + all.length) % all.length]!);
    setPlaying(true);
  };

  return (
    <div className="aurora min-h-screen bg-[#0a0a0c]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[270px] border-r border-white/10 bg-black/40 backdrop-blur-xl lg:block">
        <SidebarNav active={nav} onSelect={select} onSubmit={openStudio} />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          drawer ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div
          onClick={() => setDrawer(false)}
          className={cn(
            "absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity",
            drawer ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "glass-strong absolute inset-y-0 left-0 w-[80%] max-w-[300px] transition-transform duration-300",
            drawer ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            aria-label="Close menu"
            onClick={() => setDrawer(false)}
            className="absolute right-3 top-4 text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <SidebarNav active={nav} onSelect={select} onSubmit={openStudio} />
        </div>
      </div>

      <div className="relative z-10 lg:pl-[270px]">
        {/* Top bar */}
        <header className="glass-strong sticky top-0 z-20 border-b">
          <div className="mx-auto max-w-[1600px] px-4 py-3 md:px-8 md:py-4">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <button
                aria-label="Open menu"
                onClick={() => setDrawer(true)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tracks, creators, prompts…"
                  aria-label="Search tracks"
                  className="h-11 w-full rounded-full border border-white/10 bg-black/40 pl-10 pr-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
                />
              </div>
            </div>

            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:-mx-8 md:px-8">
              {GENRES.map((g) => (
                <button
                  key={g}
                  onClick={() => setGenre(g)}
                  className={cn(
                    "shrink-0 rounded-full border px-4 py-1.5 text-xs transition-all",
                    genre === g
                      ? "border-transparent bg-gradient-neon font-semibold text-primary-foreground glow-neon"
                      : "border-white/10 text-muted-foreground hover:border-accent/50 hover:text-accent",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="px-4 pt-4 md:px-8">
          <ProfileBanner />
        </div>

        <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-6 md:px-8 md:pb-[150px]">
          <h1 className="font-display text-2xl font-bold md:text-3xl">
            <span className="text-gradient-neon">Discover</span> what the machines are humming
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {list.length} tracks · every prompt is copyable
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {list.map((t) => (
              <TrackCard
                key={t.id}
                track={t}
                isPlaying={playing && current.id === t.id}
                onPlay={play}
              />
            ))}
          </div>

          {list.length === 0 && (
            <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">
              Nothing matches that yet. Try another genre or search.
            </p>
          )}
        </main>
      </div>

      <PlayerBar
        track={current}
        playing={playing}
        onToggle={() => setPlaying((p) => !p)}
        onNext={() => step(1)}
        onPrev={() => step(-1)}
      />

      {/* Mobile bottom tabs */}
      <nav className="glass-strong fixed inset-x-0 bottom-[124px] z-30 border-t sm:hidden">
        <div className="grid grid-cols-4">
          {MOBILE_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => select(t.id as NavId)}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[10px]",
                nav === t.id ? "text-primary" : "text-muted-foreground",
              )}
            >
              <t.icon className={cn("h-5 w-5", nav === t.id && "drop-shadow-[0_0_8px_var(--neon)]")} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <StudioModal open={studio} onClose={() => setStudio(false)} />
    </div>
  );
}
