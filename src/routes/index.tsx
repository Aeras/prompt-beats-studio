import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { AppShell } from "@/components/promptbeats/AppShell";
import { TrackCard } from "@/components/promptbeats/TrackCard";
import { StaffBadge } from "@/components/promptbeats/StaffBadge";
import { ProfileBanner } from "@/components/promptbeats/ProfileBanner";
import { GENRES, type Track } from "@/lib/tracks";
import { usePlayer } from "@/lib/player";
import { listPublishedTracks } from "@/lib/tracks.functions";
import { searchPublicCreators, type PublicCreatorSearchResult } from "@/lib/profile.functions";
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

function Index() {
  const [genre, setGenre] = useState("All");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"tracks" | "creators" | "prompts">("tracks");
  const { current, playing, play } = usePlayer();

  const { data } = useQuery({
    queryKey: ["tracks", "published"],
    queryFn: () => listPublishedTracks(),
  });

  const { data: creatorData, isLoading: creatorsLoading, error: creatorsError } = useQuery({
    queryKey: ["public-creators", query],
    queryFn: () => searchPublicCreators({ data: { query } }),
    enabled: category === "creators" && query.trim().length > 0,
  });

  const creatorNames = new Map((data?.tracks ?? []).map((t) => [t.id, t.creator_name ?? ""]));

  const uploaded: Track[] = (data?.tracks ?? []).map((t) => ({
    id: t.id,
    userId: t.user_id,
    title: t.title,
    handle: t.handle,
    genre: t.genre,
    art: t.cover_url ?? t.art_url ?? artFallback,
    duration: formatDuration(t.duration_seconds),
    plays: String(t.plays),
    prompt: t.prompt,
    lyrics: t.lyrics,
    audioUrl: t.audio_url,
    audioType: (t.audio_type === "link" ? "link" : "upload") as "link" | "upload",
    sourceType: t.source_type as Track["sourceType"],
    sourceId: t.source_id,
    staffBadge: t.staff_badge,
  }));

  const list = uploaded.filter(
    (t) =>
      (genre === "All" || t.genre === genre) &&
      (category === "creators" || (category === "prompts" ? t.prompt : t.title + t.handle + (creatorNames.get(t.id) ?? "") + t.prompt)
        .toLowerCase()
        .includes(query.toLowerCase())),
  );

  const onPlay = (t: Track) => play(t, list);

  const header = (
    <div className="min-w-0">
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

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:-mx-8 md:px-8">
        {(["tracks", "creators", "prompts"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setCategory(item)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-1.5 text-xs capitalize transition-all",
              category === item
                ? "border-transparent bg-gradient-neon font-semibold text-primary-foreground glow-neon"
                : "border-white/10 text-muted-foreground hover:border-accent/50 hover:text-accent",
            )}
          >
            {item}
          </button>
        ))}
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
  );

  return (
    <AppShell header={header}>
      <div className="px-4 pt-4 md:px-8">
        <ProfileBanner />
      </div>

      <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-6 md:px-8 md:pb-[150px]">
        <h1 className="font-display text-2xl font-bold md:text-3xl">
          <span className="text-gradient-neon">Discover</span> what the machines are humming
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {uploaded.length} tracks · every prompt is copyable
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {category === "creators" ? (creatorData?.creators ?? []).map((creator) => (
            <CreatorCard key={creator.id} creator={creator} />
          )) : list.map((t) => (
            <TrackCard
              key={t.id}
              track={t}
              isPlaying={playing && current?.id === t.id}
              onPlay={onPlay}
            />
          ))}
        </div>

        {category === "creators" ? (
          creatorsLoading ? <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">Searching creators…</p> : creatorsError ? <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-red-300">Could not search creators.</p> : query.trim() && (creatorData?.creators.length ?? 0) === 0 ? <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">No creators match your search.</p> : !query.trim() ? <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">Search by creator name or handle.</p> : null
        ) : uploaded.length === 0 ? (
          <div className="glass mt-6 rounded-2xl p-8 text-center">
            <p className="text-sm font-medium text-foreground">
              No tracks uploaded yet. Be the first to share your AI music!
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload your MP3s from the Studio tab.
            </p>
          </div>
        ) : list.length === 0 ? (
          <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">
            No tracks match your filters.
          </p>
        ) : null}
      </main>
    </AppShell>
  );
}

function CreatorCard({ creator }: { creator: PublicCreatorSearchResult }) {
  const name = creator.display_name || creator.artist_alias || creator.handle || "Creator";
  return (
    <Link
      to="/$handle"
      params={{ handle: `@${creator.handle}` }}
      className="glass flex items-center gap-3 rounded-2xl p-4 transition-colors hover:border-primary/40"
    >
      <img
        src={creator.avatar_url ?? `https://i.pravatar.cc/96?u=${creator.id}`}
        alt={`${name} avatar`}
        width={56}
        height={56}
        className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-primary/40"
      />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate font-display text-sm font-semibold">{name}</p>
          <StaffBadge badge={creator.staff_badge} />
        </div>
        <p className="truncate text-xs text-muted-foreground">@{creator.handle}</p>
      </div>
    </Link>
  );
}
