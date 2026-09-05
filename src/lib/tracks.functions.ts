import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const trackInput = z.object({
  title: z.string().trim().min(1).max(120),
  genre: z.string().trim().min(1).max(60).default("Other"),
  prompt: z.string().trim().max(4000).default(""),
  lyrics: z.string().trim().max(8000).default(""),
  audio_url: z.string().url(),
  audio_type: z.enum(["link", "upload"]).default("upload"),
  audio_key: z.string().max(500).optional(),
  duration_seconds: z.number().int().min(0).max(60 * 60).optional(),
  is_published: z.boolean().default(true),
});

const TRACK_COLUMNS =
  "id, user_id, title, genre, prompt, lyrics, audio_url, audio_type, art_url, duration_seconds, plays, is_published, created_at";

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
  if (ids.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, handle").in("id", ids);
    for (const p of profiles ?? []) handles.set(p.id, p.handle);
  }
  return {
    tracks: (data ?? []).map((t) => ({ ...t, handle: `@${handles.get(t.user_id) ?? "unknown"}` })),
    error: null as string | null,
  };
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
        duration_seconds: data.duration_seconds ?? null,
        user_id: context.userId,
      })
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
    const { data: row } = await context.supabase
      .from("tracks")
      .select("audio_key")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("tracks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (row?.audio_key) {
      const { deleteFromR2 } = await import("@/lib/r2.server");
      await deleteFromR2(row.audio_key);
    }
    return { ok: true };
  });
