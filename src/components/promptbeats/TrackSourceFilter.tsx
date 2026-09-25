import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Track } from "@/lib/tracks";
import { cn } from "@/lib/utils";

export type TrackSourcePreference = "all" | "uploads" | "external";
export type TrackSourceSurface = "feed" | "trending" | "library" | "creator";

type TrackSourceLike = Track & {
  source_type?: string | null | undefined;
  contains_explicit_lyrics?: boolean | null | undefined;
};

const LEGACY_ACCOUNT_KEY = "track_source_preference";
const LEGACY_LOCAL_KEY = "pb:track-source-preference";
const SURFACE_ACCOUNT_KEYS: Record<TrackSourceSurface, string> = {
  feed: "track_source_preference_feed",
  trending: "track_source_preference_trending",
  library: "track_source_preference_library",
  creator: "track_source_preference_creator",
};

const EXPLICIT_ACCOUNT_KEY = "hide_explicit_tracks";
const EXPLICIT_LOCAL_KEY = "pb:hide-explicit-tracks";
const EXPLICIT_EVENT_KEY = "promptbeats:hide-explicit-tracks";

let activeExplicitPreference = false;

function isPreference(value: unknown): value is TrackSourcePreference {
  return value === "all" || value === "uploads" || value === "external";
}

function inferTrackSourceSurface(): TrackSourceSurface {
  if (typeof window === "undefined") return "feed";
  const pathname = window.location.pathname;
  if (pathname.startsWith("/trending")) return "trending";
  if (pathname.startsWith("/library")) return "library";
  if (pathname === "/") return "feed";
  return "creator";
}

function surfaceLocalKey(surface: TrackSourceSurface) {
  return `pb:track-source-preference:${surface}`;
}

function surfaceEventKey(surface: TrackSourceSurface) {
  return `promptbeats:track-source-preference:${surface}`;
}

function readLocalPreference(surface: TrackSourceSurface): TrackSourcePreference {
  if (typeof window === "undefined") return "all";
  try {
    const surfaceValue = window.localStorage.getItem(surfaceLocalKey(surface));
    if (isPreference(surfaceValue)) return surfaceValue;
    const legacyValue = window.localStorage.getItem(LEGACY_LOCAL_KEY);
    return isPreference(legacyValue) ? legacyValue : "all";
  } catch {
    return "all";
  }
}

function writeLocalPreference(surface: TrackSourceSurface, value: TrackSourcePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(surfaceLocalKey(surface), value);
  } catch {
    // Preference persistence is best-effort; the in-memory state still updates.
  }
  window.dispatchEvent(
    new CustomEvent<TrackSourcePreference>(surfaceEventKey(surface), { detail: value }),
  );
}

function readLocalExplicitPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(EXPLICIT_LOCAL_KEY) === "true";
  } catch {
    return false;
  }
}

function writeLocalExplicitPreference(value: boolean) {
  activeExplicitPreference = value;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXPLICIT_LOCAL_KEY, value ? "true" : "false");
  } catch {
    // Preference persistence is best-effort; the in-memory state still updates.
  }
  window.dispatchEvent(new CustomEvent<boolean>(EXPLICIT_EVENT_KEY, { detail: value }));
}

export function useExplicitContentPreference() {
  const { user } = useAuth();
  const accountValue = user?.user_metadata?.[EXPLICIT_ACCOUNT_KEY];
  const resolved = typeof accountValue === "boolean" ? accountValue : readLocalExplicitPreference();
  activeExplicitPreference = resolved;
  const [hideExplicit, setHideExplicitState] = useState<boolean>(resolved);

  useEffect(() => {
    const next = typeof accountValue === "boolean" ? accountValue : readLocalExplicitPreference();
    activeExplicitPreference = next;
    setHideExplicitState(next);
    if (typeof accountValue === "boolean") {
      try {
        window.localStorage.setItem(EXPLICIT_LOCAL_KEY, accountValue ? "true" : "false");
      } catch {
        // Local cache is best-effort.
      }
    }
  }, [accountValue, user?.id]);

  useEffect(() => {
    const sync = (event: Event) => {
      const next = (event as CustomEvent<boolean>).detail;
      if (typeof next !== "boolean") return;
      activeExplicitPreference = next;
      setHideExplicitState(next);
    };
    window.addEventListener(EXPLICIT_EVENT_KEY, sync);
    return () => window.removeEventListener(EXPLICIT_EVENT_KEY, sync);
  }, []);

  const setHideExplicit = useCallback(
    async (next: boolean) => {
      activeExplicitPreference = next;
      setHideExplicitState(next);
      writeLocalExplicitPreference(next);
      if (next && typeof document !== "undefined") {
        document.querySelectorAll("audio").forEach((audio) => audio.pause());
      }
      if (!user) return;
      const { error } = await supabase.auth.updateUser({ data: { [EXPLICIT_ACCOUNT_KEY]: next } });
      if (error) throw new Error(error.message);
    },
    [user],
  );

  return { hideExplicit, setHideExplicit };
}

