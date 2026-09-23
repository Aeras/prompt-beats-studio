import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

export const TRACK_GRID_MODE_STORAGE_KEY = "promptbeats:track-grid-mode";
const TRACK_GRID_MODE_EVENT = "promptbeats:track-grid-mode";

export type TrackGridMode = "standard" | "compact";

function isTrackGridMode(value: string | null): value is TrackGridMode {
  return value === "standard" || value === "compact";
}

function readStoredTrackGridMode(): TrackGridMode {
  try {
    const stored = window.localStorage.getItem(TRACK_GRID_MODE_STORAGE_KEY);
    return isTrackGridMode(stored) ? stored : "standard";
  } catch {
    return "standard";
  }
}

function persistTrackGridMode(mode: TrackGridMode) {
  try {
    window.localStorage.setItem(TRACK_GRID_MODE_STORAGE_KEY, mode);
  } catch {
    /* in-memory preference remains usable */
  }
}

export function useTrackGridMode() {
  const [mode, setMode] = useState<TrackGridMode>("standard");
  useEffect(() => {
    setMode(readStoredTrackGridMode());
    const sync = (event: Event) => {
      const next = (event as CustomEvent<TrackGridMode>).detail;
      if (isTrackGridMode(next)) setMode(next);
    };
    window.addEventListener(TRACK_GRID_MODE_EVENT, sync);
    return () => window.removeEventListener(TRACK_GRID_MODE_EVENT, sync);
  }, []);
  const setGridMode = useCallback((next: TrackGridMode) => {
    persistTrackGridMode(next);
    setMode(next);
    window.dispatchEvent(new CustomEvent<TrackGridMode>(TRACK_GRID_MODE_EVENT, { detail: next }));
  }, []);
  return { mode, setMode: setGridMode };
}

export function TrackGridModeToggle({
  mode,
  onChange,
  className,
}: {
  mode: TrackGridMode;
  onChange: (mode: TrackGridMode) => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn("inline-flex rounded-full border border-white/10 bg-black/20 p-1", className)}
      role="group"
      aria-label={`${t("grid.standard")} / ${t("grid.compact")}`}
    >
      <button
        type="button"
        title={t("grid.standard")}
        aria-label={t("grid.standard")}
        aria-pressed={mode === "standard"}
        onClick={() => onChange("standard")}
        className={cn(
          "grid h-7 w-7 place-items-center rounded-full transition-colors",
          mode === "standard"
            ? "bg-accent/20 text-accent"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="grid grid-cols-2 gap-0.5" aria-hidden="true">
          <i className="h-1.5 w-1.5 rounded-[1px] bg-current" />
          <i className="h-1.5 w-1.5 rounded-[1px] bg-current" />
          <i className="h-1.5 w-1.5 rounded-[1px] bg-current" />
          <i className="h-1.5 w-1.5 rounded-[1px] bg-current" />
        </span>
      </button>
      <button
        type="button"
        title={t("grid.compact")}
        aria-label={t("grid.compact")}
        aria-pressed={mode === "compact"}
        onClick={() => onChange("compact")}
        className={cn(
          "grid h-7 w-7 place-items-center rounded-full transition-colors",
          mode === "compact"
            ? "bg-accent/20 text-accent"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="grid grid-cols-3 gap-0.5" aria-hidden="true">
          {Array.from({ length: 9 }, (_, index) => (
            <i key={index} className="h-1 w-1 rounded-[1px] bg-current" />
          ))}
        </span>
      </button>
    </div>
  );
}

export function trackGridClassName(mode: TrackGridMode) {
  return mode === "compact"
    ? "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7"
    : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";
}
