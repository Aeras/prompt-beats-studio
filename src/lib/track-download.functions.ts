import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSafeOwnedAudioKey } from "@/lib/storage-paths";

const trackIdInput = z.object({ trackId: z.string().uuid() });

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
    z.object({ trackIds: z.array(z.string().uuid()).max(100) }).parse(input),
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
    z.object({ trackId: z.string().uuid(), allowDownload: z.boolean() }).parse(input),
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

    const { getR2Client, getR2Config } = await import("@/lib/r2.server");
    const { endpoint, bucket } = getR2Config();
    const response = await getR2Client().fetch(`${endpoint}/${bucket}/${track.audio_key}`);
    if (!response.ok) throw new Error(`Track download failed (${response.status})`);

    const arrayBuffer = await response.arrayBuffer();
    const mimeType =
      response.headers.get("content-type") ||
      (track.audio_key.endsWith(".wav") ? "audio/wav" : "audio/mpeg");
    return {
      audioBase64: Buffer.from(arrayBuffer).toString("base64"),
      mimeType,
      title: track.title as string,
    };
  });
