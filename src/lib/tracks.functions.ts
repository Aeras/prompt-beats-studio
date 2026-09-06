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
  if (ids.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, handle, display_name, artist_alias")
      .in("id", ids);
    for (const p of profiles ?? []) {
      handles.set(p.id, p.handle);
      names.set(p.id, p.artist_alias || p.display_name || p.handle);
    }
  }
  return {
    tracks: (data ?? []).map((t) => ({
      ...t,
      handle: `@${handles.get(t.user_id) ?? "unknown"}`,
      creator_name: names.get(t.user_id) ?? "",
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
      .from("profiles")
      .select("id, handle, display_name, artist_alias, avatar_url")
      .eq("id", track.user_id)
      .maybeSingle();
    return { track, artist: artist ?? null };
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

/** Updates one of the user's own tracks (RLS restricts this to the owner). */
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
        is_published: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...fields } = data;
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
  if (ids.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, handle, display_name, artist_alias")
      .in("id", ids);
    for (const p of profiles ?? []) {
      handles.set(p.id, p.handle);
      names.set(p.id, p.artist_alias || p.display_name || p.handle);
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
      const { data: profiles } = await supabase.from("profiles").select("id, handle").in("id", userIds);
      for (const p of profiles ?? []) handles.set(p.id, p.handle);
    }
    const order = new Map(ids.map((id, i) => [id, i]));
    return {
      tracks: rows
        .map((t) => ({ ...t, handle: `@${handles.get(t.user_id) ?? "unknown"}` }))
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
    };
  });
