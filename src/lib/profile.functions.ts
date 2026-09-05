import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROFILE_COLUMNS =
  "id, handle, display_name, artist_alias, avatar_url, bio, website_url, instagram_url, tiktok_url, youtube_url, x_url, profile_completed, donation_provider, donation_url, donation_custom_name";

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((v) => (v && v.length ? v : null));

const profileInput = z.object({
  artist_alias: z.string().trim().max(60).optional(),
  bio: z.string().trim().max(500).optional(),
  avatar_url: z.string().trim().max(1000).optional(),
  website_url: optionalUrl,
  instagram_url: optionalUrl,
  tiktok_url: optionalUrl,
  youtube_url: optionalUrl,
  x_url: optionalUrl,
  donation_provider: z.enum(["paypal", "revolut", "custom"]).nullish(),
  donation_url: z.string().trim().max(300).nullish(),
  donation_custom_name: z.string().trim().max(60).nullish(),
  profile_completed: z.boolean().default(false),
});

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { profile: data };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => profileInput.parse(input))
  .handler(async ({ data, context }) => {
    const patch: Record<string, any> = { profile_completed: data.profile_completed };
    if (data.artist_alias !== undefined) {
      patch['artist_alias'] = data.artist_alias;
      if (data.artist_alias) patch['display_name'] = data.artist_alias;
    }
    if (data.bio !== undefined) patch['bio'] = data.bio;
    if (data.avatar_url !== undefined) patch['avatar_url'] = data.avatar_url;
    for (const key of ["donation_provider", "donation_url", "donation_custom_name"] as const) {
      if (data[key] !== undefined) patch[key] = data[key] || null;
    }
    for (const key of ["website_url", "instagram_url", "tiktok_url", "youtube_url", "x_url"] as const) {
      patch[key] = data[key] ?? null;
    }

    const { error } = await context.supabase.from("profiles").update(patch as never).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Public artist page data by profile id, including track prompts. */
export const getPublicArtistById = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicServerClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (!profile) return { profile: null, tracks: [] };
    const { data: tracks } = await supabase
      .from("tracks")
      .select("id, title, genre, prompt, audio_url, audio_type, created_at")
      .eq("user_id", profile.id)
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(100);
    return { profile, tracks: tracks ?? [] };
  });

/** Public creator page data by handle (no auth required). */
export const getPublicProfile = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ handle: z.string().trim().min(1).max(60) }).parse(input))
  .handler(async ({ data }) => {
    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicServerClient();
    const handle = data.handle.replace(/^@/, "").toLowerCase();
    const { data: profile } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("handle", handle)
      .maybeSingle();
    if (!profile) return { profile: null, tracks: [] };
    const { data: tracks } = await supabase
      .from("tracks")
      .select("id, title, genre, audio_url, audio_type, created_at")
      .eq("user_id", profile.id)
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(50);
    return { profile, tracks: tracks ?? [] };
  });
