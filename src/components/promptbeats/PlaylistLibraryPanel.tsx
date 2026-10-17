import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  GripVertical,
  ImagePlus,
  LayoutGrid,
  List,
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
import type { CreatedWith } from "@/lib/created-with";
import { usePlayer } from "@/lib/player";
import {
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
  updatePlaylist,
} from "@/lib/playlists.functions";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { usePb012LastWork } from "@/lib/pb012-last-work";
import { cn } from "@/lib/utils";
import { ExplicitBadge } from "@/components/promptbeats/ExplicitBadge";
import { COVER_ACCEPT, validateCoverFile } from "@/lib/cover-upload";
import {
  TrackSourceFilter,
  filterByTrackSource,
  useTrackSourcePreference,
  type TrackSourcePreference,
} from "@/components/promptbeats/TrackSourceFilter";

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
  created_with: CreatedWith | null;
  allow_download: boolean;
  contains_explicit_lyrics: boolean;
  art_url: string | null;
  cover_url: string | null;
  duration_seconds: number | null;
  plays: number;
  is_published: boolean;
  handle: string;
};

type PlaylistSummary = {
  id: string;
  name: string;
  cover_url: string | null;
  artwork: string | null;
  track_count: number;
  duration_seconds: number;
};

type PlaylistViewMode = "standard" | "compact" | "list";

const PLAYLIST_VIEW_KEY = "promptbeats:playlist-view-mode";
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
    containsExplicitLyrics: row.contains_explicit_lyrics === true,
  };
}

