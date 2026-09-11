import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { AppShell } from "@/components/promptbeats/AppShell";
import { TrackCard } from "@/components/promptbeats/TrackCard";
import type { Track } from "@/lib/tracks";
import { usePlayer } from "@/lib/player";
import { listTrendingTracks } from "@/lib/tracks.functions";
import artFallback from "@/assets/art-3.jpg";

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
  const { current, playing, play } = usePlayer();
  const { data, isLoading } = useQuery({
    queryKey: ["tracks", "trending"],
    queryFn: () => listTrendingTracks(),
  });

  const list: Track[] = (data?.tracks ?? []).map((t) => ({
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
    staffBadge: t.staff_badge,
  }));

  return (
    <AppShell
      header={
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-accent" />
          <span className="font-display text-lg font-bold">Trending</span>
        </div>
      }
    >
      <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-6 md:px-8 md:pb-[150px]">
        <h1 className="font-display text-2xl font-bold md:text-3xl">
          <span className="text-gradient-neon">Trending</span> right now
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Ranked by likes and total plays.</p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((t) => (
            <TrackCard
              key={t.id}
              track={t}
              isPlaying={playing && current?.id === t.id}
              onPlay={(track) => play(track, list)}
            />
          ))}
        </div>

        {!isLoading && list.length === 0 && (
          <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">
            No tracks yet — upload one and it could top this chart.
          </p>
        )}
      </main>
    </AppShell>
  );
}
