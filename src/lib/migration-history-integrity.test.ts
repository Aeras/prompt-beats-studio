import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("migration history integrity", () => {
  test("retired AI Music Lab is removed by a forward migration, not by rewriting applied history", async () => {
    const [
      featureRegistry,
      auxiliaryAdmission,
      storyMap,
      songUniverse,
      usageHardening,
      auxiliaryIdempotency,
      cleanup,
    ] = await Promise.all([
      source("supabase/migrations/20260921090000_feature_access_v2_registry_and_ai_admission.sql"),
      source("supabase/migrations/20260922113000_auxiliary_ai_admission.sql"),
      source("supabase/migrations/20260923201500_story_map_step1.sql"),
      source("supabase/migrations/20260923213000_song_universe_core.sql"),
      source("supabase/migrations/20260924190000_ai_usage_admission_step7_hardening.sql"),
      source("supabase/migrations/20260924200000_auxiliary_ai_durable_idempotency.sql"),
      source("supabase/migrations/20260926013500_remove_ai_music_lab.sql"),
    ]);

    for (const historical of [
      featureRegistry,
      auxiliaryAdmission,
      storyMap,
      songUniverse,
      usageHardening,
      auxiliaryIdempotency,
    ]) {
      expect(historical).toContain("ai_music_lab");
    }

    expect(cleanup).toContain(
      "DELETE FROM public.feature_access_policies WHERE feature_key = 'ai_music_lab'",
    );
    expect(cleanup).toContain(
      "DELETE FROM public.ai_auxiliary_requests WHERE operation = 'ai_music_lab'",
    );
    expect(cleanup).toContain(
      "DELETE FROM public.ai_auxiliary_admissions WHERE operation = 'ai_music_lab'",
    );
    expect(cleanup).not.toContain("'song_setup_assistant','ai_music_lab','song_analyzer'");
  });

  test("retired provider provenance is preserved historically and normalized forward", async () => {
    const [createdWith, editTrack, cleanup] = await Promise.all([
      source("supabase/migrations/20260917203500_track_created_with.sql"),
      source("supabase/migrations/20260917211800_edit_track_allow_download.sql"),
      source("supabase/migrations/20260926013500_remove_ai_music_lab.sql"),
    ]);

    for (const historical of [createdWith, editTrack]) {
      expect(historical).toContain("Google Lyria 3.5");
      expect(historical).toContain("ElevenLabs Music");
    }

    expect(cleanup).toContain("WHERE created_with IN ('Google Lyria 3.5','ElevenLabs Music')");
    expect(cleanup).toContain("SET created_with = 'Other'");
  });

  test("CI rejects changes to existing migration files and permits only new forward migrations", async () => {
    const workflow = await source(".github/workflows/regression-gate.yml");
    expect(workflow).toContain("Migration history immutability");
    expect(workflow).toContain("git diff --name-status --find-renames");
    expect(workflow).toContain("awk '$1 != \"A\" { print }'");
    expect(workflow).toContain("Existing migration files may not be modified, deleted, copied, or renamed");
  });
});
