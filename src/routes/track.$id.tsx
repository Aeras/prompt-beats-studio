import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Play, Pause, Share2 } from "lucide-react";
import { usePlayer } from "@/lib/player";

import { getPublicTrackById } from "@/lib/tracks.functions";
import { LikeButton } from "@/components/promptbeats/LikeButton";
import { TrackOwnerActions } from "@/components/promptbeats/TrackOwnerActions";
import { StaffBadge } from "@/components/promptbeats/StaffBadge";
import { TrackModerationControls } from "@/components/promptbeats/TrackModerationControls";

export const Route = createFileRoute("/track/$id")({
  head: () => ({
    meta: [
      { title: "Track — PromptBeats" },
      { name: "description", content: "Listen to this AI-generated track and copy the exact prompt behind it." },
      { property: "og:title", content: "Track on PromptBeats" },
      { property: "og:description", content: "Listen and copy the prompt recipe behind this AI track." },
      { property: "og:type", content: "music.song" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrackPage,
});

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return { copied, copy };
}

function TrackPage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["public-track", id],
    queryFn: () => getPublicTrackById({ data: { id } }),
  });

  const { play, current, playing } = usePlayer();
  const prompt = useCopy();
  const share = useCopy();

  const track = data?.track ?? null;
  const artist = data?.artist ?? null;
  const artistName = artist?.artist_alias || artist?.display_name || artist?.handle || "Unknown artist";

  return (
    <div className="aurora min-h-screen bg-[#0a0a0c] px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Link to="/" className="text-xs text-muted-foreground hover:text-accent">
          ← Back to the feed
        </Link>

        <TrackModerationControls trackId={id} />

        {isLoading && <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading…</p>}

        {!isLoading && !track && (
          <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
            This track is not available.
          </p>
        )}

        {track && (
          <>
            <header className="glass-strong space-y-3 rounded-3xl p-6">
              <span className="text-[10px] uppercase tracking-widest text-accent">{track.genre}</span>
              <h1 className="font-display text-3xl font-bold">{track.title}</h1>
              <p className="text-sm text-muted-foreground">
                by{" "}
                {artist ? (
                  <Link to="/artist/$id" params={{ id: artist.id }} className="text-accent hover:underline">
                    {artistName}
                  </Link>
                ) : (
                  artistName
                )}
              </p>
              <StaffBadge badge={artist?.staff_badge} />

              <div className="pt-2">
                <button
                  onClick={() =>
                    play(
                      {
                        id: track.id,
                        userId: track.user_id,
                        title: track.title,
                        handle: artist ? `@${artist.handle}` : "",
                        genre: track.genre,
                        art: track.cover_url ?? artist?.avatar_url ?? `https://i.pravatar.cc/120?u=${track.id}`,
                        duration: "--:--",
                        plays: String(track.plays ?? 0),
                        prompt: track.prompt ?? "",
                        lyrics: track.lyrics ?? "",
                        audioUrl: track.audio_url,
                        audioType: "upload",
                      },
                      [],
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/20"
                >
                  {current?.id === track.id && playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {current?.id === track.id && playing ? "Pause" : "Play track"}
                </button>
              </div>

              <button
                onClick={() => share.copy(typeof window !== "undefined" ? window.location.href : "")}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.02] active:scale-95"
              >
                {share.copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                {share.copied ? "Link copied" : "Share Track"}
              </button>

              <div className="flex items-center gap-3 pt-1">
                <LikeButton trackId={track.id} />
                <TrackOwnerActions
                  track={{
                    id: track.id,
                    user_id: track.user_id,
                    title: track.title,
                    genre: track.genre,
                    prompt: track.prompt ?? "",
                    lyrics: track.lyrics ?? "",
                    audio_url: track.audio_url,
                    audio_type: track.audio_type,
                  }}
                />
              </div>
            </header>

            {track.prompt && (
              <section className="glass space-y-3 rounded-2xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-semibold">The Recipe</h2>
                  <button
                    onClick={() => prompt.copy(track.prompt)}
                    className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/20"
                  >
                    {prompt.copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {prompt.copied ? "Copied" : "Copy Prompt"}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap rounded-xl bg-black/40 p-4 font-sans text-sm leading-relaxed text-muted-foreground">
                  {track.prompt}
                </pre>
              </section>
            )}

            {track.lyrics && (
              <section className="glass space-y-3 rounded-2xl p-5">
                <h2 className="font-display text-lg font-semibold">Lyrics</h2>
                <pre className="whitespace-pre-wrap rounded-xl bg-black/40 p-4 font-sans text-sm leading-relaxed text-muted-foreground">
                  {track.lyrics}
                </pre>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
