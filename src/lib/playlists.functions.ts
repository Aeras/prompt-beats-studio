import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import { isSafeOwnedCoverPath } from "@/lib/storage-paths";

const playlistIdSchema = z.object({ playlistId: z.string().uuid() });
const nameSchema = z.string().trim().min(1).max(80);
const coverUrlSchema = z.string().url().max(1000).nullable();

function extractOwnedPlaylistCoverPath(url: string | null | undefined, userId: string) {
  if (!url) return null;
  const marker = "/storage/v1/object/public/track-covers/";
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const path = url.slice(index + marker.length);
  return isSafeOwnedCoverPath(path, userId) ? path : null;
}

async function cleanupPlaylistCover(userId: string, url: string | null | undefined) {
  const path = extractOwnedPlaylistCoverPath(url, userId);
  if (!path) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.storage.from("track-covers").remove([path]);
}

const TRACK_COLUMNS =
  "id, user_id, title, genre, prompt, lyrics, prompt_is_public, lyrics_is_public, contains_explicit_lyrics, audio_url, audio_type, source_type, source_url, source_id, created_with, allow_download, art_url, cover_url, duration_seconds, plays, is_published, created_at";

async function loadTracksWithHandles(
  supabase: any,
  ids: string[],
  preferredOrder?: string[],
  viewerId?: string,
) {
  if (!ids.length) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: tracks, error } = await supabaseAdmin
    .from("tracks")
    .select(TRACK_COLUMNS)
    .in("id", ids);
  if (error) throw new Error(error.message);

  const rows = tracks ?? [];
  const userIds = [...new Set(rows.map((track: any) => track.user_id))] as string[];
  const handles = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, handle")
      .in("id", userIds);
    for (const profile of profiles ?? []) {
      if (profile.id) handles.set(profile.id, profile.handle ?? "unknown");
    }
  }

  const order = new Map((preferredOrder ?? ids).map((id, index) => [id, index]));
  return rows
    .map((track: any) => ({
      ...track,
      prompt:
        viewerId === track.user_id || track.prompt_is_public !== false ? (track.prompt ?? "") : "",
      lyrics:
        viewerId === track.user_id || track.lyrics_is_public !== false ? (track.lyrics ?? "") : "",
      handle: `@${handles.get(track.user_id) ?? "unknown"}`,
    }))
    .sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

async function getOwnedPlaylist(supabase: any, userId: string, playlistId: string) {
  const { data, error } = await supabase
    .from("playlists")
    .select("id, user_id, name, cover_url, is_public, created_at, updated_at")
    .eq("id", playlistId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Playlist not found");
  return data;
}

async function assertPlaylistEligibleTrack(supabase: any, userId: string, trackId: string) {
  const { data: track, error } = await supabase
    .from("tracks")
    .select("id, user_id, source_type, is_published")
    .eq("id", trackId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!track || (track.is_published !== true && track.user_id !== userId))
    throw new Error("Track is unavailable");
  if (track.source_type !== "upload")
    throw new Error("Only tracks played by the PromptBeats player can be added to playlists");
  return track;
}

export const listPlaylists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFeatureAccess(context.supabase, "playlists");
    const { data: playlists, error } = await (context.supabase as any)
      .from("playlists")
      .select("id, name, cover_url, is_public, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!playlists?.length) return { playlists: [] };

    const ids = playlists.map((playlist: any) => playlist.id);
    const { data: items, error: itemError } = await (context.supabase as any)
      .from("playlist_tracks")
      .select("playlist_id, track_id, position, added_at")
      .in("playlist_id", ids)
      .order("position", { ascending: true });
    if (itemError) throw new Error(itemError.message);

    const trackIds = [...new Set((items ?? []).map((item: any) => item.track_id))];
    const { data: tracks, error: trackError } = trackIds.length
      ? await (context.supabase.from("tracks") as any)
          .select("id, duration_seconds, cover_url, art_url")
          .in("id", trackIds)
      : { data: [], error: null };
    if (trackError) throw new Error(trackError.message);

    const trackMap = new Map<string, any>(
      (tracks ?? []).map((track: any): [string, any] => [track.id, track]),
    );
    const itemMap = new Map<string, any[]>();
    for (const item of items ?? []) {
      const list = itemMap.get(item.playlist_id) ?? [];
      list.push(item);
      itemMap.set(item.playlist_id, list);
    }

    return {
      playlists: playlists.map((playlist: any) => {
        const playlistItems = itemMap.get(playlist.id) ?? [];
        const latestItem = playlistItems.reduce(
          (latest: any, item: any) => (!latest || item.added_at > latest.added_at ? item : latest),
          null,
        );
        const latestTrack = latestItem ? trackMap.get(latestItem.track_id) : null;
        return {
          ...playlist,
          track_count: playlistItems.length,
          duration_seconds: playlistItems.reduce(
            (sum: number, item: any) => sum + (trackMap.get(item.track_id)?.duration_seconds ?? 0),
            0,
          ),
          artwork: playlist.cover_url ?? latestTrack?.cover_url ?? latestTrack?.art_url ?? null,
        };
      }),
    };
  });

