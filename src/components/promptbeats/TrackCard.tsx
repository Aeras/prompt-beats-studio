import { useEffect, useState } from "react";
import { Play, Pause, Copy, Check, ChevronDown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { Track } from "@/lib/tracks";
import { LikeButton } from "@/components/promptbeats/LikeButton";
import { TrackOwnerActions } from "@/components/promptbeats/TrackOwnerActions";
import { StaffBadge } from "@/components/promptbeats/StaffBadge";
import { ExternalTrackEmbed } from "@/components/promptbeats/ExternalTrackEmbed";
import { canUseNativeTrackPlayer, getTrackEmbedUrl } from "@/lib/track-sources";
import type { TrackGridMode } from "@/components/promptbeats/TrackGridView";

export function TrackCard({
  track,
  isPlaying,
  onPlay,
  viewMode = "standard",
}: {
  track: Track;
  isPlaying: boolean;
  onPlay: (t: Track) => void;
  viewMode?: TrackGridMode;
}) {
  const [open, setOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playCount, setPlayCount] = useState(() => Number.parseInt(track.plays, 10) || 0);
  const embedUrl = getTrackEmbedUrl(track.sourceType, track.sourceId);
  const canUseNativePlayer = canUseNativeTrackPlayer(track.sourceType);
  const compact = viewMode === "compact";

  useEffect(() => {
    const onPlayCounted = (event: Event) => {
      const detail = (event as CustomEvent<{ trackId?: string; plays?: number }>).detail;
      if (detail?.trackId === track.id && typeof detail.plays === "number") setPlayCount(detail.plays);
    };
    window.addEventListener("promptbeats:track-play-counted", onPlayCounted);
    return () => window.removeEventListener("promptbeats:track-play-counted", onPlayCounted);
  }, [track.id]);

  const togglePrompt = () => {
    setPromptOpen((v) => {
      const next = !v;
      if (next) setOpen(false);
      return next;
    });
  };

  const toggleLyrics = () => {
    setOpen((v) => {
      const next = !v;
      if (next) setPromptOpen(false);
      return next;
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(track.prompt);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <article className={cn("glass group overflow-hidden rounded-2xl transition-all hover:border-white/20 hover:shadow-[0_10px_40px_-12px_color-mix(in_oklab,var(--neon)_45%,transparent)]", compact && "rounded-xl")}>
      <div className="relative aspect-square overflow-hidden">
        <Link to="/track/$id" params={{ id: track.id }} aria-label={`Open ${track.title}`} className="block h-full cursor-pointer">
          <img src={track.art} alt={`${track.title} cover art`} width={640} height={640} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        </Link>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        {embedUrl && !compact && <ExternalTrackEmbed sourceType={track.sourceType} sourceId={track.sourceId} title={`${track.title} player`} />}
        <span className={cn("glass absolute rounded-full uppercase tracking-widest text-accent", compact ? "left-2 top-2 px-1.5 py-0.5 text-[8px]" : "left-3 top-3 px-2.5 py-1 text-[10px]")}>
          {track.genre}
        </span>
        {compact && embedUrl && <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white/90">{track.sourceType}</span>}
        {!embedUrl && canUseNativePlayer && <button onClick={() => onPlay(track)} aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`} className={cn("absolute grid place-items-center rounded-full bg-gradient-neon glow-neon transition-transform hover:scale-110 active:scale-95", compact ? "bottom-2 right-2 h-9 w-9" : "bottom-3 right-3 h-12 w-12")}>
          {isPlaying ? <Pause className={cn("text-primary-foreground", compact ? "h-4 w-4" : "h-5 w-5")} /> : <Play className={cn("ml-0.5 text-primary-foreground", compact ? "h-4 w-4" : "h-5 w-5")} />}
        </button>}
      </div>

      <div className={cn(compact ? "space-y-2 p-2.5" : "space-y-3 p-3")}>
        <div className={cn("flex items-start justify-between", compact ? "gap-1.5" : "gap-3")}>
          <div className="min-w-0">
            <h3 className={cn("truncate font-semibold", compact ? "text-sm" : "text-base")}>
              <Link to="/track/$id" params={{ id: track.id }} className="relative z-10 inline-block cursor-pointer transition-colors hover:text-accent">
                {track.title}
              </Link>
            </h3>
            <p className={cn("truncate text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>
              {track.userId ? (
                <Link
                  to="/$handle"
                  params={{ handle: track.handle }}
                  className="transition-colors hover:text-accent"
                  onClick={(e) => e.stopPropagation()}
                >
                  {track.handle}
                </Link>
              ) : (
                <span>{track.handle}</span>
              )}
              {track.staffBadge && <><span className="mx-1.5">·</span><StaffBadge badge={track.staffBadge} /></>}{" · "}{track.plays} plays
            </p>
          </div>
          <div className={cn("flex shrink-0 items-center", compact ? "gap-1" : "gap-2")}>
            <LikeButton trackId={track.id} enabled={Boolean(track.userId)} />
            {track.userId && (
              <TrackOwnerActions
                compact
                track={{
                  id: track.id,
                  user_id: track.userId,
                  title: track.title,
                  genre: track.genre,
                  prompt: track.prompt,
                  lyrics: track.lyrics,
                  audio_url: track.audioUrl ?? "",
                  audio_type: track.audioType ?? "upload",
                  source_type: track.sourceType,
                  source_url: track.sourceType === "upload" ? null : track.audioUrl ?? null,
                  is_published: track.isPublished ?? true,
                }}
              />
            )}
          </div>
        </div>


        <div className={cn("flex flex-wrap", compact ? "gap-1" : "gap-2")}>
          <button
            onClick={togglePrompt}
            className={cn("flex items-center rounded-full border border-accent/40 bg-accent/10 text-accent transition-colors hover:bg-accent/20", compact ? "gap-1 px-2 py-1 text-[10px]" : "gap-1.5 px-3 py-1.5 text-xs")}
          >
            {promptOpen ? "Hide prompt" : "Show prompt"}
            <ChevronDown className={cn(compact ? "h-3 w-3 transition-transform" : "h-3.5 w-3.5 transition-transform", promptOpen && "rotate-180")} />
          </button>
          {track.lyrics?.trim() && (
            <button
              onClick={toggleLyrics}
              className={cn("flex items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:text-foreground", compact ? "gap-1 px-2 py-1 text-[10px]" : "gap-1.5 px-3 py-1.5 text-xs")}
            >
              {open ? "Hide lyrics" : "Show lyrics"}
              <ChevronDown className={cn(compact ? "h-3 w-3 transition-transform" : "h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
            </button>
          )}
        </div>

        <div
          className={cn(
            "grid transition-all duration-300",
            promptOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="rounded-xl bg-black/40 p-3">
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted-foreground">
                {track.prompt?.trim() || "No prompt provided for this track."}
              </pre>
              {track.prompt?.trim() && (
                <button
                  onClick={copy}
                  className="mt-2 flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/20"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          className={cn(
            "grid transition-all duration-300",
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <pre className="whitespace-pre-wrap rounded-xl bg-black/40 p-3 font-sans text-xs leading-relaxed text-muted-foreground">
              {track.lyrics}
            </pre>
          </div>
        </div>

      </div>
    </article>
  );
}
