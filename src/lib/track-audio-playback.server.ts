import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createSignedR2GetUrl } from "@/lib/r2.server";
import { isSafeOwnedAudioKey } from "@/lib/storage-paths";

type TrackAudioShape = {
  id: string;
  source_type?: string | null;
  audio_url?: string | null;
};

/**
 * Replaces stored R2 object references with short-lived signed playback URLs.
 * The database remains the source of truth for the audio key; callers never
 * need to expose audio_key to the browser.
 */
export async function hydrateTrackAudioUrls<T extends TrackAudioShape>(
  tracks: T[],
  expiresSeconds = 6 * 60 * 60,
): Promise<T[]> {
  const uploadIds = [...new Set(tracks.filter((track) => track.source_type === "upload").map((track) => track.id))];
  if (!uploadIds.length) return tracks;

  const { data, error } = await (supabaseAdmin.from("tracks") as any)
    .select("id, user_id, audio_key")
    .in("id", uploadIds);
  if (error) throw new Error("Could not prepare secure track audio playback");

  const keyByTrack = new Map<string, string>();
  for (const row of data ?? []) {
    if (
      typeof row.id === "string" &&
      typeof row.user_id === "string" &&
      typeof row.audio_key === "string" &&
      isSafeOwnedAudioKey(row.audio_key, row.user_id)
    ) {
      keyByTrack.set(row.id, row.audio_key);
    }
  }

  const signedByTrack = new Map<string, string>();
  await Promise.all(
    uploadIds.map(async (trackId) => {
      const key = keyByTrack.get(trackId);
      if (!key) return;
      signedByTrack.set(trackId, await createSignedR2GetUrl(key, expiresSeconds));
    }),
  );

  return tracks.map((track) => {
    if (track.source_type !== "upload") return track;
    const signed = signedByTrack.get(track.id);
    return { ...track, audio_url: signed ?? "" };
  });
}

export async function hydrateTrackAudioUrl<T extends TrackAudioShape>(
  track: T,
  expiresSeconds = 6 * 60 * 60,
): Promise<T> {
  return (await hydrateTrackAudioUrls([track], expiresSeconds))[0] ?? track;
}
