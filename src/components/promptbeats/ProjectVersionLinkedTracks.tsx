import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link2, Loader2, Music2, Pause, Play, Search, Star, Unlink, X } from "lucide-react";

import {
  linkProjectVersionTracks,
  listLinkableProjectTracks,
  listProjectVersionLinkedTracks,
  setPrimaryProjectVersionTrack,
  unlinkProjectVersionTrack,
} from "@/lib/project-version-tracks.functions";
import { usePlayer } from "@/lib/player";
import type { Track } from "@/lib/tracks";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  versionId: string;
  language: string;
};

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

function toPlayerTrack(track: {
  track_id: string;
  title: string;
  audio_url: string | null;
  cover_url: string | null;
  duration_seconds: number | null;
  is_published: boolean;
}): Track {
  return {
    id: track.track_id,
    title: track.title,
    handle: "",
    genre: "",
    art: track.cover_url ?? "",
    duration: formatDuration(track.duration_seconds),
    plays: "",
    prompt: "",
    lyrics: "",
    audioUrl: track.audio_url ?? undefined,
    audioType: "upload",
    isPublished: track.is_published,
    sourceType: "upload",
    durationSeconds: track.duration_seconds,
  };
}

function TrackSelector({
  projectId,
  versionId,
  language,
  onClose,
  onLinked,
}: Props & { onClose: () => void; onLinked: () => Promise<void> }) {
  const el = language === "el";
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = useQuery({
    queryKey: ["project-version-linkable-tracks", projectId, versionId],
    queryFn: () => listLinkableProjectTracks({ data: { projectId, versionId, search: "" } }),
  });

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return (available.data?.tracks ?? []).filter((track) => !q || track.title.toLocaleLowerCase().includes(q));
  }, [available.data?.tracks, query]);

  const toggle = (id: string, linked: boolean) => {
    if (linked) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await linkProjectVersionTracks({
        data: {
          projectId,
          versionId,
          trackIds: [...selected],
        },
      });
      await onLinked();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (el ? "Η σύνδεση απέτυχε." : "Linking failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-pb-bottom-safe="true" className="fixed inset-x-0 top-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:inset-0 sm:items-center sm:p-5">
      <section className="glass-strong flex max-h-[calc(100dvh-var(--pb-mobile-nav-offset)-0.5rem)] w-full max-w-2xl flex-col rounded-t-3xl border border-white/10 sm:max-h-[86vh] sm:rounded-3xl" role="dialog" aria-modal="true" aria-label={el ? "Σύνδεση audio αποτελεσμάτων" : "Link audio results"}>
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">{el ? "Audio αποτελέσματα" : "Audio Results"}</p>
            <h3 className="mt-1 font-display text-base font-bold">{el ? "Σύνδεση Tracks" : "Link Tracks"}</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">{el ? "Μόνο δικά σου uploaded tracks στο PromptBeats." : "Only your PromptBeats-uploaded tracks."}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:text-foreground" aria-label={el ? "Κλείσιμο" : "Close"}><X className="h-4 w-4" /></button>
        </div>

        <div className="border-b border-white/10 p-3">
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 focus-within:border-accent/40">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={el ? "Αναζήτηση τίτλου..." : "Search by title..."} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {available.isLoading && <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{el ? "Φόρτωση tracks..." : "Loading tracks..."}</div>}
          {available.error && <p className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{available.error instanceof Error ? available.error.message : (el ? "Τα tracks δεν φορτώθηκαν." : "Tracks could not be loaded.")}</p>}
          {!available.isLoading && rows.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">{el ? "Δεν βρέθηκαν διαθέσιμα uploaded tracks." : "No available uploaded tracks found."}</p>}
          <div className="space-y-2">
            {rows.map((track) => {
              const checked = track.linked || selected.has(track.id);
              return (
                <button
                  key={track.id}
                  type="button"
                  disabled={track.linked}
                  onClick={() => toggle(track.id, track.linked)}
                  aria-pressed={checked}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    checked ? "border-accent/40 bg-accent/[0.06]" : "border-white/10 bg-black/20 hover:border-accent/30",
                    track.linked && "cursor-default opacity-60",
                  )}
                >
                  <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded border", checked ? "border-accent bg-accent/15 text-accent" : "border-white/20")}>{checked ? "✓" : ""}</span>
                  <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-black/30">
                    {track.cover_url ? <img src={track.cover_url} alt="" className="h-full w-full object-cover" /> : <Music2 className="h-4 w-4 text-accent" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{track.title}</span>
                    <span className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                      <span>{formatDuration(track.duration_seconds)}</span>
                      <span>{track.is_published ? (el ? "Δημόσιο" : "Public") : (el ? "Ιδιωτικό" : "Private")}</span>
                      {track.linked && <span className="text-accent">{el ? "Ήδη συνδεδεμένο" : "Already linked"}</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="mx-4 mt-2 rounded-xl border border-red-500/20 bg-red-500/5 p-2.5 text-xs text-red-300">{error}</p>}

        <div className="border-t border-white/10 p-4">
          <button type="button" onClick={submit} disabled={selected.size === 0 || busy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {el ? `Σύνδεση ${selected.size || ""} Track${selected.size === 1 ? "" : "s"}` : `Link ${selected.size || ""} Track${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </section>
    </div>
  );
}

export function ProjectVersionLinkedTracks({ projectId, versionId, language }: Props) {
  const el = language === "el";
  const queryClient = useQueryClient();
  const { current, playing, play, playbackError } = usePlayer();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const linked = useQuery({
    queryKey: ["project-version-linked-tracks", projectId, versionId],
    queryFn: () => listProjectVersionLinkedTracks({ data: { projectId, versionId } }),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["project-version-linked-tracks", projectId, versionId] }),
      queryClient.invalidateQueries({ queryKey: ["project-version-linkable-tracks", projectId, versionId] }),
      queryClient.invalidateQueries({ queryKey: ["project-version-history", projectId] }),
    ]);
  };

  const setPrimary = async (trackId: string | null) => {
    if (busyKey) return;
    setBusyKey(`primary:${trackId ?? "none"}`);
    setActionError(null);
    try {
      await setPrimaryProjectVersionTrack({ data: { projectId, versionId, trackId } });
      await refresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : (el ? "Η αλλαγή κύριου αποτελέσματος απέτυχε." : "Could not change Primary Result."));
    } finally {
      setBusyKey(null);
    }
  };

  const unlink = async (trackId: string, title: string) => {
    if (busyKey) return;
    const confirmed = window.confirm(el
      ? `Αποσύνδεση του “${title}”; Το track δεν θα διαγραφεί από το PromptBeats.`
      : `Unlink “${title}”? The track will not be deleted from PromptBeats.`);
    if (!confirmed) return;
    setBusyKey(`unlink:${trackId}`);
    setActionError(null);
    try {
      await unlinkProjectVersionTrack({ data: { projectId, versionId, trackId } });
      await refresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : (el ? "Η αποσύνδεση απέτυχε." : "Unlink failed."));
    } finally {
      setBusyKey(null);
    }
  };

  const tracks = linked.data?.tracks ?? [];

  return (
    <section className="rounded-xl border border-accent/20 bg-accent/[0.025] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">{el ? "Συνδεδεμένα Audio Αποτελέσματα" : "Linked Audio Results"}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{el ? "Reference στα υπάρχοντα uploaded tracks σου — χωρίς αντιγραφή αρχείου." : "References to your existing uploaded tracks — no audio copy."}</p>
        </div>
        <button type="button" onClick={() => setSelectorOpen(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-accent/30 px-3 text-xs font-semibold text-accent hover:bg-accent/5">
          <Link2 className="h-3.5 w-3.5" />{el ? "Σύνδεση Track" : "Link Track"}
        </button>
      </div>

      {linked.isLoading && <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{el ? "Φόρτωση..." : "Loading..."}</div>}
      {linked.error && <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 text-xs text-red-300">{linked.error instanceof Error ? linked.error.message : (el ? "Τα linked tracks δεν φορτώθηκαν." : "Linked tracks could not be loaded.")}</p>}
      {!linked.isLoading && !linked.error && tracks.length === 0 && <p className="mt-3 text-xs text-muted-foreground">{el ? "Δεν υπάρχουν ακόμη συνδεδεμένα audio αποτελέσματα." : "No linked audio results yet."}</p>}

      <div className="mt-3 space-y-2">
        {tracks.map((track) => {
          const playerTrack = toPlayerTrack(track);
          const active = current?.id === track.track_id;
          const isPlaying = active && playing;
          const rowPlaybackError = active ? playbackError : null;
          return (
            <div key={track.track_id} className={cn("flex min-w-0 flex-wrap items-center gap-2 rounded-xl border bg-black/20 p-2.5", track.is_primary ? "border-amber-400/25" : "border-white/10")}>
              <button
                type="button"
                disabled={track.unavailable || !track.audio_url}
                onClick={() => play(playerTrack, [playerTrack], { countPlay: false })}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-accent/25 text-accent disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={track.unavailable ? (el ? "Το track δεν είναι διαθέσιμο" : "Track unavailable") : isPlaying ? (el ? `Παύση ${track.title}` : `Pause ${track.title}`) : (el ? `Αναπαραγωγή ${track.title}` : `Play ${track.title}`)}
              >
                {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
              </button>

              <div className="min-w-[9rem] flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="min-w-0 truncate text-xs font-semibold">{track.title}</span>
                  {track.is_primary && <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 px-2 py-0.5 text-[9px] font-semibold text-amber-300"><Star className="h-2.5 w-2.5 fill-current" />{el ? "Κύριο αποτέλεσμα" : "Primary Result"}</span>}
                  {track.unavailable && <span className="rounded-full border border-red-400/20 px-2 py-0.5 text-[9px] text-red-300">{el ? "Μη διαθέσιμο" : "Unavailable"}</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{formatDuration(track.duration_seconds)}</span>
                  <span>{track.is_published ? (el ? "Δημόσιο" : "Public") : (el ? "Ιδιωτικό" : "Private")}</span>
                  {rowPlaybackError && <span className="text-red-300">{el ? "Η αναπαραγωγή απέτυχε." : "Playback failed."}</span>}
                </div>
              </div>

              <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                {!track.unavailable && <Link to="/track/$id" params={{ id: track.track_id }} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-[10px] text-muted-foreground hover:text-accent">
                  <ExternalLink className="h-3 w-3" />{el ? "Άνοιγμα" : "Open Track"}
                </Link>}
                <button type="button" disabled={Boolean(busyKey)} onClick={() => setPrimary(track.is_primary ? null : track.track_id)} className={cn("inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-[10px] font-semibold disabled:opacity-40", track.is_primary ? "border-amber-400/25 text-amber-300" : "border-white/10 text-muted-foreground hover:text-amber-300")}>
                  {busyKey === `primary:${track.track_id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className={cn("h-3 w-3", track.is_primary && "fill-current")} />}
                  {track.is_primary ? (el ? "Αφαίρεση Primary" : "Clear Primary") : (el ? "Ως Κύριο" : "Set Primary")}
                </button>
                <button type="button" disabled={Boolean(busyKey)} onClick={() => unlink(track.track_id, track.title)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-[10px] text-muted-foreground hover:border-red-400/25 hover:text-red-300 disabled:opacity-40">
                  {busyKey === `unlink:${track.track_id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
                  {el ? "Αποσύνδεση" : "Unlink"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {actionError && <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 text-xs text-red-300">{actionError}</p>}

      {selectorOpen && <TrackSelector projectId={projectId} versionId={versionId} language={language} onClose={() => setSelectorOpen(false)} onLinked={refresh} />}
    </section>
  );
}
