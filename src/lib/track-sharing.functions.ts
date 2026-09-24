import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";

const shareLinkInput = z.object({
  trackId: z.string().uuid(),
  includePrompt: z.boolean().default(false),
  includeLyrics: z.boolean().default(false),
});

export const createTrackShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => shareLinkInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "sharing_public_links");
    const { data: result, error } = await (context.supabase as any).rpc("create_track_share_link", {
      _track_id: data.trackId,
      _include_prompt: data.includePrompt,
      _include_lyrics: data.includeLyrics,
    } as never);
    if (error) throw new Error(error.message);
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
        shareId: z.string().uuid(),
        includePrompt: z.boolean(),
        includeLyrics: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "sharing_public_links");
    const { error } = await (context.supabase as any).rpc("update_track_share_link", {
      _share_id: data.shareId,
      _include_prompt: data.includePrompt,
      _include_lyrics: data.includeLyrics,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const revokeTrackShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ shareId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "sharing_public_links");
    const { error } = await (context.supabase as any).rpc("revoke_track_share_link", {
      _share_id: data.shareId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const recordTrackPublicShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ trackId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "sharing_public_links");
    const { error } = await (context.supabase as any).rpc("record_track_public_share", {
      _track_id: data.trackId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getTrackShareByToken = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(20).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin as any).rpc("get_track_share_by_token", {
      _token: data.token,
    } as never);
    if (error) throw new Error(error.message);

    if ((result as any)?.state === "active" && (result as any)?.track) {
      const { hydrateTrackAudioUrl } = await import("@/lib/track-audio-playback.server");
      (result as any).track = await hydrateTrackAudioUrl((result as any).track, 60 * 60);
    }

    return result as
      | { state: "unavailable" }
      | { state: "private"; track_id: string; title: string }
      | {
          state: "active";
          share_id: string;
          track: {
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
          artist: {
            id: string;
            handle: string | null;
            display_name: string | null;
            artist_alias: string | null;
            avatar_url: string | null;
            staff_badge: string | null;
          } | null;
        };
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
    await requireFeatureAccess(context.supabase, "sharing_public_links");
    const { data, error } = await (context.supabase as any).rpc("list_my_share_management");
    if (error) throw new Error(error.message);
    return { tracks: (Array.isArray(data) ? data : []) as ShareManagementTrack[] };
  });
