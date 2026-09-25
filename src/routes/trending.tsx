import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { AppShell } from "@/components/promptbeats/AppShell";
import { TrackCard } from "@/components/promptbeats/TrackCard";
import {
  TrackGridModeToggle,
  trackGridClassName,
  useTrackGridMode,
} from "@/components/promptbeats/TrackGridView";
import type { Track } from "@/lib/tracks";
import { usePlayer } from "@/lib/player";
import { listTrendingTracks } from "@/lib/tracks.functions";
import artFallback from "@/assets/art-3.jpg";
import { useI18n } from "@/i18n";
import {
  TrackSourceFilter,
  filterByTrackSource,
  useTrackSourcePreference,
  type TrackSourcePreference,
} from "@/components/promptbeats/TrackSourceFilter";

function formatDuration(seconds: number | null) {
  if (!seconds) return "--:--";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export const Route = createFileRoute("/trending")({
  head: () => ({
    meta: [
      { title: "Trending AI Tracks — PromptBeats" },
      {
        name: "description",
        content: "The most liked and most played AI-generated tracks on PromptBeats right now.",
      },
      { property: "og:title", content: "Trending AI Tracks — PromptBeats" },
      {
        property: "og:description",
        content: "See which AI music prompts and tracks the community is loving today.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrendingPage,
});

function TrendingPage() {
  const { t, language } = useI18n();
  const { current, playing, play } = usePlayer();
  const { mode: gridMode, setMode: setGridMode } = useTrackGridMode();
  const { preference: defaultTrackSource } = useTrackSourcePreference();
  const [trackSource, setTrackSource] = useState<TrackSourcePreference>(defaultTrackSource);
  useEffect(() => setTrackSource(defaultTrackSource), [defaultTrackSource]);
  const { data, isLoading } = useQuery({
    queryKey: ["tracks", "trending"],
    queryFn: () => listTrendingTracks(),
  });

  const allTracks: Track[] = (data?.tracks ?? []).map((track) => ({
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
    containsExplicitLyrics: track.contains_explicit_lyrics === true,
    staffBadge: track.staff_badge,
  }));
  const list = filterByTrackSource(allTracks, trackSource);

  return (
    <AppShell
      header={
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-accent" />
          <span className="font-display text-lg font-bold">{t("trending.title")}</span>
        </div>
      }
    >
      <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-6 md:px-8 md:pb-[150px]">
        <div className="flex w-full items-center justify-between gap-3">
          <TrackSourceFilter value={trackSource} onChange={setTrackSource} language={language} />
          <TrackGridModeToggle mode={gridMode} onChange={setGridMode} />
        </div>
        <div className={`mt-5 ${trackGridClassName(gridMode)}`}>
          {list.map((track) => (
            <TrackCard
              key={track.id}
              track={track}
              isPlaying={playing && current?.id === track.id}
              onPlay={(item) => play(item, list)}
              viewMode={gridMode}
            />
          ))}
        </div>
        {!isLoading && list.length === 0 && (
          <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">
            {t("trending.empty")}
          </p>
        )}
      </main>
    </AppShell>
  );
}
