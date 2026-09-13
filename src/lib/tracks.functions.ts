import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanTrackStorage } from "@/lib/track-moderation.functions";
import { isSafeOwnedAudioKey, isSafeOwnedCoverPath } from "@/lib/storage-paths";

const trackInput = z.object({
  title: z.string().trim().min(1).max(120),
  genre: z.string().trim().min(1).max(60).default("Other / Experimental"),
  prompt: z.string().trim().max(4000).default(""),
  lyrics: z.string().trim().max(8000).default(""),
  audio_url: z.string().url(),
  audio_type: z.enum(["link", "upload"]).default("upload"),
  audio_key: z.string().max(500).nullable().optional(),
  duration_seconds: z.number().int().min(0).max(60 * 60).optional(),
  cover_url: z.string().url().max(1000).optional(),
  is_published: z.boolean().default(true),
});

const TRACK_COLUMNS =
  "id, user_id, title, genre, prompt, lyrics, audio_url, audio_type, art_url, cover_url, duration_seconds, plays, is_published, created_at";

/** Counts one completed public playback without requiring a signed-in user. */
export const incrementTrackPlay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ trackId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: plays, error } = await supabase.rpc("increment_track_play", { _track_id: data.trackId });
    if (error) throw new Error("Could not record track play");
    return { plays: typeof plays === "number" ? plays : null };
  });

/** Public feed: published tracks with their creator handle. */
export const listPublishedTracks = createServerFn({ method: "GET" }).handler(async () => {
  const { createPublicServerClient } = await import("@/lib/supabase-public.server");
  const supabase = createPublicServerClient();
  const { data, error } = await supabase
    .from("tracks")
    .select(TRACK_COLUMNS)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { tracks: [], error: error.message };

  const ids = [...new Set((data ?? []).map((t) => t.user_id))];
  const handles = new Map<string, string>();
  const names = new Map<string, string>();
  const badges = new Map<string, string | null>();
  if (ids.length) {
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, handle, display_name, artist_alias, staff_badge")
      .in("id", ids);
    for (const p of profiles ?? []) {
      if (!p.id) continue;
      handles.set(p.id, p.handle ?? "unknown");
      names.set(p.id, p.artist_alias || p.display_name || p.handle || "");
      badges.set(p.id, p.staff_badge);
    }
  }
  return {
    tracks: (data ?? []).map((t) => ({
      ...t,
      handle: `@${handles.get(t.user_id) ?? "unknown"}`,
      creator_name: names.get(t.user_id) ?? "",
      staff_badge: badges.get(t.user_id) ?? null,
    })),
      error: null as string | null,
  };
});

/** Public: a single published track with its creator handle/name. */
export const getPublicTrackById = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicServerClient();
    const { data: track } = await supabase
      .from("tracks")
      .select(TRACK_COLUMNS)
      .eq("id", data.id)
      .eq("is_published", true)
      .maybeSingle();
    if (!track) return { track: null, artist: null };
    const { data: artist } = await supabase
      .from("public_profiles")
      .select("id, handle, display_name, artist_alias, avatar_url, staff_badge")
      .eq("id", track.user_id)
      .maybeSingle();
    return { track, artist: artist?.id ? { ...artist, id: artist.id, handle: artist.handle ?? "" } : null };
  });

/** Signed-in user's own tracks, published or not. */
export const listMyTracks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tracks")
      .select(TRACK_COLUMNS)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { tracks: data ?? [] };
  });

/** Saves track metadata pointing at an audio file already stored in R2. */
export const createTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => trackInput.parse(input))
  .handler(async ({ data, context }) => {
    if (data.audio_key && (!isSafeOwnedAudioKey(data.audio_key, context.userId) || data.audio_type !== "upload")) {
      throw new Error("Invalid uploaded audio reference");
    }
    const { data: row, error } = await context.supabase
      .from("tracks")
      .insert({
        ...data,
        audio_key: data.audio_key ?? null,
        cover_url: data.cover_url ?? null,
        duration_seconds: data.duration_seconds ?? null,
        user_id: context.userId,
      })
      .select(TRACK_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { track: row };
  });

/**
 * Updates one of the user's own tracks. Audio replacement is committed in a
 * single database transaction with durable cleanup capture.
 */
export const updateTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(120),
        genre: z.string().trim().min(1).max(60),
        prompt: z.string().trim().max(4000).default(""),
        lyrics: z.string().trim().max(8000).default(""),
        audio_url: z.string().url(),
        audio_type: z.enum(["link", "upload"]),
        audio_key: z.string().max(500).nullable().optional(),
        is_published: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, audio_key, ...fields } = data;

    if (audio_key !== undefined) {
      if ((audio_key && !isSafeOwnedAudioKey(audio_key, context.userId)) || (audio_key && data.audio_type !== "upload") || (!audio_key && data.audio_type !== "link")) {
        throw new Error("Invalid uploaded audio reference");
      }

      const { data: result, error } = await context.supabase.rpc(
        "replace_track_with_audio_cleanup",
        {
          _track_id: id,
          _title: fields.title,
          _genre: fields.genre,
          _prompt: fields.prompt,
          _lyrics: fields.lyrics,
          _audio_url: fields.audio_url,
          _audio_type: fields.audio_type,
          _audio_key: audio_key ?? "",
          _is_published: fields.is_published,
        },
      );
      if (error) throw new Error(error.message);

      const payload = result as { track?: unknown; cleanup_id?: string | null } | null;
      if (payload?.cleanup_id) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await cleanTrackStorage(supabaseAdmin, payload.cleanup_id);
      }
      return { track: payload?.track ?? null };
    }

    const { data: row, error } = await context.supabase
      .from("tracks")
      .update(fields)
      .eq("id", id)
      .eq("user_id", context.userId)
      .select(TRACK_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { track: row };
  });
