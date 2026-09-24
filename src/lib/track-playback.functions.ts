import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

export const getTrackPlaybackUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ trackId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const [{ supabaseAdmin }, { getUserIdFromRequest }, { isSafeOwnedAudioKey }] =
      await Promise.all([
        import("@/integrations/supabase/client.server"),
        import("@/lib/supabase-public.server"),
        import("@/lib/storage-paths"),
      ]);
    const request = getRequest();
    const viewerId = request ? await getUserIdFromRequest(request) : null;
    const { data: track, error } = await (supabaseAdmin.from("tracks") as any)
      .select("id, user_id, source_type, audio_url, audio_key, is_published, moderation_status")
      .eq("id", data.trackId)
      .maybeSingle();

    if (error || !track || track.moderation_status !== "active") {
      throw new Error("Track is unavailable");
    }
    if (track.is_published !== true && track.user_id !== viewerId) {
      throw new Error("Track is private");
    }

    if (track.source_type !== "upload") {
      if (typeof track.audio_url !== "string" || !track.audio_url) {
        throw new Error("Track audio is unavailable");
      }
      return { audioUrl: track.audio_url };
    }

    if (
      typeof track.user_id !== "string" ||
      typeof track.audio_key !== "string" ||
      !isSafeOwnedAudioKey(track.audio_key, track.user_id)
    ) {
      throw new Error("Track audio is unavailable");
    }

    const { createSignedR2GetUrl } = await import("@/lib/r2.server");
    return { audioUrl: await createSignedR2GetUrl(track.audio_key) };
  });