export const getPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => playlistIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "playlists");
    const playlist = await getOwnedPlaylist(context.supabase, context.userId, data.playlistId);
    const { data: items, error } = await (context.supabase as any)
      .from("playlist_tracks")
      .select("track_id, position, added_at")
      .eq("playlist_id", data.playlistId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);

    const orderedIds = (items ?? []).map((item: any) => item.track_id);
    const tracks = await loadTracksWithHandles(
      context.supabase,
      orderedIds,
      orderedIds,
      context.userId,
    );
    const trackMap = new Map(tracks.map((track: any) => [track.id, track]));
    const orderedTracks = orderedIds.map((id: string) => trackMap.get(id)).filter(Boolean);

    return {
      playlist,
      tracks: orderedTracks,
      duration_seconds: orderedTracks.reduce(
        (sum: number, track: any) => sum + (track.duration_seconds ?? 0),
        0,
      ),
    };
  });

export const createPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: nameSchema,
        trackId: z.string().uuid().optional(),
        coverUrl: coverUrlSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "playlists");
    if (data.trackId)
      await assertPlaylistEligibleTrack(context.supabase, context.userId, data.trackId);
    if (data.coverUrl && !extractOwnedPlaylistCoverPath(data.coverUrl, context.userId))
      throw new Error("Invalid playlist cover");

    const { data: playlist, error } = await (context.supabase as any)
      .from("playlists")
      .insert({
        user_id: context.userId,
        name: data.name,
        cover_url: data.coverUrl ?? null,
        is_public: false,
      })
      .select("id, name, cover_url, is_public, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);

    if (data.trackId) {
      const { error: itemError } = await (context.supabase as any)
        .from("playlist_tracks")
        .insert({ playlist_id: playlist.id, track_id: data.trackId, position: 0 });
      if (itemError) {
        await (context.supabase as any)
          .from("playlists")
          .delete()
          .eq("id", playlist.id)
          .eq("user_id", context.userId);
        await cleanupPlaylistCover(context.userId, data.coverUrl);
        throw new Error(itemError.message);
      }
    }

    return { playlist };
  });

export const updatePlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ playlistId: z.string().uuid(), name: nameSchema, coverUrl: coverUrlSchema })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "playlists");
    const playlist = await getOwnedPlaylist(context.supabase, context.userId, data.playlistId);
    if (data.coverUrl && !extractOwnedPlaylistCoverPath(data.coverUrl, context.userId))
      throw new Error("Invalid playlist cover");

    const { error } = await (context.supabase as any)
      .from("playlists")
      .update({ name: data.name, cover_url: data.coverUrl })
      .eq("id", data.playlistId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    if (playlist.cover_url && playlist.cover_url !== data.coverUrl) {
      try {
        await cleanupPlaylistCover(context.userId, playlist.cover_url);
      } catch {
        /* best-effort storage cleanup */
      }
    }
    return { ok: true as const };
  });