function totalDuration(seconds: number, language: string) {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return language === "el" ? "<1 λ" : "<1 min";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (language === "el") return hours ? `${hours} ω ${minutes} λ` : `${minutes} λ`;
  return hours ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

function moveTrack(tracks: Track[], sourceId: string, targetId: string) {
  const from = tracks.findIndex((track) => track.id === sourceId);
  const to = tracks.findIndex((track) => track.id === targetId);
  if (from < 0 || to < 0 || from === to) return tracks;
  const next = [...tracks];
  const [moved] = next.splice(from, 1);
  if (!moved) return tracks;
  next.splice(to, 0, moved);
  return next;
}

function readPlaylistViewMode(): PlaylistViewMode {
  if (typeof window === "undefined") return "standard";
  try {
    const stored = window.localStorage.getItem(PLAYLIST_VIEW_KEY);
    return stored === "standard" || stored === "compact" || stored === "list" ? stored : "standard";
  } catch {
    return "standard";
  }
}

async function uploadPlaylistCover(file: File, userId: string) {
  const extension = validateCoverFile(file);
  const path = `${userId}/playlists/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from("track-covers")
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw new Error(error.message);
  return { path, url: supabase.storage.from("track-covers").getPublicUrl(path).data.publicUrl };
}

async function removeUploadedCover(path: string | null | undefined) {
  if (!path) return;
  await supabase.storage.from("track-covers").remove([path]);
}

function PlaylistViewToggle({
  mode,
  onChange,
  language,
}: {
  mode: PlaylistViewMode;
  onChange: (mode: PlaylistViewMode) => void;
  language: string;
}) {
  const labels =
    language === "el"
      ? { standard: "Κανονική κάρτα", compact: "Compact", list: "Λίστα" }
      : { standard: "Cards", compact: "Compact", list: "List" };
  return (
    <div
      className="hidden rounded-full border border-white/10 bg-black/20 p-1 sm:inline-flex"
      role="group"
    >
      <button
        title={labels.standard}
        aria-label={labels.standard}
        aria-pressed={mode === "standard"}
        onClick={() => onChange("standard")}
        className={cn(
          "grid h-8 w-8 place-items-center rounded-full",
          mode === "standard" ? "bg-accent/20 text-accent" : "text-muted-foreground",
        )}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        title={labels.compact}
        aria-label={labels.compact}
        aria-pressed={mode === "compact"}
        onClick={() => onChange("compact")}
        className={cn(
          "grid h-8 w-8 place-items-center rounded-full",
          mode === "compact" ? "bg-accent/20 text-accent" : "text-muted-foreground",
        )}
      >
        <span className="grid grid-cols-3 gap-0.5">
          {Array.from({ length: 9 }, (_, index) => (
            <i key={index} className="h-1 w-1 rounded-[1px] bg-current" />
          ))}
        </span>
      </button>
      <button
        title={labels.list}
        aria-label={labels.list}
        aria-pressed={mode === "list"}
        onClick={() => onChange("list")}
        className={cn(
          "grid h-8 w-8 place-items-center rounded-full",
          mode === "list" ? "bg-accent/20 text-accent" : "text-muted-foreground",
        )}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}

function PlaylistRow({
  playlist,
  language,
  onOpen,
  onDelete,
  canManage,
}: {
  playlist: PlaylistSummary;
  language: string;
  onOpen: () => void;
  onDelete: () => void;
  canManage: boolean;
}) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-2.5">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <img
          src={playlist.artwork ?? artFallback}
          alt=""
          className="h-14 w-14 shrink-0 rounded-xl object-cover"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-sm font-bold">{playlist.name}</span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {playlist.track_count} {language === "el" ? "τραγούδια" : "tracks"} ·{" "}
            {totalDuration(playlist.duration_seconds ?? 0, language)}
          </span>
        </span>
      </button>
      {canManage && (
        <button
          onClick={onDelete}
          aria-label={language === "el" ? "Διαγραφή λίστας" : "Delete playlist"}
          className="grid h-9 w-9 min-h-11 min-w-11 shrink-0 place-items-center rounded-xl border border-white/10 text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function PlaylistLibraryPanel({ userId }: { userId: string }) {
  const { language } = useI18n();
  const featureAccess = useFeatureAccess("playlists");
  const canManage = featureAccess.allowed;
  const queryClient = useQueryClient();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [viewMode, setViewModeState] = useState<PlaylistViewMode>("standard");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setViewModeState(readPlaylistViewMode()), []);
  useEffect(() => {
    if (featureAccess.allowed) return;
    setSelectedPlaylistId(null);
    setCreating(false);
  }, [featureAccess.allowed]);
  const setViewMode = (mode: PlaylistViewMode) => {
    setViewModeState(mode);
    try {
      window.localStorage.setItem(PLAYLIST_VIEW_KEY, mode);
    } catch {
      /* local preference only */
    }
  };

  const copy =
    language === "el"
      ? {
          title: "Λίστες αναπαραγωγής",
          create: "Νέα λίστα αναπαραγωγής",
          name: "Όνομα λίστας",
          cover: "Προαιρετικό εξώφυλλο",
          save: "Δημιουργία",
          cancel: "Ακύρωση",
          empty: "Δεν έχεις ακόμη λίστες αναπαραγωγής.",
          private: "Ιδιωτική",
          tracks: "τραγούδια",
          error: "Δεν ήταν δυνατή η δημιουργία της λίστας.",
          deleteConfirm: "Να διαγραφεί οριστικά αυτή η λίστα αναπαραγωγής;",
          delete: "Διαγραφή",
        }
      : {
          title: "Playlists",
          create: "New playlist",
          name: "Playlist name",
          cover: "Optional cover",
          save: "Create",
          cancel: "Cancel",
          empty: "You do not have any playlists yet.",
          private: "Private",
          tracks: "tracks",
          error: "The playlist could not be created.",
          deleteConfirm: "Permanently delete this playlist?",
          delete: "Delete",
        };

  const playlists = useQuery({
    queryKey: ["library", "playlists", userId],
    queryFn: () => listPlaylists(),
    enabled: featureAccess.allowed,
  });
  const rows = (playlists.data?.playlists ?? []) as PlaylistSummary[];
  usePb012LastWork(
    userId,
    featureAccess.allowed && playlists.isSuccess && !playlists.isFetching
      ? { type: "playlists" }
      : null,
  );

  if (!featureAccess.allowed) return null;

  const submit = async () => {
    if (!canManage) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy("create");
    setError(null);
    let uploaded: { path: string; url: string } | null = null;
    try {
      if (coverFile) uploaded = await uploadPlaylistCover(coverFile, userId);
      const result = await createPlaylist({
        data: { name: trimmed, coverUrl: uploaded?.url ?? null },
      });
      setName("");
      setCoverFile(null);
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: ["library", "playlists"] });
      setSelectedPlaylistId(result.playlist.id);
    } catch (err) {
      if (uploaded)
        try {
          await removeUploadedCover(uploaded.path);
        } catch {
          /* best-effort cleanup */
        }
      setError(err instanceof Error ? err.message : copy.error);
    } finally {
      setBusy(null);
    }
  };

  const destroySummary = async (playlistId: string) => {
    if (!canManage) return;
    setBusy(`delete:${playlistId}`);
    setError(null);
    try {
      await deletePlaylist({ data: { playlistId } });
      await queryClient.invalidateQueries({ queryKey: ["library", "playlists"] });
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.error);
    } finally {
      setBusy(null);
    }
  };

  if (selectedPlaylistId) {
    return (
      <PlaylistDetail
        playlistId={selectedPlaylistId}
        userId={userId}
        canManage={canManage}
        onBack={() => setSelectedPlaylistId(null)}
      />
    );
  }

  const desktopGrid =
    viewMode === "compact"
      ? "grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      : "grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <section className="mt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">{copy.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {language === "el"
              ? "Οι λίστες είναι ιδιωτικές από προεπιλογή."
              : "Playlists are private by default."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PlaylistViewToggle mode={viewMode} onChange={setViewMode} language={language} />
          {canManage && (
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-3 py-2.5 text-sm font-semibold text-primary-foreground glow-neon sm:px-4"
            >
              <Plus className="h-4 w-4" />
              <span>{copy.create}</span>
            </button>
          )}
        </div>
      </div>

      {canManage && creating && (
        <div className="glass mt-4 rounded-2xl p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              autoFocus
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !coverFile) void submit();
              }}
              placeholder={copy.name}
              className="h-11 min-w-0 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm outline-none focus:border-accent/60"
            />
            <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent">
              <ImagePlus className="h-4 w-4" />
              {coverFile ? coverFile.name : copy.cover}
              <input
                type="file"
                accept={COVER_ACCEPT}
                className="hidden"
                onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              onClick={() => {
                setCreating(false);
                setName("");
                setCoverFile(null);
                setError(null);
              }}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-muted-foreground"
            >
              {copy.cancel}
            </button>
            <button
              onClick={() => void submit()}
              disabled={!name.trim() || busy === "create"}
              className="rounded-xl bg-gradient-neon px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : copy.save}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      )}

      <div className="mt-5 space-y-2 sm:hidden">
        {rows.map((playlist) => (
          <PlaylistRow
            key={playlist.id}
            playlist={playlist}
            language={language}
            canManage={canManage}
            onOpen={() => setSelectedPlaylistId(playlist.id)}
            onDelete={() => setConfirmDeleteId(playlist.id)}
          />
        ))}
      </div>

      {viewMode === "list" ? (
        <div className="mt-5 hidden space-y-2 sm:block">
          {rows.map((playlist) => (
            <PlaylistRow
              key={playlist.id}
              playlist={playlist}
              language={language}
              canManage={canManage}
              onOpen={() => setSelectedPlaylistId(playlist.id)}
              onDelete={() => setConfirmDeleteId(playlist.id)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 hidden sm:block">
          <div className={desktopGrid}>
            {rows.map((playlist) => (
              <article
                key={playlist.id}
                className="glass group relative overflow-hidden rounded-2xl"
              >
                <button
                  onClick={() => setSelectedPlaylistId(playlist.id)}
                  className="block w-full text-left"
                >
                  <div className="aspect-square overflow-hidden bg-black/30">
                    <img
                      src={playlist.artwork ?? artFallback}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className={viewMode === "compact" ? "p-3" : "p-4"}>
                    <div className="flex items-start justify-between gap-2">
                      <h3
                        className={cn(
                          "min-w-0 truncate font-display font-bold",
                          viewMode === "compact" ? "text-sm" : "text-base",
                        )}
                      >
                        {playlist.name}
                      </h3>
                      <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
                        {copy.private}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {playlist.track_count} {copy.tracks} ·{" "}
                      {totalDuration(playlist.duration_seconds ?? 0, language)}
                    </p>
                  </div>
                </button>
                {canManage && (
                  <button
                    onClick={() => setConfirmDeleteId(playlist.id)}
                    aria-label={copy.delete}
                    className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/65 text-white/75 backdrop-blur transition-colors hover:border-destructive/60 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      {!playlists.isLoading && rows.length === 0 && (
        <p className="glass mt-5 rounded-2xl p-8 text-center text-sm text-muted-foreground">
          {copy.empty}
        </p>
      )}
      {error && !creating && <p className="mt-3 text-xs text-destructive">{error}</p>}

      {canManage && confirmDeleteId && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="glass-strong w-full max-w-sm rounded-3xl p-5">
            <p className="text-sm">{copy.deleteConfirm}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-muted-foreground"
              >
                {copy.cancel}
              </button>
              <button
                onClick={() => void destroySummary(confirmDeleteId)}
                disabled={busy === `delete:${confirmDeleteId}`}
                className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground"
              >
                {busy === `delete:${confirmDeleteId}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  copy.delete
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PlaylistDetail({
  playlistId,
  userId,
  canManage,
  onBack,
}: {
  playlistId: string;
  userId: string;
  canManage: boolean;
  onBack: () => void;
}) {
  const { language } = useI18n();
  const queryClient = useQueryClient();
  const { current, playing, play, shuffle, repeat, toggleShuffle, cycleRepeat } = usePlayer();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ordered, setOrdered] = useState<Track[]>([]);
  const orderedRef = useRef<Track[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { preference: defaultTrackSource } = useTrackSourcePreference();
  const [trackSource, setTrackSource] = useState<TrackSourcePreference>(defaultTrackSource);
  useEffect(() => setTrackSource(defaultTrackSource), [defaultTrackSource, playlistId]);

  const copy =
    language === "el"
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
          edit: "Επεξεργασία",
          delete: "Διαγραφή λίστας",
          save: "Αποθήκευση",
          cancel: "Ακύρωση",
          confirm: "Να διαγραφεί οριστικά η λίστα;",
          remove: "Αφαίρεση από τη λίστα",
          empty: "Η λίστα είναι άδεια.",
          drag: "Σύρε για αλλαγή σειράς",
          error: "Η ενέργεια δεν ολοκληρώθηκε.",
          cover: "Νέο εξώφυλλο",
          removeCover: "Αφαίρεση custom εξωφύλλου",
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
          edit: "Edit",
          delete: "Delete playlist",
          save: "Save",
          cancel: "Cancel",
          confirm: "Permanently delete this playlist?",
          remove: "Remove from playlist",
          empty: "This playlist is empty.",
          drag: "Drag to reorder",
          error: "The action could not be completed.",
          cover: "New cover",
          removeCover: "Remove custom cover",
        };

  const detail = useQuery({
    queryKey: ["library", "playlist", playlistId],
    queryFn: () => getPlaylist({ data: { playlistId } }),
  });
  const tracks = useMemo(
    () => (detail.data?.tracks ?? []).map((row: any) => toTrack(row as PlaylistTrackRow)),
    [detail.data?.tracks],
  );

  useEffect(() => {
    orderedRef.current = tracks;
    setOrdered(tracks);
    if (detail.data?.playlist.name) setName(detail.data.playlist.name);
  }, [tracks, detail.data?.playlist.name]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["library", "playlist", playlistId] });
    await queryClient.invalidateQueries({ queryKey: ["library", "playlists"] });
  };

  const persistOrder = async (next: Track[]) => {
    if (!canManage) return;
    setBusy("reorder");
    setError(null);
    try {
      await reorderPlaylistTracks({
        data: { playlistId, trackIds: next.map((track) => track.id) },
      });
      await refresh();
    } catch {
      setError(copy.error);
      setOrdered(tracks);
      orderedRef.current = tracks;
    } finally {
      setBusy(null);
    }
  };

  const reorderToward = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    setOrdered((currentTracks) => {
      const next = moveTrack(currentTracks, draggedId, targetId);
      orderedRef.current = next;
      return next;
    });
  };

  const finishPointerDrag = () => {
    if (!draggedId) return;
    setDraggedId(null);
    void persistOrder(orderedRef.current);
  };

  const saveMetadata = async () => {
    if (!canManage) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy("edit");
    setError(null);
    let uploaded: { path: string; url: string } | null = null;
    try {
      if (coverFile) uploaded = await uploadPlaylistCover(coverFile, userId);
      const currentCover = detail.data?.playlist.cover_url ?? null;
      const nextCover = uploaded?.url ?? (removeCover ? null : currentCover);
      await updatePlaylist({ data: { playlistId, name: trimmed, coverUrl: nextCover } });
      setCoverFile(null);
      setRemoveCover(false);
      setEditing(false);
      await refresh();
    } catch (err) {
      if (uploaded)
        try {
          await removeUploadedCover(uploaded.path);
        } catch {
          /* best-effort cleanup */
        }
      setError(err instanceof Error ? err.message : copy.error);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (trackId: string) => {
    if (!canManage) return;
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
    if (!canManage) return;
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

  const repeatLabel =
    repeat === "one" ? copy.repeatOne : repeat === "all" ? copy.repeatAll : copy.repeatOff;
  const visibleOrdered = filterByTrackSource(ordered, trackSource);
  const durationSeconds = visibleOrdered.reduce(
    (sum, track) => sum + (track.durationSeconds ?? 0),
    0,
  );

  return (
    <section className="mt-5">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        {copy.back}
      </button>

      <div className="glass-strong mt-4 rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-accent">{copy.private}</p>
            <h2 className="mt-1 break-words font-display text-2xl font-bold sm:text-3xl">
              {detail.data?.playlist.name ?? ""}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {visibleOrdered.length} {copy.tracks} · {totalDuration(durationSeconds, language)}
            </p>
          </div>

          <div className="flex flex-nowrap items-center gap-2">
            {visibleOrdered.length > 0 && (
              <button
                onClick={() => {
                  const first = visibleOrdered[0];
                  if (first) play(first, visibleOrdered);
                }}
                title={copy.play}
                aria-label={copy.play}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-neon text-primary-foreground glow-neon sm:inline-flex sm:w-auto sm:gap-2 sm:rounded-xl sm:px-4"
              >
                <Play className="h-4 w-4" />
                <span className="hidden sm:inline">{copy.play}</span>
              </button>
            )}
            <button
              onClick={toggleShuffle}
              aria-pressed={shuffle}
              title={shuffle ? copy.shuffleOn : copy.shuffleOff}
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-full border sm:rounded-xl",
                shuffle
                  ? "border-accent/60 bg-accent/15 text-accent"
                  : "border-white/10 text-muted-foreground",
              )}
            >
              <Shuffle className="h-4 w-4" />
            </button>
            <button
              onClick={cycleRepeat}
              aria-pressed={repeat !== "off"}
              title={repeatLabel}
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-full border sm:rounded-xl",
                repeat !== "off"
                  ? "border-accent/60 bg-accent/15 text-accent"
                  : "border-white/10 text-muted-foreground",
              )}
            >
              {repeat === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
            </button>
            {canManage && (
              <button
                onClick={() => {
                  setEditing(true);
                  setName(detail.data?.playlist.name ?? "");
                  setCoverFile(null);
                  setRemoveCover(false);
                }}
                title={copy.edit}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 text-muted-foreground hover:text-accent sm:rounded-xl"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {canManage && (
              <button
                onClick={() => setConfirmDelete(true)}
                title={copy.delete}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 text-muted-foreground hover:border-destructive/50 hover:text-destructive sm:rounded-xl"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {canManage && editing && (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                className="h-11 min-w-0 rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none focus:border-accent/60"
              />
              <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-muted-foreground hover:border-accent/50 hover:text-accent">
                <ImagePlus className="h-4 w-4" />
                {coverFile ? coverFile.name : copy.cover}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    setCoverFile(event.target.files?.[0] ?? null);
                    setRemoveCover(false);
                  }}
                />
              </label>
            </div>
            {detail.data?.playlist.cover_url && !coverFile && (
              <button
                onClick={() => setRemoveCover((value) => !value)}
                className={cn(
                  "mt-3 rounded-xl border px-3 py-2 text-xs",
                  removeCover
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : "border-white/10 text-muted-foreground",
                )}
              >
                {removeCover
                  ? language === "el"
                    ? "Το custom εξώφυλλο θα αφαιρεθεί"
                    : "Custom cover will be removed"
                  : copy.removeCover}
              </button>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditing(false);
                  setCoverFile(null);
                  setRemoveCover(false);
                }}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-muted-foreground"
              >
                {copy.cancel}
              </button>
              <button
                onClick={() => void saveMetadata()}
                disabled={!name.trim() || busy === "edit"}
                className="rounded-xl bg-gradient-neon px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy === "edit" ? <Loader2 className="h-4 w-4 animate-spin" /> : copy.save}
              </button>
            </div>
          </div>
        )}

        {canManage && confirmDelete && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
            <span className="mr-auto text-sm">{copy.confirm}</span>
            <button
              onClick={() => void destroy()}
              disabled={busy === "delete"}
              className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground"
            >
              {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : copy.delete}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-muted-foreground"
            >
              {copy.cancel}
            </button>
          </div>
        )}
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      </div>

      <div className="mt-4 flex justify-end">
        <TrackSourceFilter value={trackSource} onChange={setTrackSource} language={language} />
      </div>

      <div className="mt-5 space-y-2">
        {visibleOrdered.map((track) => (
          <article
            key={track.id}
            data-playlist-track-id={track.id}
            className={cn(
              "glass flex items-center gap-3 rounded-2xl p-2.5 transition-colors",
              draggedId === track.id && "border-accent/60 bg-accent/5",
            )}
            onDragOver={(event) => {
              event.preventDefault();
              reorderToward(track.id);
            }}
          >
            {canManage && trackSource === "all" && (
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
                  const element = document
                    .elementFromPoint(event.clientX, event.clientY)
                    ?.closest<HTMLElement>("[data-playlist-track-id]");
                  const targetId = element?.dataset["playlistTrackId"];
                  if (targetId) reorderToward(targetId);
                }}
                onPointerUp={(event) => {
                  if (event.pointerType === "mouse") return;
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  finishPointerDrag();
                }}
                title={copy.drag}
                aria-label={copy.drag}
                className="touch-none cursor-grab rounded-lg p-2 text-muted-foreground hover:text-accent active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => play(track, visibleOrdered)}
              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl"
            >
              <img src={track.art} alt="" className="h-full w-full object-cover" />
              <span className="absolute inset-0 grid place-items-center bg-black/35 opacity-0 transition-opacity hover:opacity-100">
                <Play className="h-5 w-5 text-white" />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-semibold">{track.title}</p>
                {track.containsExplicitLyrics && <ExplicitBadge compact />}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {track.handle} · {track.duration}
              </p>
            </div>
            {current?.id === track.id && playing && (
              <span className="hidden text-[10px] uppercase tracking-widest text-accent sm:block">
                {language === "el" ? "Παίζει" : "Playing"}
              </span>
            )}
            {canManage && (
              <button
                onClick={() => void remove(track.id)}
                disabled={busy === track.id}
                title={copy.remove}
                aria-label={copy.remove}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
              >
                {busy === track.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            )}
          </article>
        ))}
      </div>

      {!detail.isLoading && visibleOrdered.length === 0 && (
        <div className="glass mt-5 rounded-2xl p-8 text-center">
          <ListMusic className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">{copy.empty}</p>
        </div>
      )}
      {busy === "reorder" && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {language === "el" ? "Αποθήκευση σειράς…" : "Saving order…"}
        </p>
      )}
    </section>
  );
}
