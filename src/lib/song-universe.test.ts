import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Song Universe", () => {
  test("Creative Bible supports Core, Flexible and Experimental identity without forcing repetition", async () => {
    const shared = await source("src/lib/song-universe.shared.ts");
    expect(shared).toContain('"core"');
    expect(shared).toContain('"flexible"');
    expect(shared).toContain('"experimental"');
    expect(shared).toContain('"things_to_avoid"');
    expect(shared).toContain('"allowed_deviations"');
    expect(shared).toContain("Shared identity is not identical output");
  });

  test("Song Setup handoff is structured and explicit Project instructions retain priority", async () => {
    const shared = await source("src/lib/song-universe.shared.ts");
    expect(shared).toContain("SONG_UNIVERSE_SONG_SETUP_HANDOFF_KEY");
    expect(shared).toContain("songUniverseSongSetupHandoffSchema");
    expect(shared).toContain("Explicit instructions for the current song always override Universe context");
  });

  test("database is private, one-primary-Universe, ownership validated and delete preserves Projects", async () => {
    const migration = await source("supabase/migrations/20260923213000_song_universe_core.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.song_universes");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.song_universe_projects");
    expect(migration).toContain("UNIQUE(project_id)");
    expect(migration).toContain("song_universe_validate_project_owner");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("owner_id = auth.uid()");
    expect(migration).toContain("ON DELETE CASCADE");
    expect(migration).not.toContain("DELETE FROM public.prompt_projects");
  });

  test("Feature Access is registered, defaults to everyone and server functions enforce it", async () => {
    const registry = await source("src/lib/feature-access.functions.ts");
    const migration = await source("supabase/migrations/20260923213000_song_universe_core.sql");
    const functions = await source("src/lib/song-universe.functions.ts");
    expect(registry).toContain('"song_universe"');
    expect(migration).toContain("'song_universe'");
    expect(migration).toContain("'everyone'");
    expect(functions).toContain('requireFeatureAccess(context.supabase, "song_universe")');
  });

  test("navigation uses sidebar/drawer and does not add Song Universe to mobile bottom tabs", async () => {
    const sidebar = await source("src/components/promptbeats/Sidebar.tsx");
    const shell = await source("src/components/promptbeats/AppShell.tsx");
    expect(sidebar).toContain('id: "songUniverse"');
    expect(sidebar).toContain('songUniverse: "/song-universe"');
    expect(shell).toContain('songUniverse: "/song-universe"');
    expect(shell).toContain('| "songUniverse"');
  });

  test("Generator consumes Universe handoff through canonical Song Setup instead of a second generator", async () => {
    const generator = await source("src/routes/generate.tsx");
    expect(generator).toContain("SONG_UNIVERSE_SONG_SETUP_HANDOFF_KEY");
    expect(generator).toContain("songUniverseSongSetupHandoffSchema");
    expect(generator).toContain("buildSongUniverseContextText");
    expect(generator).toContain("setSongSetupAssistantOpen(true)");
    expect(generator).toContain("Using Universe Context");
  });

  test("AI actions are deliberate, AI Tools-backed, usage-tracked and recognize intentional outliers without numeric scores", async () => {
    const route = await source("src/routes/song-universe.tsx");
    const ai = await source("src/lib/song-universe-ai.functions.ts");
    const admission = await source("src/lib/ai-admission.server.ts");
    const usage = await source("src/lib/ai-usage.server.ts");
    expect(route).toContain("analyzeSongUniverseContinuity");
    expect(route).toContain("generateSongUniverseCreativeBible");
    expect(ai).toContain('getEffectiveModelAccess(userId, "ai_tools")');
    expect(ai).toContain("intentionalOutlier");
    expect(ai).toContain("Never output a numeric quality score");
    expect(ai).toContain("recordAiUsage");
    expect(admission).toContain('"song_universe"');
    expect(usage).toContain('"universe_continuity_analysis"');
    expect(usage).toContain('"universe_project_fit"');
  });

  test("Story Map summaries are read-only continuity evidence and Universe changes do not rewrite Projects", async () => {
    const ai = await source("src/lib/song-universe-ai.functions.ts");
    const functions = await source("src/lib/song-universe.functions.ts");
    expect(ai).toContain('.from("story_maps")');
    expect(ai).toContain(
      "summary,progression_type,starting_state,central_change,turning_point,resolution",
    );
    expect(functions).not.toContain('.from("saved_prompts").update');
  });
});
