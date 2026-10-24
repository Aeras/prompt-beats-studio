import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSafeOwnedAudioKey } from "@/lib/storage-paths";

const trackIdInput = z.object({ trackId: z.string().guid() });

function downloadFileName(title: string, audioKey: string) {
  const extension = audioKey.toLowerCase().endsWith(".wav") ? "wav" : "mp3";
  const safe =
    title
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 100) || "promptbeats-track";
  return `${safe}.${extension}`;
}

export const getTrackDownloadPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => trackIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: track, error } = await (context.supabase.from("tracks") as any)
      .select("id, user_id, source_type, allow_download")
      .eq("id", data.trackId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!track || track.user_id !== context.userId)
      throw new Error("Track not found or you do not have permission to edit it");
    return { allowDownload: track.source_type === "upload" && track.allow_download === true };
  });

export const getTrackDownloadAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ trackIds: z.array(z.string().guid()).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ids = [...new Set(data.trackIds)];
    if (!ids.length) return { allowed: {} as Record<string, boolean> };
    const { data: tracks, error } = await (context.supabase.from("tracks") as any)
      .select("id, user_id, source_type, is_published, allow_download")
      .in("id", ids);
    if (error) throw new Error(error.message);
    const allowed: Record<string, boolean> = {};
    for (const track of tracks ?? []) {
      allowed[track.id] =
        track.source_type === "upload" &&
        (track.user_id === context.userId ||
          (track.is_published === true && track.allow_download === true));
    }
    return { allowed };
  });

export const setTrackDownloadPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ trackId: z.string().guid(), allowDownload: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: track, error: readError } = await (context.supabase.from("tracks") as any)
      .select("id, user_id, source_type")
      .eq("id", data.trackId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!track || track.user_id !== context.userId)
      throw new Error("Track not found or you do not have permission to edit it");
    if (track.source_type !== "upload" && data.allowDownload)
      throw new Error("Download permission is only available for uploaded tracks");

    const { error } = await (context.supabase.from("tracks") as any)
      .update({ allow_download: track.source_type === "upload" ? data.allowDownload : false })
      .eq("id", data.trackId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return {
      ok: true as const,
      allowDownload: track.source_type === "upload" ? data.allowDownload : false,
    };
  });

export const downloadTrackAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => trackIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: track, error } = await (context.supabase.from("tracks") as any)
      .select("id, user_id, title, source_type, audio_key, is_published, allow_download")
      .eq("id", data.trackId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!track || track.source_type !== "upload" || !track.audio_key)
      throw new Error("Track audio is unavailable");

    const isOwner = track.user_id === context.userId;
    if (!isOwner && (!track.is_published || track.allow_download !== true))
      throw new Error("Download is not allowed for this track");
    if (!isSafeOwnedAudioKey(track.audio_key, track.user_id))
      throw new Error("Invalid track audio reference");

    const { buildR2ObjectUrl, getR2Client } = await import("@/lib/r2.server");
    const fileName = downloadFileName(track.title as string, track.audio_key as string);
    const unsignedUrl = new URL(buildR2ObjectUrl(track.audio_key));
    unsignedUrl.searchParams.set("X-Amz-Expires", "300");
    unsignedUrl.searchParams.set(
      "response-content-disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    const signedRequest = await getR2Client().sign(new Request(unsignedUrl, { method: "GET" }), {
      aws: { signQuery: true },
    });

    return {
      downloadUrl: signedRequest.url,
      fileName,
    };
  });
