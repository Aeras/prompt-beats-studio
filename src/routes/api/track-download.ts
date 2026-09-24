import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const querySchema = z.object({ trackId: z.string().uuid() });

function downloadFileName(title: string, mimeType: string) {
  const extension = mimeType.includes("wav") ? "wav" : "mp3";
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
        const { createPublicServerClient, getUserIdFromRequest } =
          await import("@/lib/supabase-public.server");
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const userId = await getUserIdFromRequest(request);
        if (!userId || !token)
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

        const query = querySchema.safeParse({
          trackId: new URL(request.url).searchParams.get("trackId"),
        });
        if (!query.success)
          return new Response(JSON.stringify({ error: "Invalid track download request" }), {
            status: 400,
          });

        try {
          const { getAuthorizedTrackDownload } = await import("@/lib/track-download.functions");
          const download = await getAuthorizedTrackDownload(
            createPublicServerClient(token),
            userId,
            query.data.trackId,
          );
          const mimeType =
            download.response.headers.get("content-type") ||
            (download.audioKey.endsWith(".wav") ? "audio/wav" : "audio/mpeg");
          const headers = new Headers({
            "cache-control": "private, no-store",
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(downloadFileName(download.title, mimeType))}`,
            "content-type": mimeType,
            "x-content-type-options": "nosniff",
          });
          const contentLength = download.response.headers.get("content-length");
          if (contentLength) headers.set("content-length", contentLength);
          return new Response(download.response.body, { headers });
        } catch {
          return new Response(JSON.stringify({ error: "Track download is unavailable" }), {
            status: 403,
          });
        }
      },
    },
  },
});
