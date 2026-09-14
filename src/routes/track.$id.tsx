import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Play, Pause, Share2 } from "lucide-react";

import { usePlayer } from "@/lib/player";
import { getPublicTrackById } from "@/lib/tracks.functions";
import { LikeButton } from "@/components/promptbeats/LikeButton";
import { TrackOwnerActions } from "@/components/promptbeats/TrackOwnerActions";
import { StaffBadge } from "@/components/promptbeats/StaffBadge";
import { TrackModerationControls } from "@/components/promptbeats/TrackModerationControls";
import { ExternalTrackEmbed } from "@/components/promptbeats/ExternalTrackEmbed";
import { getTrackEmbedUrl } from "@/lib/track-sources";
import artFallback from "@/assets/art-3.jpg";

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

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function TrackPage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["public-track", id],
    queryFn: () => getPublicTrackById({ data: { id } }),
  });
  const queryClient = useQueryClient();

  const { play, current, playing } = usePlayer();
  const prompt = useCopy();
  const share = useCopy();

  const track = data?.track ?? null;
  const [playCount, setPlayCount] = useState(() => track?.plays ?? 0);
  const artist = data?.artist ?? null;
  const artistName = artist?.artist_alias || artist?.display_name || artist?.handle || "Unknown artist";
  const duration = track ? formatDuration(track.duration_seconds) : null;
  const createdDate = track ? formatDate(track.created_at) : null;
  const embedUrl = getTrackEmbedUrl(track?.source_type, track?.source_id);
  const artwork = embedUrl
    ? artFallback
    : track?.cover_url ?? artist?.avatar_url ?? (track ? `https://i.pravatar.cc/640?u=${track.id}` : artFallback);

  useEffect(() => {
    if (track) setPlayCount(track.plays ?? 0);
  }, [track?.id, track?.plays]);

  useEffect(() => {
    const onPlayCounted = (event: Event) => {
      const detail = (event as CustomEvent<{ trackId?: string; plays?: number }>).detail;
      if (detail?.trackId !== id || typeof detail.plays !== "number") return;
      setPlayCount(detail.plays);
      void queryClient.invalidateQueries({ queryKey: ["public-track", id] });
      void queryClient.invalidateQueries({ queryKey: ["tracks"] });
      void queryClient.invalidateQueries({ queryKey: ["public-profile"] });
    };
    window.addEventListener("promptbeats:track-play-counted", onPlayCounted);
    return () => window.removeEventListener("promptbeats:track-play-counted", onPlayCounted);
  }, [id, queryClient]);

  const playTrack = () => {
    if (!track || !artwork || embedUrl) return;
    play({
      id: track.id,
      userId: track.user_id,
      title: track.title,
      handle: artist ? `@${artist.handle}` : "",
      genre: track.genre,
      art: artwork,
      duration: duration ?? "--:--",
      plays: String(track.plays ?? 0),
      prompt: track.prompt ?? "",
      lyrics: track.lyrics ?? "",
      audioUrl: track.audio_url,
      audioType: track.audio_type === "link" ? "link" : "upload",
    }, []);
  };

  return (
    <div className="aurora min-h-screen bg-[#0a0a0c] px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <Link to="/" className="inline-flex text-xs text-muted-foreground transition-colors hover:text-accent">
          ← Back to the feed
        </Link>

        {isLoading && <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading…</p>}

        {!isLoading && !track && (
          <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
            This track is not available.
          </p>
        )}

        <TrackModerationControls trackId={id} />

        {track && (
          <>
            <section className="glass-strong overflow-hidden rounded-3xl">
              <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:p-8">
                <div className="mx-auto w-full max-w-md lg:max-w-none">
                  <div className="aspect-square overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-2xl shadow-black/30">
                    <img src={artwork} alt={`${track.title} cover art`} className="h-full w-full object-cover" />
                    {embedUrl && <ExternalTrackEmbed sourceType={track.source_type} sourceId={track.source_id} title={`${track.title} player`} />}
                  </div>
                </div>

                <div className="min-w-0 space-y-5">
                  <div className="space-y-3">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-accent">{track.genre}</span>
                    <h1 className="break-words font-display text-3xl font-bold leading-tight sm:text-4xl">{track.title}</h1>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>by</span>
                      {artist ? (
                        <Link to="/artist/$id" params={{ id: artist.id }} className="text-accent transition-colors hover:text-foreground hover:underline">
                          {artistName}
                        </Link>
                      ) : <span>{artistName}</span>}
                      {artist?.staff_badge && <StaffBadge badge={artist.staff_badge} />}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    {duration && <span>{duration}</span>}
                    <span>{playCount} plays</span>
                    {createdDate && <span>Published {createdDate}</span>}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {!embedUrl && <button onClick={playTrack} className="inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.02] active:scale-95">
                      {current?.id === track.id && playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {current?.id === track.id && playing ? "Pause" : "Play track"}
                    </button>}
                    <button onClick={() => share.copy(typeof window !== "undefined" ? window.location.href : "")} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent">
                      {share.copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                      {share.copied ? "Link copied" : "Share track"}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                    <LikeButton trackId={track.id} />
                    <TrackOwnerActions track={{ id: track.id, user_id: track.user_id, title: track.title, genre: track.genre, prompt: track.prompt ?? "", lyrics: track.lyrics ?? "", audio_url: track.audio_url, audio_type: track.audio_type, source_type: track.source_type, source_url: track.source_url }} />
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              {track.prompt && <section className="glass space-y-3 rounded-2xl p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-[10px] uppercase tracking-[0.2em] text-accent">The recipe</p><h2 className="mt-1 font-display text-xl font-semibold">Prompt</h2></div>
                  <button onClick={() => prompt.copy(track.prompt)} className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/20">
                    {prompt.copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{prompt.copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 font-sans text-sm leading-relaxed text-muted-foreground">{track.prompt}</pre>
              </section>}

              {track.lyrics && <section className="glass space-y-3 rounded-2xl p-5 sm:p-6">
                <div><p className="text-[10px] uppercase tracking-[0.2em] text-accent">Written for this track</p><h2 className="mt-1 font-display text-xl font-semibold">Lyrics</h2></div>
                <pre className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 font-sans text-sm leading-relaxed text-muted-foreground">{track.lyrics}</pre>
              </section>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
