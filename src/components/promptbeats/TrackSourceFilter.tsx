import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Track } from "@/lib/tracks";
import { cn } from "@/lib/utils";

export type TrackSourcePreference = "all" | "uploads" | "external";

type TrackSourceLike = Track & {
  source_type?: string | null | undefined;
  contains_explicit_lyrics?: boolean | null | undefined;
};

const ACCOUNT_KEY = "track_source_preference";
const LOCAL_KEY = "pb:track-source-preference";
const EVENT_KEY = "promptbeats:track-source-preference";

const EXPLICIT_ACCOUNT_KEY = "hide_explicit_tracks";
const EXPLICIT_LOCAL_KEY = "pb:hide-explicit-tracks";
const EXPLICIT_EVENT_KEY = "promptbeats:hide-explicit-tracks";

let activeExplicitPreference = false;

function isPreference(value: unknown): value is TrackSourcePreference {
  return value === "all" || value === "uploads" || value === "external";
}

function readLocalPreference(): TrackSourcePreference {
  if (typeof window === "undefined") return "all";
  try {
    const value = window.localStorage.getItem(LOCAL_KEY);
    return isPreference(value) ? value : "all";
  } catch {
    return "all";
  }
}

function writeLocalPreference(value: TrackSourcePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_KEY, value);
  } catch {
    // Preference persistence is best-effort; the in-memory state still updates.
  }
  window.dispatchEvent(new CustomEvent<TrackSourcePreference>(EVENT_KEY, { detail: value }));
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
  const accountValue = user?.user_metadata?.[ACCOUNT_KEY];
  const explicitAccountValue = user?.user_metadata?.[EXPLICIT_ACCOUNT_KEY];
  activeExplicitPreference =
    typeof explicitAccountValue === "boolean"
      ? explicitAccountValue
      : readLocalExplicitPreference();
  const initial = isPreference(accountValue) ? accountValue : readLocalPreference();
  const [preference, setPreferenceState] = useState<TrackSourcePreference>(initial);
  const [, setExplicitRevision] = useState(0);

  useEffect(() => {
    const next = isPreference(accountValue) ? accountValue : readLocalPreference();
    setPreferenceState(next);
  }, [accountValue, user?.id]);

  useEffect(() => {
    const sync = (event: Event) => {
      const next = (event as CustomEvent<TrackSourcePreference>).detail;
      if (isPreference(next)) setPreferenceState(next);
    };
    window.addEventListener(EVENT_KEY, sync);
    return () => window.removeEventListener(EVENT_KEY, sync);
  }, []);

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
      setPreferenceState(next);
      writeLocalPreference(next);
      if (!user) return;
      const { error } = await supabase.auth.updateUser({ data: { [ACCOUNT_KEY]: next } });
      if (error) throw new Error(error.message);
    },
    [user],
  );

  return { preference, setPreference };
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
          onClick={() => onChange(item)}
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
