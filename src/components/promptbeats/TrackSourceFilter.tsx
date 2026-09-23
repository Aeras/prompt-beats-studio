import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export type TrackSourcePreference = "all" | "uploads" | "external";

type TrackSourceLike = {
  sourceType?: string | null | undefined;
  source_type?: string | null | undefined;
};

const ACCOUNT_KEY = "track_source_preference";
const LOCAL_KEY = "pb:track-source-preference";
const EVENT_KEY = "promptbeats:track-source-preference";

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
  try { window.localStorage.setItem(LOCAL_KEY, value); } catch {}
  window.dispatchEvent(new CustomEvent<TrackSourcePreference>(EVENT_KEY, { detail: value }));
}

export function useTrackSourcePreference() {
  const { user } = useAuth();
  const accountValue = user?.user_metadata?.[ACCOUNT_KEY];
  const initial = isPreference(accountValue) ? accountValue : readLocalPreference();
  const [preference, setPreferenceState] = useState<TrackSourcePreference>(initial);

  useEffect(() => {
    const next = isPreference(user?.user_metadata?.[ACCOUNT_KEY])
      ? user!.user_metadata[ACCOUNT_KEY] as TrackSourcePreference
      : readLocalPreference();
    setPreferenceState(next);
  }, [user?.id, user?.user_metadata?.[ACCOUNT_KEY]]);

  useEffect(() => {
    const sync = (event: Event) => {
      const next = (event as CustomEvent<TrackSourcePreference>).detail;
      if (isPreference(next)) setPreferenceState(next);
    };
    window.addEventListener(EVENT_KEY, sync);
    return () => window.removeEventListener(EVENT_KEY, sync);
  }, []);

  const setPreference = useCallback(async (next: TrackSourcePreference) => {
    setPreferenceState(next);
    writeLocalPreference(next);
    if (!user) return;
    const { error } = await supabase.auth.updateUser({ data: { [ACCOUNT_KEY]: next } });
    if (error) throw new Error(error.message);
  }, [user]);

  return { preference, setPreference };
}

export function filterByTrackSource<T>(
  tracks: T[],
  preference: TrackSourcePreference,
): T[] {
  if (preference === "all") return tracks;
  return tracks.filter((track) => {
    const sourceTrack = track as T & TrackSourceLike;
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
  const labels = useMemo(() => language === "el"
    ? { all: "Όλα", uploads: "Uploads", external: "External" }
    : { all: "All", uploads: "Uploads", external: "External" }, [language]);

  return (
    <div className={cn("inline-flex rounded-full border border-white/10 bg-black/20 p-1", className)} role="group" aria-label={language === "el" ? "Πηγή τραγουδιών" : "Track source"}>
      {(["all", "uploads", "external"] as const).map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={value === item}
          onClick={() => onChange(item)}
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
            value === item ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {labels[item]}
        </button>
      ))}
    </div>
  );
}
