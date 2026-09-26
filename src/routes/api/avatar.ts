import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  avatarOwnerId,
  extractAvatarObjectPath,
  isSafeAvatarObjectPath,
} from "@/lib/avatar-reference";

const querySchema = z.object({ path: z.string().min(1).max(300) });
const SIGNED_AVATAR_TTL_SECONDS = 5 * 60;

export const Route = createFileRoute("/api/avatar")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const parsed = querySchema.safeParse({
          path: new URL(request.url).searchParams.get("path"),
        });
        if (!parsed.success || !isSafeAvatarObjectPath(parsed.data.path)) {
          return Response.json({ error: "Invalid avatar reference" }, { status: 400 });
        }

        const path = parsed.data.path;
        const ownerId = avatarOwnerId(path);
        if (!ownerId) return Response.json({ error: "Avatar unavailable" }, { status: 404 });

        const { createPublicServerClient } = await import("@/lib/supabase-public.server");
        const publicClient = createPublicServerClient();
        const { data: profile, error: profileError } = await publicClient
          .from("public_profiles")
          .select("id, avatar_url")
          .eq("id", ownerId)
          .maybeSingle();

        if (profileError || !profile || extractAvatarObjectPath(profile.avatar_url) !== path) {
          return Response.json({ error: "Avatar unavailable" }, { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: signed, error: signedError } = await supabaseAdmin.storage
          .from("avatars")
          .createSignedUrl(path, SIGNED_AVATAR_TTL_SECONDS);

        if (signedError || !signed?.signedUrl) {
          return Response.json({ error: "Avatar unavailable" }, { status: 404 });
        }

        return new Response(null, {
          status: 302,
          headers: {
            location: signed.signedUrl,
            "cache-control": "public, max-age=240, stale-while-revalidate=60",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
