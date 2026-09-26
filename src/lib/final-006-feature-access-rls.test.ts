import { describe, expect, test } from "bun:test";

const migration = "supabase/migrations/20260926083000_final_006_feature_access_rls.sql";

async function sql() {
  return Bun.file(migration).text();
}

describe("FINAL-006 workspace Feature Access RLS", () => {
  test("Inspiration Wall mutations require valid account state and feature access while owner reads remain", async () => {
    const source = await sql();
    for (const table of [
      "inspiration_walls",
      "inspiration_wall_cards",
      "inspiration_wall_track_links",
    ]) {
      expect(source).toContain(`ON public.${table}`);
    }
    expect(source).toContain("public.current_user_can_use_feature('inspiration_wall')");
    expect(source).toContain("public.has_valid_account_state((SELECT auth.uid()))");
    expect(source).toContain('CREATE POLICY "Owners read inspiration walls"');
    expect(source).toContain('CREATE POLICY "Owners read inspiration wall cards"');
    expect(source).toContain('CREATE POLICY "Owners read inspiration wall track links"');
  });

  test("Story Map keeps owner SELECT but gates every direct mutation", async () => {
    const source = await sql();
    expect(source).not.toContain('DROP POLICY IF EXISTS "story_maps_owner_select"');
    expect(source).not.toContain('DROP POLICY IF EXISTS "story_map_beats_owner_select"');
    for (const policy of [
      "story_maps_owner_insert",
      "story_maps_owner_update",
      "story_maps_owner_delete",
      "story_map_beats_owner_insert",
      "story_map_beats_owner_update",
      "story_map_beats_owner_delete",
    ]) {
      expect(source).toContain(`CREATE POLICY "${policy}"`);
    }
    expect(source).toContain("public.current_user_can_use_feature('story_map')");
    expect(source).toContain("public.has_valid_account_state((SELECT auth.uid()))");
  });

  test("Song Universe preserves historical reads and gates universe/project/analysis mutations", async () => {
    const source = await sql();
    expect(source).toContain('CREATE POLICY "song_universes_owner_select"');
    expect(source).toContain('CREATE POLICY "song_universe_ai_analyses_owner_select"');
    expect(source).not.toContain('DROP POLICY IF EXISTS "song_universe_projects_owner_select"');
    for (const policy of [
      "song_universes_owner_insert",
      "song_universes_owner_update",
      "song_universes_owner_delete",
      "song_universe_projects_owner_insert",
      "song_universe_projects_owner_update",
      "song_universe_projects_owner_delete",
      "song_universe_ai_analyses_owner_insert",
      "song_universe_ai_analyses_owner_update",
      "song_universe_ai_analyses_owner_delete",
    ]) {
      expect(source).toContain(`CREATE POLICY "${policy}"`);
    }
    expect(source).toContain("public.current_user_can_use_feature('song_universe')");
    expect(source).toContain("public.has_valid_account_state((SELECT auth.uid()))");
  });
});
