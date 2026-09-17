import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  GripVertical,
  ListMusic,
  Loader2,
  Pencil,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";

import artFallback from "@/assets/art-3.jpg";
import type { Track } from "@/lib/tracks";
import { usePlayer } from "@/lib/player";
import {
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  removeTrackFromPlaylist,
  renamePlaylist,
  reorderPlaylistTracks,
} from "@/lib/playlists.functions";
import { useI18n } from "@/i18n";

type PlaylistTrackRow = {
  id: string;
  user_id: string;
  title: string;
  genre: string;
  prompt: string | null;
  lyrics: string | null;
  audio_url: string;
  audio_type: string;
  source_type: Track["sourceType"];
  source_id: string | null;
  created_with: Track["createdWith"];
  allow_download: boolean;
  art_url: string | null;
  cover_url: string | null;
  duration_seconds: number | null;
  plays: number;
  is_published: boolean;
  handle: string;
};

function formatTrackDuration(seconds: number | null) {
  if (!seconds) return "--:--";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function toTrack(row: PlaylistTrackRow): Track {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    handle: row.handle,
    genre: row.genre,
    art: row.cover_url ?? row.art_url ?? artFallback,
    duration: formatTrackDuration(row.duration_seconds),
    durationSeconds: row.duration_seconds,
    plays: String(row.plays ?? 0),
    prompt: row.prompt ?? "",
    lyrics: row.lyrics ?? "",
    audioUrl: row.audio_url,
    audioType: row.audio_type === "link" ? "link" : "upload",
    isPublished: row.is_published,
    sourceType: row.source_type,
    sourceId: row.source_id,
    createdWith: row.created_with,
    allowDownload: row.allow_download === true,
  };
}

function totalDuration(seconds: number, language: string) {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (language === "el") {
    if (hours) return `${hours} ω ${minutes} λ`;
    return `${minutes} λ`;
  }
  if (hours) return `${hours} hr ${minutes} min`;
  return `${minutes} min`;
}

