import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getSafeExternalUrl, type SupportedSocialPlatform } from "@/lib/safe-external-url";

const PROFILE_COLUMNS =
  "id, handle, display_name, artist_alias, avatar_url, bio, website_url, instagram_url, tiktok_url, youtube_url, x_url, profile_completed, donation_provider, donation_url, donation_custom_name";

/** Safe public projection: no moderation/internal fields (anon role is column-restricted). */
const PUBLIC_PROFILE_COLUMNS =
  "id, handle, display_name, artist_alias, avatar_url, bio, website_url, instagram_url, tiktok_url, youtube_url, x_url, donation_provider, donation_url, donation_custom_name, staff_badge";

export type PublicCreatorSearchResult = {
  id: string;
  handle: string | null;
  display_name: string | null;
  artist_alias: string | null;
  avatar_url: string | null;
  staff_badge: string | null;
};

const optionalUrl = (platform?: SupportedSocialPlatform) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || null : value),
    z
      .string()
      .max(300)
      .nullable()
      .optional()
      .refine((value) => !value || Boolean(getSafeExternalUrl(value, platform)), {
        message: "Enter a valid HTTP(S) URL.",
      })
      .transform((value) => (value ? getSafeExternalUrl(value, platform) : null)),
  );
const profileInput = z.object({
  artist_alias: z.string().trim().max(60).optional(),
  bio: z.string().trim().max(500).optional(),
  avatar_url: z.string().trim().max(1000).optional(),
  website_url: optionalUrl(),
  instagram_url: optionalUrl("instagram"),
  tiktok_url: optionalUrl("tiktok"),
  youtube_url: optionalUrl("youtube"),
  x_url: optionalUrl("x"),
  donation_provider: z.enum(["paypal", "revolut", "custom"]).nullish(),
  donation_url: optionalUrl(),
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

    const { data: profile, error } = await context.supabase
      .from("profiles")
      .update(patch as never)
      .eq("id", context.userId)
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, profile };
  });

/** Public artist page data by profile id, including track prompts. */
export const getPublicArtistById = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicServerClient();
    const { data: profile } = await supabase
      .from("public_profiles")
      .select(PUBLIC_PROFILE_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (!profile?.id) return { profile: null, tracks: [] };
    const { data: tracks } = await supabase
      .from("tracks")
      .select("id, user_id, title, genre, prompt, lyrics, audio_url, audio_type, source_type, source_url, source_id, art_url, cover_url, created_with, allow_download, duration_seconds, is_published, created_at")
      .eq("user_id", profile.id)
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(100);
    return { profile: { ...profile, id: profile.id, handle: profile.handle ?? "" }, tracks: tracks ?? [] };
  });

/** Public artist page data by vanity handle, including track prompts. */
export const getPublicArtistByHandle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ handle: z.string().trim().min(1).max(60) }).parse(input))
  .handler(async ({ data }) => {
    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicServerClient();
    const handle = data.handle.replace(/^@/, "").toLowerCase();
    const { data: profile } = await supabase
      .from("public_profiles")
      .select(PUBLIC_PROFILE_COLUMNS)
      .eq("handle", handle)
      .maybeSingle();
    if (!profile?.id) return { profile: null, tracks: [] };
    const { data: tracks } = await supabase
      .from("tracks")
      .select("id, user_id, title, genre, prompt, lyrics, audio_url, audio_type, source_type, source_url, source_id, art_url, cover_url, created_with, allow_download, duration_seconds, is_published, created_at")
      .eq("user_id", profile.id)
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(100);
    return { profile: { ...profile, id: profile.id, handle: profile.handle ?? "" }, tracks: tracks ?? [] };
  });


/** Public creator page data by handle (no auth required). */
export const getPublicProfile = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ handle: z.string().trim().min(1).max(60) }).parse(input))
  .handler(async ({ data }) => {
    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicServerClient();
    const handle = data.handle.replace(/^@/, "").toLowerCase();
    const { data: profile } = await supabase
      .from("public_profiles")
      .select(PUBLIC_PROFILE_COLUMNS)
      .eq("handle", handle)
      .maybeSingle();
    if (!profile?.id) return { profile: null, tracks: [] };
    const { data: tracks } = await supabase
      .from("tracks")
      .select("id, title, genre, audio_url, audio_type, source_type, source_url, source_id, art_url, cover_url, created_with, allow_download, duration_seconds, is_published, created_at")
      .eq("user_id", profile.id)
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(50);
    return { profile: { ...profile, id: profile.id, handle: profile.handle ?? "" }, tracks: tracks ?? [] };
  });

/** Public creator search: returns only the safe identity projection. */
export const searchPublicCreators = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ query: z.string().trim().max(80) }).parse(input))
  .handler(async ({ data }) => {
    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicServerClient();
    const term = data.query.replace(/^@+/, "").trim();
    if (!term) return { creators: [] as PublicCreatorSearchResult[] };

    const columns = "id, handle, display_name, artist_alias, avatar_url, staff_badge";
    const escapedTerm = term.replace(/[\\%_]/g, "\\$&");
    const pattern = `%${escapedTerm}%`;
    const [nameResult, handleResult] = await Promise.all([
      supabase.from("public_profiles").select(columns).ilike("display_name", pattern).limit(25),
      supabase.from("public_profiles").select(columns).ilike("handle", pattern).limit(25),
    ]);
    if (nameResult.error) throw new Error(nameResult.error.message);
    if (handleResult.error) throw new Error(handleResult.error.message);

    const creators = new Map<string, PublicCreatorSearchResult>();
    for (const profile of [...(nameResult.data ?? []), ...(handleResult.data ?? [])]) {
      if (profile.id && profile.handle) creators.set(profile.id, profile);
    }
    return { creators: [...creators.values()].slice(0, 25) };
  });

/** Public: real-time signup availability check for handle and display name. */
export const checkSignupAvailability = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        handle: z.string().trim().max(40).optional(),
        displayName: z.string().trim().max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicServerClient();
    const handle = (data.handle ?? "").replace(/^@/, "").toLowerCase();
    const displayName = (data.displayName ?? "").trim();

    let handleTaken = false;
    let displayNameTaken = false;

    if (handle.length >= 3) {
      const { data: row } = await supabase.from("public_profiles").select("id").eq("handle", handle).maybeSingle();
      handleTaken = Boolean(row);
    }
    if (displayName.length >= 2) {
      const { data: rows } = await supabase
        .from("public_profiles")
        .select("id")
        .ilike("display_name", displayName)
        .limit(1);
      displayNameTaken = Boolean(rows && rows.length > 0);
    }
    return { handleTaken, displayNameTaken };
  });

/** Server-side preflight for the restricted registration list. */
export const checkSignupRegistration = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ email: z.string().trim().email() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const normalizedEmail = data.email.trim().toLowerCase();
    const { data: block, error } = await supabaseAdmin
      .from("registration_blocks")
      .select("id")
      .eq("email_normalized", normalizedEmail)
      .maybeSingle();
    if (error) throw new Error("Unable to verify registration availability. Please try again.");
    return { blocked: Boolean(block) };
  });
