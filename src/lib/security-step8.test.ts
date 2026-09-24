import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Step 8 security / DB / RLS / storage hardening", () => {
  test("trigger-only SECURITY DEFINER helpers lose browser-facing EXECUTE grants", async () => {
    const migration = await source(
      "supabase/migrations/20260924020000_step8_security_hardening_batch1.sql",
    );

    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.story_map_validate_project_owner() FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.song_universe_validate_project_owner() FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.song_universe_validate_analysis_owner() FROM PUBLIC, anon, authenticated",
    );
  });

  test("internal moderation helpers are not callable directly by browser roles", async () => {
    const migration = await source(
      "supabase/migrations/20260924020000_step8_security_hardening_batch1.sql",
    );

    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public._moderation_case_actor_role(uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public._moderation_case_can_read(uuid, uuid) FROM PUBLIC, anon, authenticated",
    );
  });

  test("redundant Supabase Storage policies are removed without making private buckets public", async () => {
    const migration = await source(
      "supabase/migrations/20260924020000_step8_security_hardening_batch1.sql",
    );

    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Users manage their own avatar files" ON storage.objects',
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Anyone can view track covers" ON storage.objects',
    );
    expect(migration).not.toContain(
      "UPDATE storage.buckets SET public = true WHERE id = 'avatars'",
    );
    expect(migration).not.toContain(
      "UPDATE storage.buckets SET public = true WHERE id = 'inspiration-wall-images'",
    );
  });

  test("owner RLS policies cache auth.uid per statement without changing ownership rules", async () => {
    const migration = await source(
      "supabase/migrations/20260924021000_step8_rls_performance_hardening.sql",
    );

    expect(migration).toContain("user_id = (SELECT auth.uid())");
    expect(migration).toContain("owner_id = (SELECT auth.uid())");
    expect(migration).toContain("w.owner_id = (SELECT auth.uid())");
    expect(migration).toContain("u.owner_id = (SELECT auth.uid())");
    expect(migration).toContain("m.user_id = (SELECT auth.uid())");
    expect(migration).not.toContain("owner_id = auth.uid()");
    expect(migration).not.toContain("user_id = auth.uid()");
  });

  test("R2 upload storage no longer returns permanent public playback URLs", async () => {
    const r2 = await source("src/lib/r2.server.ts");

    expect(r2).toContain('unsignedUrl.searchParams.set("X-Amz-Expires"');
    expect(r2).toContain("signQuery: true");
    expect(r2).toContain("return { key, url: buildR2ObjectUrl(key) }");
    expect(r2).not.toContain("url: `${publicBase}/${key}`");
  });

  test("native player resolves uploaded tracks through the authorized signed playback resolver", async () => {
    const player = await source("src/lib/player.tsx");
    const resolver = await source("src/lib/track-playback.functions.ts");

    expect(player).toContain('track.sourceType === "upload"');
    expect(player).toContain("getTrackPlaybackUrl({ data: { trackId: track.id } })");
    expect(resolver).toContain("track.is_published !== true && track.user_id !== viewerId");
    expect(resolver).toContain("createSignedR2GetUrl(track.audio_key)");
    expect(resolver).toContain("isSafeOwnedAudioKey(track.audio_key, track.user_id)");
  });

  test("share, review, and AI Music Lab playback receive short-lived signed audio URLs", async () => {
    const sharing = await source("src/lib/track-sharing.functions.ts");
    const review = await source("src/lib/private-review.functions.ts");
    const lab = await source("src/lib/ai-music-lab.functions.ts");

    expect(sharing).toContain("hydrateTrackAudioUrl");
    expect(review).toContain("hydrateTrackAudioUrl");
    expect(lab).toContain("createSignedR2GetUrl(result.audioKey)");
  });

  test("public token RPCs are callable only through the server-side service role", async () => {
    const migration = await source(
      "supabase/migrations/20260924022000_step8_public_token_rpc_hardening.sql",
    );

    for (const signature of [
      "public.private_review_link_info(text)",
      "public.join_private_review_session(text, text, text)",
      "public.get_private_review_session(text, text)",
      "public.add_private_review_comment(text, text, text, uuid)",
      "public.get_track_share_by_token(text)",
    ]) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated`,
      );
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    }
  });
});
