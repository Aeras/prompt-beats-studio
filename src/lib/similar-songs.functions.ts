import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { scoreSimilarSong } from "@/lib/similar-songs.shared";

const TRACK_COLUMNS =
  "id, user_id, title, genre, prompt, lyrics, prompt_is_public, lyrics_is_public, contains_explicit_lyrics, audio_url, audio_type, source_type, source_url, source_id, created_with, allow_download, art_url, cover_url, duration_seconds, plays, is_published, created_at";

function sanitizeTrack(track: any, viewerId?: string | null) {
  const owner = Boolean(viewerId && track.user_id === viewerId);
  return {
    ...track,
    prompt: owner || track.prompt_is_public !== false ? (track.prompt ?? "") : "",
    lyrics: owner || track.lyrics_is_public !== false ? (track.lyrics ?? "") : "",
  };
}

export const listSimilarSongs = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        trackId: z.string().uuid(),
        limit: z.number().int().min(1).max(20).default(12),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { createPublicServerClient, getUserIdFromRequest } =
      await import("@/lib/supabase-public.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const request = getRequest();
    const authorization = request?.headers.get("authorization") ?? null;
    const accessToken = authorization?.replace(/^Bearer\s+/i, "") ?? null;
    const viewerId = request && accessToken ? await getUserIdFromRequest(request) : null;
    const publicClient =
      viewerId && accessToken ? createPublicServerClient(accessToken) : createPublicServerClient();

    const { data: source, error: sourceError } = await (supabaseAdmin.from("tracks") as any)
      .select(TRACK_COLUMNS)
      .eq("id", data.trackId)
      .eq("moderation_status", "active")
      .maybeSingle();
    if (sourceError) throw new Error(sourceError.message);
    if (!source) throw new Error("Track not found");
    if (!source.is_published && source.user_id !== viewerId) throw new Error("Track is private");

    const sourcePrompt =
      source.user_id === viewerId || source.prompt_is_public !== false ? (source.prompt ?? "") : "";

    const { data: candidates, error: candidateError } = await (supabaseAdmin.from("tracks") as any)
      .select(TRACK_COLUMNS)
      .eq("is_published", true)
      .eq("moderation_status", "active")
      .neq("id", data.trackId)
      .order("created_at", { ascending: false })
      .limit(250);
    if (candidateError) throw new Error(candidateError.message);

    const scored = (candidates ?? [])
      .map((candidate: any) => {
        const candidatePrompt = candidate.prompt_is_public !== false ? (candidate.prompt ?? "") : "";
        const similarity = scoreSimilarSong(
          { prompt: sourcePrompt, genre: source.genre },
          { prompt: candidatePrompt, genre: candidate.genre },
        );
        return { candidate, similarity };
      })
      .filter(({ similarity }) => similarity.score > 0)
      .sort((a, b) => {
        if (b.similarity.score !== a.similarity.score)
          return b.similarity.score - a.similarity.score;
        return String(b.candidate.created_at).localeCompare(String(a.candidate.created_at));
      })
      .slice(0, data.limit);

    const userIds = [...new Set(scored.map(({ candidate }) => candidate.user_id))] as string[];
    const profiles = new Map<string, { handle: string; displayName: string; staffBadge: string | null }>();
    if (userIds.length) {
      const { data: rows } = await publicClient
        .from("public_profiles")
        .select("id, handle, display_name, artist_alias, staff_badge")
        .in("id", userIds);
      for (const row of rows ?? []) {
        if (!row.id) continue;
        profiles.set(row.id, {
          handle: `@${row.handle ?? "unknown"}`,
          displayName: row.artist_alias || row.display_name || row.handle || "",
          staffBadge: row.staff_badge ?? null,
        });
      }
    }

    return {
      tracks: scored.map(({ candidate, similarity }) => {
        const profile = profiles.get(candidate.user_id);
        return {
          ...sanitizeTrack(candidate, viewerId),
          handle: profile?.handle ?? "@unknown",
          creator_name: profile?.displayName ?? "",
          staff_badge: profile?.staffBadge ?? null,
          similarity_score: Math.round(similarity.score * 100),
          matched_on: similarity.matchedOn,
        };
      }),
      basis: sourcePrompt.trim() ? "prompt" : "genre",
    };
  });
