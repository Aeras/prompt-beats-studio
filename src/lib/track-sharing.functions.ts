import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import { throwSafeServerError } from "@/lib/server-error";

const shareLinkInput = z.object({
  trackId: z.string().guid(),
  includePrompt: z.boolean().default(false),
  includeLyrics: z.boolean().default(false),
});

type ActiveSharedTrack = {
  id: string;
  user_id: string;
  title: string;
  genre: string;
  prompt: string;
  lyrics: string;
  prompt_is_public: boolean;
  lyrics_is_public: boolean;
  contains_explicit_lyrics: boolean;
  audio_url: string;
  audio_type: string;
  source_type: string;
  source_url: string | null;
  source_id: string | null;
  created_with: string | null;
  allow_download: boolean;
  art_url: string | null;
  cover_url: string | null;
  duration_seconds: number | null;
  plays: number;
  is_published: boolean;
  created_at: string;
};

type TrackShareLookup =
  | { state: "unavailable" }
  | { state: "private"; track_id: string; title: string }
  | {
      state: "active";
      share_id: string;
      track: ActiveSharedTrack;
      artist: {
        id: string;
        handle: string | null;
        display_name: string | null;
        artist_alias: string | null;
        avatar_url: string | null;
        staff_badge: string | null;
      } | null;
    };

export const createTrackShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => shareLinkInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "sharing_public_links");
    const { data: result, error } = await context.supabase.rpc("create_track_share_link", {
      _track_id: data.trackId,
      _include_prompt: data.includePrompt,
      _include_lyrics: data.includeLyrics,
    });
    if (error)
      throwSafeServerError(
        "track-sharing:create",
        error,
        "The share link could not be created. Please try again.",
      );
    return result as {
      id: string;
      token: string;
      track_id: string;
      include_prompt: boolean;
      include_lyrics: boolean;
      created_at: string;
    };
  });

export const updateTrackShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        shareId: z.string().guid(),
        includePrompt: z.boolean(),
        includeLyrics: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "sharing_public_links");
    const { error } = await context.supabase.rpc("update_track_share_link", {
      _share_id: data.shareId,
      _include_prompt: data.includePrompt,
      _include_lyrics: data.includeLyrics,
    });
    if (error)
      throwSafeServerError(
        "track-sharing:update",
        error,
        "The share settings could not be updated. Please try again.",
      );
    return { ok: true as const };
  });

export const revokeTrackShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ shareId: z.string().guid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("revoke_track_share_link", {
      _share_id: data.shareId,
    });
    if (error)
      throwSafeServerError(
        "track-sharing:revoke",
        error,
        "The share link could not be revoked. Please try again.",
      );
    return { ok: true as const };
  });

export const recordTrackPublicShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ trackId: z.string().guid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "sharing_public_links");
    const { error } = await context.supabase.rpc("record_track_public_share", {
      _track_id: data.trackId,
    });
    if (error)
      throwSafeServerError(
        "track-sharing:record-public-share",
        error,
        "The share could not be recorded. Please try again.",
      );
    return { ok: true as const };
  });

export const getTrackShareByToken = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(20).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rawResult, error } = await supabaseAdmin.rpc("get_track_share_by_token", {
      _token: data.token,
    });
    if (error)
      throwSafeServerError(
        "track-sharing:lookup",
        error,
        "This shared track could not be loaded. Please try again.",
      );

    const result = rawResult as TrackShareLookup;
    if (result.state === "active" && result.track) {
      const { hydrateTrackAudioUrl } = await import("@/lib/track-audio-playback.server");
      result.track = (await hydrateTrackAudioUrl(result.track, 60 * 60)) as ActiveSharedTrack;
    }

    return result;
  });

export type ShareManagementLink = {
  id: string;
  token: string;
  include_prompt: boolean;
  include_lyrics: boolean;
  created_at: string;
  last_opened_at: string | null;
  open_count: number;
  revoked_at: string | null;
};

export type ShareManagementTrack = {
  track_id: string;
  title: string;
  cover_url: string | null;
  art_url: string | null;
  is_published: boolean;
  prompt_is_public: boolean;
  lyrics_is_public: boolean;
  created_at: string;
  public_share_count: number;
  last_public_share_at: string | null;
  owner_links: ShareManagementLink[];
};

export const listMyShareManagement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_my_share_management");
    if (error)
      throwSafeServerError(
        "track-sharing:list",
        error,
        "Share management could not be loaded. Please try again.",
      );
    return { tracks: (Array.isArray(data) ? data : []) as ShareManagementTrack[] };
  });
