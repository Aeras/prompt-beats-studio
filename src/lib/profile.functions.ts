import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROFILE_COLUMNS =
  "id, handle, display_name, artist_alias, avatar_url, bio, website_url, instagram_url, tiktok_url, youtube_url, x_url, profile_completed";

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
    const patch: Record<string, unknown> = { profile_completed: data.profile_completed };
    if (data.artist_alias !== undefined) {
      patch['artist_alias'] = data.artist_alias;
      if (data.artist_alias) patch['display_name'] = data.artist_alias;
    }
    if (data.bio !== undefined) patch['bio'] = data.bio;
    if (data.avatar_url !== undefined) patch['avatar_url'] = data.avatar_url;
    for (const key of ["website_url", "instagram_url", "tiktok_url", "youtube_url", "x_url"] as const) {
      patch[key] = data[key] ?? null;
    }

    const { error } = await context.supabase.from("profiles").update(patch).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
