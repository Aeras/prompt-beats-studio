import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { isSafeOwnedAudioKey } from "@/lib/storage-paths";

const querySchema = z.object({ trackId: z.string().uuid() });

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

export const Route = createFileRoute("/api/track-download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getUserIdFromRequest } = await import("@/lib/supabase-public.server");
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const userId = await getUserIdFromRequest(request);
        if (!userId || !token) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const parsed = querySchema.safeParse({
          trackId: new URL(request.url).searchParams.get("trackId"),
        });
        if (!parsed.success) {
          return Response.json({ error: "Invalid track download request" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: track, error } = await supabaseAdmin
          .from("tracks")
          .select(
            "id, user_id, title, source_type, audio_key, is_published, allow_download, moderation_status",
          )
          .eq("id", parsed.data.trackId)
          .maybeSingle();

        if (error) {
          return Response.json({ error: "Track download is unavailable" }, { status: 500 });
        }
        if (!track || track.source_type !== "upload" || !track.audio_key) {
          return Response.json({ error: "Track audio is unavailable" }, { status: 404 });
        }
        if (track.moderation_status !== "active") {
          return Response.json({ error: "Track audio is unavailable" }, { status: 404 });
        }

        const isOwner = track.user_id === userId;
        if (!isOwner && (track.is_published !== true || track.allow_download !== true)) {
          return Response.json(
            { error: "Download is not allowed for this track" },
            { status: 403 },
          );
        }
        if (!isSafeOwnedAudioKey(track.audio_key, track.user_id)) {
          return Response.json({ error: "Invalid track audio reference" }, { status: 403 });
        }

        const { getR2Client, getR2Config } = await import("@/lib/r2.server");
        const { endpoint, bucket } = getR2Config();
        const r2Response = await getR2Client().fetch(`${endpoint}/${bucket}/${track.audio_key}`);
        if (!r2Response.ok || !r2Response.body) {
          return Response.json({ error: "Track download is unavailable" }, { status: 502 });
        }

        const mimeType =
          r2Response.headers.get("content-type") ||
          (track.audio_key.toLowerCase().endsWith(".wav") ? "audio/wav" : "audio/mpeg");
        const headers = new Headers({
          "cache-control": "private, no-store",
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
            downloadFileName(track.title, track.audio_key),
          )}`,
          "content-type": mimeType,
          "x-content-type-options": "nosniff",
        });
        const contentLength = r2Response.headers.get("content-length");
        if (contentLength) headers.set("content-length", contentLength);

        return new Response(r2Response.body, { status: 200, headers });
      },
    },
  },
});