/**
 * Rollback helper: records storage objects that were uploaded for a track that
 * ultimately failed to be created/updated, then processes them through the
 * durable cleanup ledger. Ownership and live-reference checks are server-side.
 */
export const discardUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        audioKey: z.string().max(500).optional(),
        coverPath: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let audioKey: string | null = null;
    let coverPath: string | null = null;

    if (data.audioKey && isSafeOwnedAudioKey(data.audioKey, context.userId)) {
      const { data: inUse, error } = await supabaseAdmin
        .from("tracks")
        .select("id")
        .eq("audio_key", data.audioKey)
        .limit(1);
      if (error) throw new Error(`Could not inspect orphan audio reference: ${error.message}`);
      if (!inUse?.length) audioKey = data.audioKey;
    }

    if (data.coverPath && isSafeOwnedCoverPath(data.coverPath, context.userId)) {
      const { data: coverInUse, error } = await supabaseAdmin
        .from("tracks")
        .select("id")
        .like("cover_url", `%/track-covers/${data.coverPath}`)
        .limit(1);
      if (error) throw new Error(`Could not inspect orphan cover reference: ${error.message}`);
      if (!coverInUse?.length) coverPath = data.coverPath;
    }

    if (!audioKey && !coverPath) return { ok: true };

    const { data: cleanup, error: cleanupError } = await supabaseAdmin
      .from("track_storage_cleanup")
      .insert({
        track_id: null,
        owner_id: context.userId,
        audio_key: audioKey,
        cover_path: coverPath,
        created_by: context.userId,
        cleanup_type: "abandoned_upload",
      })
      .select("id")
      .single();
    if (cleanupError || !cleanup) {
      throw new Error(`Orphaned upload cleanup could not be queued: ${cleanupError?.message ?? "no cleanup id returned"}`);
    }

    if (coverPath) {
      const { error: lockError } = await supabaseAdmin
        .from("track_cover_cleanup_locks")
        .insert({ cover_path: coverPath, cleanup_id: cleanup.id });
      if (lockError) {
        await supabaseAdmin
          .from("track_storage_cleanup")
          .update({ cover_path: null, last_error: "cover reservation unavailable; cover skipped" })
          .eq("id", cleanup.id);
      }
    }

    await cleanTrackStorage(supabaseAdmin, cleanup.id);
    return { ok: true };
  });
/** Deletes one of the user's own tracks (and its audio file). */
export const deleteTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("delete_track_with_cleanup", { _track_id: data.id });
    if (error) throw new Error(error.message);

    const cleanupId = (result as { cleanup_id?: string | null } | null)?.cleanup_id ?? null;
    if (cleanupId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await cleanTrackStorage(supabaseAdmin, cleanupId);
    }
    return { ok: true, storageCleanupPending: false };
  });


// Validate the dedicated RPC contract until generated types are refreshed.
// Zod strips unexpected fields so only the existing public projection leaves here.
const trendingRows = z.array(z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  genre: z.string(),
  prompt: z.string(),
  lyrics: z.string(),
  audio_url: z.string(),
  audio_type: z.string(),
  art_url: z.string().nullable(),
  cover_url: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  plays: z.number(),
  is_published: z.literal(true),
  created_at: z.string(),
  likes: z.number().int().nonnegative(),
})).max(100);

/** Public trending feed: published tracks ranked by likes + plays. */
export const listTrendingTracks = createServerFn({ method: "GET" }).handler(async () => {
  const { createPublicServerClient } = await import("@/lib/supabase-public.server");
  const supabase = createPublicServerClient();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("list_trending_tracks");
  const parsed = trendingRows.safeParse(data);
  if (error || !parsed.success) {
    return { tracks: [], error: "Trending is temporarily unavailable. Please try again later." };
  }

  const rows = parsed.data;
  const ids = [...new Set(rows.map((t) => t.user_id))];
  const handles = new Map<string, string>();
  const names = new Map<string, string>();
  const badges = new Map<string, string | null>();
  if (ids.length) {
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, handle, display_name, artist_alias, staff_badge")
      .in("id", ids);
    for (const p of profiles ?? []) {
      if (!p.id) continue;
      handles.set(p.id, p.handle ?? "unknown");
      names.set(p.id, p.artist_alias || p.display_name || p.handle || "");
      badges.set(p.id, p.staff_badge);
    }
  }

  const tracks = rows
    .map((t) => ({
      ...t,
      handle: `@${handles.get(t.user_id) ?? "unknown"}`,
      creator_name: names.get(t.user_id) ?? "",
      staff_badge: badges.get(t.user_id) ?? null,
    }));

  return { tracks, error: null as string | null };
});

/** Tracks the signed-in user has liked. */
export const listLikedTracks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: likes, error } = await context.supabase
      .from("likes")
      .select("track_id, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const ids = (likes ?? []).map((l) => l.track_id);
    if (!ids.length) return { tracks: [] };

    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicServerClient();
    const { data: tracks } = await supabase
      .from("tracks")
      .select(TRACK_COLUMNS)
      .in("id", ids)
      .eq("is_published", true);

    const rows = tracks ?? [];
    const userIds = [...new Set(rows.map((t) => t.user_id))];
    const handles = new Map<string, string>();
    if (userIds.length) {
      const { data: profiles } = await supabase.from("public_profiles").select("id, handle").in("id", userIds);
      for (const p of profiles ?? []) { if (p.id) handles.set(p.id, p.handle ?? "unknown"); }
    }
    const order = new Map(ids.map((id, i) => [id, i]));
    return {
      tracks: rows
        .map((t) => ({ ...t, handle: `@${handles.get(t.user_id) ?? "unknown"}` }))
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
    };
  });
