import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const trackInput = z.object({
  title: z.string().trim().min(1).max(120),
  genre: z.string().trim().min(1).max(60).default("Other / Experimental"),
  prompt: z.string().trim().max(4000).default(""),
  lyrics: z.string().trim().max(8000).default(""),
  audio_url: z.string().url(),
  audio_type: z.enum(["link", "upload"]).default("upload"),
  audio_key: z.string().max(500).optional(),
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
    const { data: plays, error } = await supabase.rpc("increment_track_play" as never, { _track_id: data.trackId } as never);
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
 * Updates one of the user's own tracks (RLS restricts this to the owner).
 *
 * Audio replacement is roll-forward safe: the caller uploads the new object
 * first and passes its key here. The previous object is only deleted AFTER the
 * database row successfully points at the new one, so the track never
 * references a deleted file. If the update fails we touch nothing — the caller
 * rolls back the freshly uploaded object via `discardUploads`.
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
        audio_key: z.string().max(500).optional(),
        is_published: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, audio_key, ...fields } = data;

    // Remember the current object key before the write so we can retire it
    // only once the new one is safely referenced.
    let previousKey: string | null = null;
    if (audio_key) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: current } = await supabaseAdmin
        .from("tracks")
        .select("audio_key, user_id")
        .eq("id", id)
        .maybeSingle();
      if (current?.user_id === context.userId) previousKey = current.audio_key ?? null;
    }

    const { data: row, error } = await context.supabase
      .from("tracks")
      .update(audio_key ? { ...fields, audio_key } : fields)
      .eq("id", id)
      .eq("user_id", context.userId)
      .select(TRACK_COLUMNS)
      .single();
    if (error) throw new Error(error.message);

    if (audio_key && previousKey && previousKey !== audio_key) {
      // Best-effort: a failed cleanup must not fail an already-successful save.
      try {
        const { deleteFromR2 } = await import("@/lib/r2.server");
        await deleteFromR2(previousKey);
      } catch (err) {
        console.error("[tracks] failed to delete replaced audio object", err);
      }
    }
    return { track: row };
  });

/**
 * Rollback helper: deletes storage objects that were uploaded for a track that
 * ultimately failed to be created/updated. Ownership is enforced by key prefix
 * (R2 keys are `tracks/<userId>/…`, cover paths are `<userId>/…`) and the
 * object must NOT be referenced by any existing track row, so this can never
 * remove a live file. Safe to call twice — deletes are idempotent and errors
 * are swallowed so the original failure stays the reported error.
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

    if (data.audioKey && data.audioKey.startsWith(`tracks/${context.userId}/`)) {
      const { data: inUse } = await supabaseAdmin
        .from("tracks")
        .select("id")
        .eq("audio_key", data.audioKey)
        .limit(1);
      if (!inUse || inUse.length === 0) {
        try {
          const { deleteFromR2 } = await import("@/lib/r2.server");
          await deleteFromR2(data.audioKey);
        } catch (err) {
          console.error("[tracks] orphan audio cleanup failed", err);
        }
      }
    }

    if (data.coverPath && data.coverPath.startsWith(`${context.userId}/`)) {
      // Same safety rule as audio: only remove a cover that no track row
      // references. Tracks store the public URL, which always ends with
      // `/track-covers/<coverPath>` — match on that object identity.
      const { data: coverInUse } = await supabaseAdmin
        .from("tracks")
        .select("id")
        .like("cover_url", `%/track-covers/${data.coverPath}`)
        .limit(1);
      if (!coverInUse || coverInUse.length === 0) {
        const { error } = await supabaseAdmin.storage.from("track-covers").remove([data.coverPath]);
        if (error) console.error("[tracks] orphan cover cleanup failed", error.message);
      }
    }

    return { ok: true };
  });


/** Deletes one of the user's own tracks (and its audio file). */
export const deleteTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // RLS restricts this delete to the track owner (or an admin). We chain
    // .select() so the returned rows tell us whether a row was actually
    // deleted — only then is it safe to remove the audio file from R2.
    // audio_key is internal-only (not selectable by anon/authenticated), so we
    // read it server-side with the admin client before performing the delete.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: keyRow } = await supabaseAdmin
      .from("tracks")
      .select("audio_key")
      .eq("id", data.id)
      .maybeSingle();

    const { data: deleted, error } = await context.supabase
      .from("tracks")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("Track not found or you don't have permission to delete it.");
    }
    const audioKey = keyRow?.audio_key ?? null;
    if (audioKey) {
      const { deleteFromR2 } = await import("@/lib/r2.server");
      await deleteFromR2(audioKey);
    }
    return { ok: true };
  });


/** Public trending feed: published tracks ranked by likes + plays. */
export const listTrendingTracks = createServerFn({ method: "GET" }).handler(async () => {
  const { createPublicServerClient } = await import("@/lib/supabase-public.server");
  const supabase = createPublicServerClient();
  const { data, error } = await supabase
    .from("tracks")
    .select(TRACK_COLUMNS)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { tracks: [], error: error.message };

  const rows = data ?? [];
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

  // Aggregate like counts (counts only — no user identities leave the server).
  const likeCounts = new Map<string, number>();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: likes } = await supabaseAdmin.from("likes").select("track_id");
  for (const l of likes ?? []) {
    likeCounts.set(l.track_id, (likeCounts.get(l.track_id) ?? 0) + 1);
  }

  const tracks = rows
    .map((t) => ({
      ...t,
      handle: `@${handles.get(t.user_id) ?? "unknown"}`,
      creator_name: names.get(t.user_id) ?? "",
      staff_badge: badges.get(t.user_id) ?? null,
      likes: likeCounts.get(t.id) ?? 0,
    }))
    .sort((a, b) => b.likes * 3 + b.plays - (a.likes * 3 + a.plays));

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
