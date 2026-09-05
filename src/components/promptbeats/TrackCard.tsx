import { useState } from "react";
import { Play, Pause, Copy, Check, ChevronDown, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Track } from "@/lib/tracks";

export function TrackCard({
  track,
  isPlaying,
  onPlay,
}: {
  track: Track;
  isPlaying: boolean;
  onPlay: (t: Track) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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
    <article className="glass group overflow-hidden rounded-2xl transition-all hover:border-white/20 hover:shadow-[0_10px_40px_-12px_color-mix(in_oklab,var(--neon)_45%,transparent)]">
      <div className="relative aspect-square overflow-hidden">
        <img
          src={track.art}
          alt={`${track.title} cover art`}
          width={640}
          height={640}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <span className="glass absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-widest text-accent">
          {track.genre}
        </span>
        <button
          onClick={() => onPlay(track)}
          aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
          className="absolute bottom-3 right-3 grid h-12 w-12 place-items-center rounded-full bg-gradient-neon glow-neon transition-transform hover:scale-110 active:scale-95"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 text-primary-foreground" />
          ) : (
            <Play className="ml-0.5 h-5 w-5 text-primary-foreground" />
          )}
        </button>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{track.title}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {track.handle} · {track.plays} plays
            </p>
          </div>
          <button aria-label="Like track" className="shrink-0 text-muted-foreground hover:text-primary">
            <Heart className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={copy}
            className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/20"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy prompt"}
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Lyrics
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </button>
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
