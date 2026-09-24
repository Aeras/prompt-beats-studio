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
});
