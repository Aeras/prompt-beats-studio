import { Play, Pause, SkipBack, SkipForward, Volume2, PictureInPicture2, Shuffle, Repeat } from "lucide-react";
import { Visualizer } from "./Visualizer";
import { usePlayer } from "@/lib/player";
import { usePipPlayer } from "@/hooks/usePipPlayer";


function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Persistent global player: mounted once at app level, keeps playing across pages. */
export function PlayerBar() {
  const { current, playing, position, duration, volume, toggle, next, prev, seek, setVolume, audioElement } = usePlayer();
  const { canvasRef, videoRef, pipActive, supported: pipSupported, togglePip } = usePipPlayer({
    art: current?.art,
    title: current?.title,
    subtitle: current?.handle,
    playing,
    toggle,
    audioElement,
  });

  if (!current) return null;

  const total = duration || 0;
  const pct = total ? (position / total) * 100 : 0;

  return (
    <div className="glass-strong fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] md:bottom-0">
      <div className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] md:gap-6 md:px-6 md:py-3">
        {/* Now playing */}
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={current.art}
            alt={`${current.title} cover art`}
            width={640}
            height={640}
            loading="lazy"
            className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-white/15 md:h-14 md:w-14"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{current.title}</p>
            <p className="truncate text-xs text-muted-foreground">{current.handle}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="order-3 col-span-2 flex flex-col gap-1.5 md:order-none md:col-span-1">
          <div className="flex items-center justify-center gap-4 md:gap-5">
            <button aria-label="Shuffle" className="hidden text-muted-foreground hover:text-accent sm:block">
              <Shuffle className="h-4 w-4" />
            </button>
            <button aria-label="Previous track" onClick={prev} className="text-muted-foreground hover:text-foreground">
              <SkipBack className="h-5 w-5" />
            </button>
            <button
              aria-label={playing ? "Pause" : "Play"}
              onClick={toggle}
              className="grid h-10 w-10 place-items-center rounded-full bg-gradient-neon glow-neon transition-transform hover:scale-105 active:scale-95"
            >
              {playing ? (
                <Pause className="h-5 w-5 text-primary-foreground" />
              ) : (
                <Play className="ml-0.5 h-5 w-5 text-primary-foreground" />
              )}
            </button>
            <button aria-label="Next track" onClick={next} className="text-muted-foreground hover:text-foreground">
              <SkipForward className="h-5 w-5" />
            </button>
            <button aria-label="Repeat" className="hidden text-muted-foreground hover:text-accent sm:block">
              <Repeat className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-9 text-right text-[10px] tabular-nums text-muted-foreground">{fmt(position)}</span>
            <div className="relative h-1.5 flex-1 rounded-full bg-white/10">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-neon"
                style={{ width: `${pct}%` }}
              />
              <span
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_var(--neon)]"
                style={{ left: `calc(${pct}% - 6px)` }}
              />
              <input
                type="range"
                min={0}
                max={Math.max(total, 1)}
                value={position}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label="Seek"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
            <span className="w-9 text-[10px] tabular-nums text-muted-foreground">{fmt(total)}</span>
          </div>
        </div>

        {/* Right rack */}
        <div className="flex items-center justify-end gap-3">
          <div className="hidden lg:block">
            <Visualizer active={playing} />
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="relative h-1.5 w-24 rounded-full bg-white/10">
              <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${volume * 100}%` }} />
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(volume * 100)}
                onChange={(e) => setVolume(Number(e.target.value) / 100)}
                aria-label="Volume"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
          </div>
          <button
            aria-label="Toggle picture in picture"
            onClick={() => void togglePip()}
            disabled={!pipSupported}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition-colors ${
              pipActive ? "border-accent/60 bg-accent/15 text-accent glow-electric" : "border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            <PictureInPicture2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Hidden canvas + video: powers the picture-in-picture window. */}
      <canvas ref={canvasRef} width={640} height={360} className="pointer-events-none absolute h-px w-px opacity-0" aria-hidden />
      <video
        ref={videoRef}
        muted
        playsInline
        className="pointer-events-none absolute h-px w-px opacity-0"
        aria-hidden
      />
    </div>
  );
}
