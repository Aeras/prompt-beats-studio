import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { AppShell } from "@/components/promptbeats/AppShell";
import { TrackCard } from "@/components/promptbeats/TrackCard";
import { TrackGridModeToggle, trackGridClassName, useTrackGridMode } from "@/components/promptbeats/TrackGridView";
import { StaffBadge } from "@/components/promptbeats/StaffBadge";
import { ProfileBanner } from "@/components/promptbeats/ProfileBanner";
import { GENRES, type Track } from "@/lib/tracks";
import { usePlayer } from "@/lib/player";
import { listPublishedTracks } from "@/lib/tracks.functions";
import { searchPublicCreators, type PublicCreatorSearchResult } from "@/lib/profile.functions";
import artFallback from "@/assets/art-3.jpg";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { localizedGenreLabel } from "@/i18n/ui-catalog";
import { getUserAvatarUrl } from "@/lib/user-avatar";

function formatDuration(seconds: number | null) {
  if (!seconds) return "--:--";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PromptBeats — AI Music Prompts, Tracks & Studio" },
      { name: "description", content: "Discover AI-generated tracks, copy the exact prompts behind them, and craft your own lyrics in the PromptBeats studio." },
      { property: "og:title", content: "PromptBeats — AI Music Prompts, Tracks & Studio" },
      { property: "og:description", content: "Share AI music, copy prompts, and build your next track in a neon studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { t } = useI18n();
  const [genre, setGenre] = useState("All");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"tracks" | "creators" | "prompts">("tracks");
  const { current, playing, play } = usePlayer();
  const { mode: gridMode, setMode: setGridMode } = useTrackGridMode();

  const { data } = useQuery({ queryKey: ["tracks", "published"], queryFn: () => listPublishedTracks() });
  const { data: creatorData, isLoading: creatorsLoading, error: creatorsError } = useQuery({
    queryKey: ["public-creators", query],
    queryFn: () => searchPublicCreators({ data: { query } }),
    enabled: category === "creators" && query.trim().length > 0,
  });

  const creatorNames = new Map((data?.tracks ?? []).map((track: any) => [track.id, track.creator_name ?? ""]));
  const uploaded: Track[] = (data?.tracks ?? []).map((track: any) => ({
    id: track.id,
    userId: track.user_id,
    title: track.title,
    handle: track.handle,
    genre: track.genre,
    art: track.cover_url ?? track.art_url ?? artFallback,
    duration: formatDuration(track.duration_seconds),
    plays: String(track.plays),
    prompt: track.prompt,
    lyrics: track.lyrics,
    audioUrl: track.audio_url,
    audioType: (track.audio_type === "link" ? "link" : "upload") as "link" | "upload",
    sourceType: track.source_type as Track["sourceType"],
    sourceId: track.source_id,
    createdWith: track.created_with,
    allowDownload: track.allow_download === true,
    durationSeconds: track.duration_seconds,
    staffBadge: track.staff_badge,
  }));

  const list = uploaded.filter(
    (track) =>
      (genre === "All" || track.genre === genre) &&
      (category === "creators" ||
        (category === "prompts" ? track.prompt : track.title + track.handle + (creatorNames.get(track.id) ?? "") + track.prompt)
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const onPlay = (track: Track) => play(track, list);
  const categoryLabel = (item: "tracks" | "creators" | "prompts") => item === "tracks" ? t("discover.category.tracks") : item === "creators" ? t("discover.category.creators") : t("discover.category.prompts");

  const header = (
    <div className="min-w-0">
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("discover.searchPlaceholder")} aria-label={t("discover.searchAria")} className="h-11 w-full rounded-full border border-white/10 bg-black/40 pl-10 pr-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]" />
      </div>
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:-mx-8 md:px-8">
        {(["tracks", "creators", "prompts"] as const).map((item) => <button key={item} onClick={() => setCategory(item)} className={cn("shrink-0 rounded-full border px-4 py-1.5 text-xs transition-all", category === item ? "border-transparent bg-gradient-neon font-semibold text-primary-foreground glow-neon" : "border-white/10 text-muted-foreground hover:border-accent/50 hover:text-accent")}>{categoryLabel(item)}</button>)}
      </div>
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:-mx-8 md:px-8">
        {GENRES.map((item) => <button key={item} onClick={() => setGenre(item)} className={cn("shrink-0 rounded-full border px-4 py-1.5 text-xs transition-all", genre === item ? "border-transparent bg-gradient-neon font-semibold text-primary-foreground glow-neon" : "border-white/10 text-muted-foreground hover:border-accent/50 hover:text-accent")}>{localizedGenreLabel(item, t)}</button>)}
      </div>
    </div>
  );

  return (
    <AppShell header={header}>
      <div className="px-4 pt-4 md:px-8"><ProfileBanner /></div>
      <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-6 md:px-8 md:pb-[150px]">
        <div className="flex items-start justify-between gap-3">
          <div><h1 className="font-display text-2xl font-bold md:text-3xl"><span className="text-gradient-neon">{t("discover.titleLead")}</span>{" "}{t("discover.titleTail")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("discover.trackCount", { count: uploaded.length })}</p></div>
          {category !== "creators" && <TrackGridModeToggle mode={gridMode} onChange={setGridMode} />}
        </div>
        <div className={`mt-5 ${category === "creators" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : trackGridClassName(gridMode)}`}>
          {category === "creators" ? (creatorData?.creators ?? []).map((creator) => <CreatorCard key={creator.id} creator={creator} />) : list.map((track) => <TrackCard key={track.id} track={track} isPlaying={playing && current?.id === track.id} onPlay={onPlay} viewMode={gridMode} />)}
        </div>
        {category === "creators" ? (
          creatorsLoading ? <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">{t("discover.searchingCreators")}</p>
          : creatorsError ? <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-red-300">{t("discover.creatorSearchError")}</p>
          : query.trim() && (creatorData?.creators.length ?? 0) === 0 ? <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">{t("discover.noCreatorMatches")}</p>
          : !query.trim() ? <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">{t("discover.creatorSearchHint")}</p> : null
        ) : uploaded.length === 0 ? <div className="glass mt-6 rounded-2xl p-8 text-center"><p className="text-sm font-medium text-foreground">{t("discover.noTracks")}</p><p className="mt-1 text-xs text-muted-foreground">{t("discover.noTracksHint")}</p></div>
        : list.length === 0 ? <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">{t("discover.noFilterMatches")}</p> : null}
      </main>
    </AppShell>
  );
}

function CreatorCard({ creator }: { creator: PublicCreatorSearchResult }) {
  const { t } = useI18n();
  const name = creator.display_name || creator.artist_alias || creator.handle || t("discover.creatorFallback");
  return (
    <Link to="/$handle" params={{ handle: `@${creator.handle}` }} className="glass flex items-center gap-3 rounded-2xl p-4 transition-colors hover:border-primary/40">
      <img src={getUserAvatarUrl(creator.avatar_url)} alt={`${name} avatar`} width={56} height={56} className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-primary/40" />
      <div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2"><p className="truncate font-display text-sm font-semibold">{name}</p><StaffBadge badge={creator.staff_badge} /></div><p className="truncate text-xs text-muted-foreground">@{creator.handle}</p></div>
    </Link>
  );
}
