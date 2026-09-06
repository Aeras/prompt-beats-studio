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
    const { data: deleted, error } = await context.supabase
      .from("tracks")
      .delete()
      .eq("id", data.id)
      .select("audio_key");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("Track not found or you don't have permission to delete it.");
    }
    const audioKey = (deleted[0] as { audio_key?: string | null }).audio_key;
    if (audioKey) {
      const { deleteFromR2 } = await import("@/lib/r2.server");
      await deleteFromR2(audioKey);
    }
    return { ok: true };
  });
