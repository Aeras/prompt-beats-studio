import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bookmark, Download, ListPlus, Loader2, MoreVertical, Plus, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { Track } from "@/lib/tracks";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  addTrackToPlaylist,
  createPlaylist,
  listFavoriteTrackIds,
  listPlaylists,
  toggleFavorite,
} from "@/lib/playlists.functions";
import { getTrackDownloadAvailability } from "@/lib/track-download.functions";
import { libraryActionError } from "@/lib/library-action-errors";
import { refreshFavorites, refreshPlaylists } from "@/lib/library-cache";

function fileName(title: string, mimeType: string) {
  const ext = mimeType.includes("wav") ? "wav" : "mp3";
  const safe =
    title
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 100) || "promptbeats-track";
  return `${safe}.${ext}`;
}

export function TrackLibraryActions({
  track,
  compact = false,
  ownerActions = null,
  menuActions = null,
  inlineActions = null,
  bare = false,
}: {
  track: Track;
  compact?: boolean;
  ownerActions?: ReactNode;
  menuActions?: ReactNode;
  inlineActions?: ReactNode;
  bare?: boolean;
}) {
  const { language } = useI18n();
  const { user } = useAuth();
  const favoritesAccess = useFeatureAccess("favorites");
  const playlistsAccess = useFeatureAccess("playlists");
  const queryClient = useQueryClient();
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const mutationPending = useRef(false);

  const copy =
    language === "el"
      ? {
          favorite: "Αγαπημένα",
          addFavorite: "Προσθήκη στα Αγαπημένα",
          removeFavorite: "Αφαίρεση από τα Αγαπημένα",
          playlist: "Προσθήκη σε λίστα αναπαραγωγής",
          download: "Λήψη",
          downloadDisabled: "Η λήψη δεν επιτρέπεται από τον δημιουργό",
          playlists: "Λίστες αναπαραγωγής",
          newPlaylist: "Νέα λίστα αναπαραγωγής",
          name: "Όνομα λίστας",
          create: "Δημιουργία και προσθήκη",
          cancel: "Ακύρωση",
          added: "Το τραγούδι προστέθηκε στη λίστα.",
          exists: "Το τραγούδι υπάρχει ήδη σε αυτή τη λίστα.",
          created: "Η λίστα δημιουργήθηκε και το τραγούδι προστέθηκε.",
          error: "Δεν ήταν δυνατή η ολοκλήρωση της ενέργειας.",
          noPlaylists: "Δεν έχεις ακόμη λίστες αναπαραγωγής.",
        }
      : {
          favorite: "Favorites",
          addFavorite: "Add to Favorites",
          removeFavorite: "Remove from Favorites",
          playlist: "Add to playlist",
          download: "Download",
          downloadDisabled: "Downloads are disabled by the creator",
          playlists: "Playlists",
          newPlaylist: "New playlist",
          name: "Playlist name",
          create: "Create and add",
          cancel: "Cancel",
          added: "Track added to playlist.",
          exists: "This track is already in that playlist.",
          created: "Playlist created and track added.",
          error: "The action could not be completed.",
          noPlaylists: "You do not have any playlists yet.",
        };

  const canPlaylist = Boolean(
    playlistsAccess.allowed && user && track.sourceType === "upload" && track.audioUrl,
  );
  const hasDownloadableSource = Boolean(track.sourceType === "upload" && track.audioUrl);
  const downloadAvailability = useQuery({
    queryKey: ["tracks", "download-availability", track.id, user?.id],
    queryFn: () => getTrackDownloadAvailability({ data: { trackIds: [track.id] } }),
    enabled: Boolean(user && hasDownloadableSource),
    staleTime: 20_000,
  });
  const canDownload = Boolean(
    hasDownloadableSource &&
    user &&
    (track.userId === user.id || downloadAvailability.data?.allowed[track.id] === true),
  );

  const favoriteIds = useQuery({
    queryKey: ["library", "favorite-ids", user?.id],
    queryFn: () => listFavoriteTrackIds(),
    enabled: Boolean(user && favoritesAccess.allowed),
    staleTime: 20_000,
  });
  const favoriteSet = useMemo(
    () => new Set(favoriteIds.data?.trackIds ?? []),
    [favoriteIds.data?.trackIds],
  );
  const isFavorite = favoriteSet.has(track.id);

  const playlists = useQuery({
    queryKey: ["library", "playlists", user?.id],
    queryFn: () => listPlaylists(),
    enabled: Boolean(user && playlistsAccess.allowed && playlistOpen),
  });

  if (!user) return null;

  const favorite = async () => {
    if (!favoritesAccess.allowed || mutationPending.current) return;
    mutationPending.current = true;
    setBusy("favorite");
    try {
      const result = await toggleFavorite({ data: { trackId: track.id } });
      await refreshFavorites(queryClient, user.id, track.id, result.favorite);
    } catch (error) {
      toast.error(libraryActionError(error, language, "favorite"));
    } finally {
      mutationPending.current = false;
      setBusy(null);
    }
  };

  const addTo = async (playlistId: string) => {
    if (!playlistsAccess.allowed || mutationPending.current) return;
    mutationPending.current = true;
    setBusy(playlistId);
    try {
      const result = await addTrackToPlaylist({ data: { playlistId, trackId: track.id } });
      const playlistName =
        (playlists.data?.playlists ?? []).find((playlist: any) => playlist.id === playlistId)
          ?.name ?? "";
      setPlaylistOpen(false);
      if (result.status === "exists") {
        toast.info(
          language === "el"
            ? `Το τραγούδι υπάρχει ήδη στη λίστα «${playlistName}».`
            : `This track is already in “${playlistName}”.`,
        );
      } else {
        toast.success(
          language === "el"
            ? `Το τραγούδι προστέθηκε στη λίστα «${playlistName}».`
            : `Track added to “${playlistName}”.`,
        );
      }
      await refreshPlaylists(queryClient, user.id, playlistId);
    } catch (error) {
      toast.error(libraryActionError(error, language, "add"));
    } finally {
      mutationPending.current = false;
      setBusy(null);
    }
  };

  const createAndAdd = async () => {
    if (!playlistsAccess.allowed || mutationPending.current) return;
    const name = newPlaylistName.trim();
    if (!name) return;
    mutationPending.current = true;
    setBusy("create");
    try {
      const result = await createPlaylist({ data: { name, trackId: track.id } });
      setNewPlaylistName("");
      setPlaylistOpen(false);
      toast.success(
        language === "el"
          ? `Η λίστα «${name}» δημιουργήθηκε και το τραγούδι προστέθηκε.`
          : `Playlist “${name}” was created and the track was added.`,
      );
      await refreshPlaylists(queryClient, user.id, result.playlist.id);
    } catch (error) {
      toast.error(libraryActionError(error, language, "create"));
    } finally {
      mutationPending.current = false;
      setBusy(null);
    }
  };

  const download = async () => {
    if (!canDownload) return;
    setBusy("download");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Authentication is required");
      const response = await fetch(`/api/track-download?trackId=${encodeURIComponent(track.id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error("Track download failed");
      const blob = await response.blob();
      const mimeType = response.headers.get("content-type") ?? "audio/mpeg";
      const disposition = response.headers.get("content-disposition") ?? "";
      const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
      const name = encodedName ? decodeURIComponent(encodedName) : fileName(track.title, mimeType);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error(copy.error);
    } finally {
      setBusy(null);
    }
  };

  const playlistModal =
    playlistOpen &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        data-pb-bottom-safe="true"
        className="fixed inset-x-0 top-0 z-[110] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:inset-0 sm:items-center sm:p-6"
        role="dialog"
        aria-modal="true"
      >
        <div className="glass-strong max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl">
          <header className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-accent">{copy.playlists}</p>
              <h2 className="mt-1 font-display text-lg font-bold">{track.title}</h2>
            </div>
            <button
              onClick={() => setPlaylistOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-muted-foreground hover:text-foreground"
              aria-label={copy.cancel}
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="mt-5 space-y-2">
            {playlists.isError && (
              <div role="alert" className="rounded-2xl border border-white/10 p-4 text-sm">
                <p>{libraryActionError(playlists.error, language, "load")}</p>
                <button
                  onClick={() => void playlists.refetch()}
                  className="mt-2 text-accent underline"
                >
                  {language === "el" ? "Δοκίμασε ξανά" : "Retry"}
                </button>
              </div>
            )}
            {(playlists.data?.playlists ?? []).map((playlist: any) => (
              <button
                key={playlist.id}
                onClick={() => void addTo(playlist.id)}
                disabled={Boolean(busy)}
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left transition-colors hover:border-accent/50 disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{playlist.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {playlist.track_count} tracks
                  </span>
                </span>
                {busy === playlist.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                ) : (
                  <Plus className="h-4 w-4 text-accent" />
                )}
              </button>
            ))}
            {!playlists.isLoading &&
              !playlists.isError &&
              (playlists.data?.playlists ?? []).length === 0 && (
                <p className="rounded-2xl border border-white/10 p-4 text-sm text-muted-foreground">
                  {copy.noPlaylists}
                </p>
              )}
          </div>

          <div className="mt-5 border-t border-white/10 pt-5">
            <p className="text-xs font-semibold text-foreground">{copy.newPlaylist}</p>
            <div className="mt-2 flex gap-2">
              <input
                value={newPlaylistName}
                onChange={(event) => setNewPlaylistName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createAndAdd();
                }}
                maxLength={80}
                placeholder={copy.name}
                className="h-11 min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm outline-none focus:border-accent/60"
              />
              <button
                onClick={() => void createAndAdd()}
                disabled={!newPlaylistName.trim() || Boolean(busy)}
                className="rounded-2xl bg-gradient-neon px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : copy.create}
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );

  const compactIconClass = bare
    ? "grid h-9 w-7 place-items-center text-muted-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:text-muted-foreground/30 disabled:opacity-60"
    : "grid h-7 w-7 place-items-center rounded-full border border-white/10 text-muted-foreground";
  const standardIconClass = bare
    ? "grid h-9 w-7 place-items-center text-muted-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:text-muted-foreground/30 disabled:opacity-60"
    : "grid h-8 w-8 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent";
  const iconClass = compact ? compactIconClass : standardIconClass;
  const iconSize = compact ? "h-[15px] w-[15px]" : "h-[17px] w-[17px]";

  return (
    <>
      <div
        className={
          compact ? "flex shrink-0 items-center gap-0" : "flex shrink-0 items-center gap-0"
        }
      >
        {hasDownloadableSource && (
          <button
            onClick={() => void download()}
            disabled={!canDownload || busy === "download"}
            aria-label={canDownload ? copy.download : copy.downloadDisabled}
            title={canDownload ? copy.download : copy.downloadDisabled}
            className={iconClass}
          >
            {busy === "download" && canDownload ? (
              <Loader2 className={`${iconSize} animate-spin`} />
            ) : (
              <Download className={iconSize} />
            )}
          </button>
        )}
        {inlineActions}
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button
              aria-label={language === "el" ? "Περισσότερες ενέργειες" : "More track actions"}
              className={iconClass}
            >
              <MoreVertical className={iconSize} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={6}
              align="end"
              onInteractOutside={(event) => {
                const target = event.target as HTMLElement | null;
                if (target?.closest?.('[role="dialog"]')) event.preventDefault();
              }}
              className="z-[120] min-w-56 rounded-xl border border-white/10 bg-[#111116]/95 p-1.5 text-sm shadow-2xl backdrop-blur-xl"
            >
              {favoritesAccess.allowed && (
                <DropdownMenu.Item
                  disabled={Boolean(busy)}
                  onSelect={() => void favorite()}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none hover:bg-white/10 focus:bg-white/10"
                >
                  <Bookmark className={`h-4 w-4 ${isFavorite ? "fill-current text-accent" : ""}`} />
                  {isFavorite ? copy.removeFavorite : copy.addFavorite}
                </DropdownMenu.Item>
              )}
              {canPlaylist && (
                <DropdownMenu.Item
                  onSelect={() => setPlaylistOpen(true)}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none hover:bg-white/10 focus:bg-white/10"
                >
                  <ListPlus className="h-4 w-4" /> {copy.playlist}
                </DropdownMenu.Item>
              )}
              {menuActions}
              {ownerActions}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {playlistModal}
    </>
  );
}