function moveTrack(tracks: Track[], sourceId: string, targetId: string) {
  const from = tracks.findIndex((track) => track.id === sourceId);
  const to = tracks.findIndex((track) => track.id === targetId);
  if (from < 0 || to < 0 || from === to) return tracks;
  const next = [...tracks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function PlaylistLibraryPanel({ userId }: { userId: string }) {
  const { language } = useI18n();
  const queryClient = useQueryClient();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = language === "el"
    ? {
        title: "Λίστες αναπαραγωγής",
        create: "Νέα λίστα αναπαραγωγής",
        name: "Όνομα λίστας",
        save: "Δημιουργία",
        cancel: "Ακύρωση",
        empty: "Δεν έχεις ακόμη λίστες αναπαραγωγής.",
        private: "Ιδιωτική",
        tracks: "τραγούδια",
        error: "Δεν ήταν δυνατή η δημιουργία της λίστας.",
      }
    : {
        title: "Playlists",
        create: "New playlist",
        name: "Playlist name",
        save: "Create",
        cancel: "Cancel",
        empty: "You do not have any playlists yet.",
        private: "Private",
        tracks: "tracks",
        error: "The playlist could not be created.",
      };

  const playlists = useQuery({
    queryKey: ["library", "playlists", userId],
    queryFn: () => listPlaylists(),
  });

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createPlaylist({ data: { name: trimmed } });
      setName("");
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: ["library", "playlists"] });
      setSelectedPlaylistId(result.playlist.id);
    } catch {
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  };

  if (selectedPlaylistId) {
    return <PlaylistDetail playlistId={selectedPlaylistId} onBack={() => setSelectedPlaylistId(null)} />;
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">{copy.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{language === "el" ? "Οι λίστες είναι ιδιωτικές από προεπιλογή." : "Playlists are private by default."}</p>
        </div>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground glow-neon"><Plus className="h-4 w-4" />{copy.create}</button>
      </div>

      {creating && (
        <div className="glass mt-4 rounded-2xl p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              autoFocus
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
              placeholder={copy.name}
              className="h-11 flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm outline-none focus:border-accent/60"
            />
            <button onClick={() => void submit()} disabled={!name.trim() || busy} className="rounded-xl bg-gradient-neon px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : copy.save}</button>
            <button onClick={() => { setCreating(false); setName(""); setError(null); }} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-muted-foreground">{copy.cancel}</button>
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {(playlists.data?.playlists ?? []).map((playlist) => (
          <button key={playlist.id} onClick={() => setSelectedPlaylistId(playlist.id)} className="glass group overflow-hidden rounded-2xl text-left transition-all hover:border-accent/40">
            <div className="aspect-square overflow-hidden bg-black/30">
              <img src={playlist.artwork ?? artFallback} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 truncate font-display text-base font-bold">{playlist.name}</h3>
                <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">{copy.private}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{playlist.track_count} {copy.tracks} · {totalDuration(playlist.duration_seconds ?? 0, language)}</p>
            </div>
          </button>
        ))}
      </div>

      {!playlists.isLoading && (playlists.data?.playlists ?? []).length === 0 && <p className="glass mt-5 rounded-2xl p-8 text-center text-sm text-muted-foreground">{copy.empty}</p>}
    </section>
  );
}

function PlaylistDetail({ playlistId, onBack }: { playlistId: string; onBack: () => void }) {
  const { language } = useI18n();
  const queryClient = useQueryClient();
  const { current, playing, play, shuffle, repeat, toggleShuffle, cycleRepeat } = usePlayer();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ordered, setOrdered] = useState<Track[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copy = language === "el"
    ? {
        back: "Πίσω στις λίστες",
        private: "Ιδιωτική λίστα",
        tracks: "τραγούδια",
        play: "Αναπαραγωγή",
        shuffleOn: "Τυχαία σειρά ενεργή",
        shuffleOff: "Τυχαία σειρά",
        repeatOff: "Επανάληψη: Off",
        repeatOne: "Επανάληψη: 1",
        repeatAll: "Επανάληψη: All",
        rename: "Μετονομασία",
        delete: "Διαγραφή λίστας",
        save: "Αποθήκευση",
        cancel: "Ακύρωση",
        confirm: "Να διαγραφεί οριστικά η λίστα;",
        remove: "Αφαίρεση από τη λίστα",
        empty: "Η λίστα είναι άδεια.",
        drag: "Σύρε για αλλαγή σειράς",
        error: "Η ενέργεια δεν ολοκληρώθηκε.",
      }
    : {
        back: "Back to playlists",
        private: "Private playlist",
        tracks: "tracks",
        play: "Play",
        shuffleOn: "Shuffle on",
        shuffleOff: "Shuffle",
        repeatOff: "Repeat: Off",
        repeatOne: "Repeat: 1",
        repeatAll: "Repeat: All",
        rename: "Rename",
        delete: "Delete playlist",
        save: "Save",
        cancel: "Cancel",
        confirm: "Permanently delete this playlist?",
        remove: "Remove from playlist",
        empty: "This playlist is empty.",
        drag: "Drag to reorder",
        error: "The action could not be completed.",
      };

  const detail = useQuery({
    queryKey: ["library", "playlist", playlistId],
    queryFn: () => getPlaylist({ data: { playlistId } }),
  });

  const tracks = useMemo(() => (detail.data?.tracks ?? []).map((row) => toTrack(row as PlaylistTrackRow)), [detail.data?.tracks]);

  useEffect(() => {
    setOrdered(tracks);
    if (detail.data?.playlist.name) setName(detail.data.playlist.name);
  }, [tracks, detail.data?.playlist.name]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["library", "playlist", playlistId] });
    await queryClient.invalidateQueries({ queryKey: ["library", "playlists"] });
  };

  const persistOrder = async (next: Track[]) => {
    setBusy("reorder");
    setError(null);
    try {
      await reorderPlaylistTracks({ data: { playlistId, trackIds: next.map((track) => track.id) } });
      await refresh();
    } catch {
      setError(copy.error);
      setOrdered(tracks);
    } finally {
      setBusy(null);
    }
  };

  const reorderToward = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    setOrdered((currentTracks) => moveTrack(currentTracks, draggedId, targetId));
  };

  const finishPointerDrag = () => {
    if (!draggedId) return;
    setDraggedId(null);
    void persistOrder(ordered);
  };

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy("rename");
    try {
      await renamePlaylist({ data: { playlistId, name: trimmed } });
      setEditingName(false);
      await refresh();
    } catch {
      setError(copy.error);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (trackId: string) => {
    setBusy(trackId);
    try {
      await removeTrackFromPlaylist({ data: { playlistId, trackId } });
      await refresh();
    } catch {
      setError(copy.error);
    } finally {
      setBusy(null);
    }
  };

  const destroy = async () => {
    setBusy("delete");
    try {
      await deletePlaylist({ data: { playlistId } });
      await queryClient.invalidateQueries({ queryKey: ["library", "playlists"] });
      onBack();
    } catch {
      setError(copy.error);
    } finally {
      setBusy(null);
    }
  };

  const repeatLabel = repeat === "one" ? copy.repeatOne : repeat === "all" ? copy.repeatAll : copy.repeatOff;
  const durationSeconds = ordered.reduce((sum, track) => sum + (track.durationSeconds ?? 0), 0);

  return (
    <section className="mt-5">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-accent"><ArrowLeft className="h-4 w-4" />{copy.back}</button>

      <div className="glass-strong mt-4 rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-accent">{copy.private}</p>
            {editingName ? (
              <div className="mt-2 flex max-w-xl gap-2">
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none focus:border-accent/60" />
                <button onClick={() => void saveName()} disabled={!name.trim() || busy === "rename"} className="rounded-xl bg-gradient-neon px-4 text-sm font-semibold text-primary-foreground">{busy === "rename" ? <Loader2 className="h-4 w-4 animate-spin" /> : copy.save}</button>
                <button onClick={() => setEditingName(false)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-muted-foreground"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <h2 className="mt-1 break-words font-display text-2xl font-bold sm:text-3xl">{detail.data?.playlist.name ?? ""}</h2>
            )}
            <p className="mt-2 text-sm text-muted-foreground">{ordered.length} {copy.tracks} · {totalDuration(durationSeconds, language)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {ordered.length > 0 && <button onClick={() => play(ordered[0], ordered)} className="inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground glow-neon"><Play className="h-4 w-4" />{copy.play}</button>}
            <button onClick={toggleShuffle} aria-pressed={shuffle} title={shuffle ? copy.shuffleOn : copy.shuffleOff} className={`grid h-10 w-10 place-items-center rounded-xl border ${shuffle ? "border-accent/60 bg-accent/15 text-accent" : "border-white/10 text-muted-foreground"}`}><Shuffle className="h-4 w-4" /></button>
            <button onClick={cycleRepeat} aria-pressed={repeat !== "off"} title={repeatLabel} className={`grid h-10 w-10 place-items-center rounded-xl border ${repeat !== "off" ? "border-accent/60 bg-accent/15 text-accent" : "border-white/10 text-muted-foreground"}`}>{repeat === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}</button>
            <button onClick={() => setEditingName(true)} title={copy.rename} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:text-accent"><Pencil className="h-4 w-4" /></button>
            <button onClick={() => setConfirmDelete(true)} title={copy.delete} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:border-destructive/50 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>

        {confirmDelete && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4"><span className="mr-auto text-sm">{copy.confirm}</span><button onClick={() => void destroy()} disabled={busy === "delete"} className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground">{busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : copy.delete}</button><button onClick={() => setConfirmDelete(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-muted-foreground">{copy.cancel}</button></div>}
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      </div>

      <div className="mt-5 space-y-2">
        {ordered.map((track) => (
          <article
            key={track.id}
            data-playlist-track-id={track.id}
            className={`glass flex items-center gap-3 rounded-2xl p-2.5 transition-colors ${draggedId === track.id ? "border-accent/60 bg-accent/5" : ""}`}
            onDragOver={(event) => { event.preventDefault(); reorderToward(track.id); }}
          >
            <button
              draggable
              onDragStart={() => setDraggedId(track.id)}
              onDragEnd={() => finishPointerDrag()}
              onPointerDown={(event) => {
                if (event.pointerType === "mouse") return;
                event.currentTarget.setPointerCapture(event.pointerId);
                setDraggedId(track.id);
              }}
              onPointerMove={(event) => {
                if (!draggedId || event.pointerType === "mouse") return;
                const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-playlist-track-id]");
                const targetId = element?.dataset.playlistTrackId;
                if (targetId) reorderToward(targetId);
              }}
              onPointerUp={(event) => {
                if (event.pointerType === "mouse") return;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                finishPointerDrag();
              }}
              title={copy.drag}
              aria-label={copy.drag}
              className="touch-none cursor-grab rounded-lg p-2 text-muted-foreground hover:text-accent active:cursor-grabbing"
            ><GripVertical className="h-4 w-4" /></button>

            <button onClick={() => play(track, ordered)} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
              <img src={track.art} alt="" className="h-full w-full object-cover" />
              <span className="absolute inset-0 grid place-items-center bg-black/35 opacity-0 transition-opacity hover:opacity-100"><Play className="h-5 w-5 text-white" /></span>
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{track.title}</p>
              <p className="truncate text-xs text-muted-foreground">{track.handle} · {track.duration}</p>
            </div>

            {current?.id === track.id && playing && <span className="hidden text-[10px] uppercase tracking-widest text-accent sm:block">{language === "el" ? "Παίζει" : "Playing"}</span>}
            <button onClick={() => void remove(track.id)} disabled={busy === track.id} title={copy.remove} aria-label={copy.remove} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:border-destructive/50 hover:text-destructive disabled:opacity-50">{busy === track.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
          </article>
        ))}
      </div>

      {!detail.isLoading && ordered.length === 0 && <div className="glass mt-5 rounded-2xl p-8 text-center"><ListMusic className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">{copy.empty}</p></div>}
      {busy === "reorder" && <p className="mt-2 text-center text-[11px] text-muted-foreground">{language === "el" ? "Αποθήκευση σειράς…" : "Saving order…"}</p>}
    </section>
  );
}