export const deletePlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => playlistIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "playlists");
    const playlist = await getOwnedPlaylist(context.supabase, context.userId, data.playlistId);
    const { error } = await (context.supabase as any)
      .from("playlists")
      .delete()
      .eq("id", data.playlistId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    try {
      await cleanupPlaylistCover(context.userId, playlist.cover_url);
    } catch {
      /* best-effort storage cleanup */
    }
    return { ok: true as const };
  });

export const addTrackToPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ playlistId: z.string().uuid(), trackId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "playlists");
    await getOwnedPlaylist(context.supabase, context.userId, data.playlistId);
    await assertPlaylistEligibleTrack(context.supabase, context.userId, data.trackId);

    const { data: existing, error: existingError } = await (context.supabase as any)
      .from("playlist_tracks")
      .select("track_id")
      .eq("playlist_id", data.playlistId)
      .eq("track_id", data.trackId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) return { status: "exists" as const };

    const { data: last, error: lastError } = await (context.supabase as any)
      .from("playlist_tracks")
      .select("position")
      .eq("playlist_id", data.playlistId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw new Error(lastError.message);

    const { error } = await (context.supabase as any).from("playlist_tracks").insert({
      playlist_id: data.playlistId,
      track_id: data.trackId,
      position: (last?.position ?? -1) + 1,
    });
    if (error) {
      if (error.code === "23505") return { status: "exists" as const };
      throw new Error(error.message);
    }
    return { status: "added" as const };
  });

export const removeTrackFromPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ playlistId: z.string().uuid(), trackId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "playlists");
    await getOwnedPlaylist(context.supabase, context.userId, data.playlistId);
    const { error } = await (context.supabase as any)
      .from("playlist_tracks")
      .delete()
      .eq("playlist_id", data.playlistId)
      .eq("track_id", data.trackId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const reorderPlaylistTracks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ playlistId: z.string().uuid(), trackIds: z.array(z.string().uuid()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "playlists");
    const { error } = await (context.supabase as any).rpc("reorder_playlist_tracks", {
      _playlist_id: data.playlistId,
      _track_ids: data.trackIds,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listFavoriteTrackIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFeatureAccess(context.supabase, "favorites");
    const { data, error } = await (context.supabase as any)
      .from("favorites")
      .select("track_id")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { trackIds: (data ?? []).map((row: any) => row.track_id) };
  });

export const listFavoriteTracks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFeatureAccess(context.supabase, "favorites");
    const { data: favorites, error } = await (context.supabase as any)
      .from("favorites")
      .select("track_id, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (favorites ?? []).map((favorite: any) => favorite.track_id);
    return { tracks: await loadTracksWithHandles(context.supabase, ids, ids, context.userId) };
  });

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ trackId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "favorites");
    const { data: existing, error: existingError } = await (context.supabase as any)
      .from("favorites")
      .select("track_id")
      .eq("user_id", context.userId)
      .eq("track_id", data.trackId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    if (existing) {
      const { error } = await (context.supabase as any)
        .from("favorites")
        .delete()
        .eq("user_id", context.userId)
        .eq("track_id", data.trackId);
      if (error) throw new Error(error.message);
      return { favorite: false };
    }

    const { data: track, error: trackError } = await context.supabase
      .from("tracks")
      .select("id, user_id, is_published")
      .eq("id", data.trackId)
      .maybeSingle();
    if (trackError) throw new Error(trackError.message);
    if (!track || (track.is_published !== true && track.user_id !== context.userId))
      throw new Error("Track is unavailable");

    const { error } = await (context.supabase as any)
      .from("favorites")
      .insert({ user_id: context.userId, track_id: data.trackId });
    if (error) {
      if (error.code === "23505") return { favorite: true };
      throw new Error(error.message);
    }
    return { favorite: true };
  });