export function useTrackSourcePreference() {
  const { user } = useAuth();
  const [surface, setSurface] = useState<TrackSourceSurface>("feed");
  const surfaceAccountValue = user?.user_metadata?.[SURFACE_ACCOUNT_KEYS[surface]];
  const legacyAccountValue = user?.user_metadata?.[LEGACY_ACCOUNT_KEY];
  const explicitAccountValue = user?.user_metadata?.[EXPLICIT_ACCOUNT_KEY];
  activeExplicitPreference =
    typeof explicitAccountValue === "boolean"
      ? explicitAccountValue
      : readLocalExplicitPreference();
  const initial = isPreference(surfaceAccountValue)
    ? surfaceAccountValue
    : isPreference(legacyAccountValue)
      ? legacyAccountValue
      : readLocalPreference(surface);
  const [preference, setPreferenceState] = useState<TrackSourcePreference>(initial);
  const [, setExplicitRevision] = useState(0);

  useEffect(() => {
    setSurface(inferTrackSourceSurface());
  }, []);

  useEffect(() => {
    const next = isPreference(surfaceAccountValue)
      ? surfaceAccountValue
      : isPreference(legacyAccountValue)
        ? legacyAccountValue
        : readLocalPreference(surface);
    setPreferenceState(next);
    if (isPreference(surfaceAccountValue) && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(surfaceLocalKey(surface), surfaceAccountValue);
      } catch {
        // Local cache is best-effort.
      }
    }
  }, [legacyAccountValue, surface, surfaceAccountValue, user?.id]);

  useEffect(() => {
    const eventKey = surfaceEventKey(surface);
    const sync = (event: Event) => {
      const next = (event as CustomEvent<TrackSourcePreference>).detail;
      if (isPreference(next)) setPreferenceState(next);
    };
    window.addEventListener(eventKey, sync);
    return () => window.removeEventListener(eventKey, sync);
  }, [surface]);

  useEffect(() => {
    const syncExplicit = (event: Event) => {
      const next = (event as CustomEvent<boolean>).detail;
      if (typeof next !== "boolean") return;
      activeExplicitPreference = next;
      setExplicitRevision((value) => value + 1);
    };
    window.addEventListener(EXPLICIT_EVENT_KEY, syncExplicit);
    return () => window.removeEventListener(EXPLICIT_EVENT_KEY, syncExplicit);
  }, []);

  const setPreference = useCallback(
    async (next: TrackSourcePreference) => {
      const targetSurface = inferTrackSourceSurface();
      setSurface(targetSurface);
      setPreferenceState(next);
      writeLocalPreference(targetSurface, next);
      if (!user) return;
      const accountKey = SURFACE_ACCOUNT_KEYS[targetSurface];
      const { error } = await supabase.auth.updateUser({ data: { [accountKey]: next } });
      if (error) throw new Error(error.message);
    },
    [user],
  );

  return { preference, setPreference, surface };
}

export function shouldHideExplicitTracks(): boolean {
  if (typeof window !== "undefined") return readLocalExplicitPreference();
  return activeExplicitPreference;
}

export function filterExplicitTracks<T extends TrackSourceLike>(tracks: T[]): T[] {
  if (!activeExplicitPreference && !shouldHideExplicitTracks()) return tracks;
  return tracks.filter(
    (track) => track.containsExplicitLyrics !== true && track.contains_explicit_lyrics !== true,
  );
}

export function filterByTrackSource(tracks: Track[], preference: TrackSourcePreference): Track[] {
  const visibleTracks = filterExplicitTracks(tracks as TrackSourceLike[]) as Track[];
  if (preference === "all") return visibleTracks;
  return visibleTracks.filter((track) => {
    const sourceTrack = track as TrackSourceLike;
    const source = sourceTrack.sourceType ?? sourceTrack.source_type ?? "upload";
    const isUpload = source === "upload" || source == null;
    return preference === "uploads" ? isUpload : !isUpload;
  });
}

export function TrackSourceFilter({
  value,
  onChange,
  language,
  className,
}: {
  value: TrackSourcePreference;
  onChange: (value: TrackSourcePreference) => void;
  language: "en" | "el";
  className?: string;
}) {
  const persistence = useTrackSourcePreference();
  const labels = useMemo(
    () =>
      language === "el"
        ? { all: "Όλα", uploads: "Uploads", external: "External" }
        : { all: "All", uploads: "Uploads", external: "External" },
    [language],
  );

  return (
    <div
      className={cn("inline-flex rounded-full border border-white/10 bg-black/20 p-1", className)}
      role="group"
      aria-label={language === "el" ? "Πηγή τραγουδιών" : "Track source"}
    >
      {(["all", "uploads", "external"] as const).map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={value === item}
          onClick={() => {
            onChange(item);
            void persistence.setPreference(item).catch(() => undefined);
          }}
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
            value === item
              ? "bg-accent/20 text-accent"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {labels[item]}
        </button>
      ))}
    </div>
  );
}
