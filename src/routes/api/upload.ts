import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"]);

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getUserIdFromRequest } = await import("@/lib/supabase-public.server");
        const userId = await getUserIdFromRequest(request);
        if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) {
          return new Response(JSON.stringify({ error: "No file provided" }), { status: 400 });
        }
        if (file.size > MAX_BYTES) {
          return new Response(JSON.stringify({ error: "File is larger than 50 MB" }), { status: 413 });
        }
        const type = file.type || "audio/mpeg";
        const isAudioName = /\.(mp3|wav)$/i.test(file.name);
        if (!ALLOWED.has(type) && !isAudioName) {
          return new Response(JSON.stringify({ error: "Only .mp3 and .wav files are allowed" }), {
            status: 415,
          });
        }

        const { buildObjectKey, uploadToR2 } = await import("@/lib/r2.server");
        const key = buildObjectKey(userId, file.name);
        const { url } = await uploadToR2(key, await file.arrayBuffer(), type);

        return Response.json({ key, url });
      },
    },
  },
});
