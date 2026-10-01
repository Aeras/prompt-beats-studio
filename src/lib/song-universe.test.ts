import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import {
  buildSongUniverseContextText,
  songUniverseCreativeBibleSchema,
  songUniverseSongSetupHandoffSchema,
} from "./song-universe.shared";

async function source(path: string) {
  return readFile(path, "utf8");
}

describe("Song Universe", () => {
  test("Creative Bible supports strength and safe recurrence without forcing repetition", () => {
    const bible = songUniverseCreativeBibleSchema.parse({
      items: [
        {
          id: "mood-1",
          section: "emotional_palette",
          content: "Nocturnal and intimate",
          strength: "core",
          enabled: true,
          sortOrder: 0,
        },
        {
          id: "guitar-1",
          section: "musical_identity",
          content: "Warm electric guitar",
          strength: "flexible",
          recurrence: "frequent",
          enabled: true,
          sortOrder: 0,
        },
        {
          id: "duet-1",
          section: "vocal_identity",
          content: "One optional duet",
          strength: "experimental",
          recurrence: "rare",
          enabled: true,
          sortOrder: 0,
        },
      ],
    });
    expect(bible.items.map((item) => item.strength)).toEqual(["core", "flexible", "experimental"]);
    expect(bible.items[0]?.recurrence).toBe("occasional");
    expect(bible.items[1]?.recurrence).toBe("frequent");
  });

  test("legacy Song Setup handoff remains valid while explicit Project instructions retain priority", () => {
    const handoff = songUniverseSongSetupHandoffSchema.parse({
      version: 1,
      universeId: "00000000-0000-4000-8000-000000000001",
      universeTitle: "Night City",
      projectId: null,
      selectedItems: [
        {
          id: "mood-1",
          section: "emotional_palette",
          content: "Bittersweet and nocturnal",
          strength: "core",
          enabled: true,
          sortOrder: 0,
        },
      ],
      contextSnapshot: {
        universeId: "00000000-0000-4000-8000-000000000001",
        universeTitle: "Night City",
        capturedAt: "2026-09-23T20:00:00.000Z",
        selectedItemIds: ["mood-1"],
        inheritedItems: [
          {
            id: "mood-1",
            section: "emotional_palette",
            content: "Bittersweet and nocturnal",
            strength: "core",
            enabled: true,
            sortOrder: 0,
          },
        ],
      },
    });
    const context = buildSongUniverseContextText(handoff, "en");
    expect(context).toContain("Bittersweet and nocturnal");
    expect(context).toContain(
      "explicit current-song instructions override Universe recommendations",
    );
  });

  test("database is private, one-primary-Universe, ownership validated and delete preserves Projects", async () => {
    const migration = await source("supabase/migrations/20260923213000_song_universe_core.sql");
    expect(migration).toContain("ALTER TABLE public.song_universes ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("owner_id = auth.uid()");
    expect(migration).toContain("UNIQUE(project_id)");
    expect(migration).toContain("Project does not belong to the Song Universe owner.");
    expect(migration).toContain("REFERENCES public.prompt_projects(id) ON DELETE CASCADE");
    expect(migration).not.toContain("ALTER TABLE public.prompt_projects");
    expect(migration).toContain("reorder_song_universe_projects");
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
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
    const mobileTabs = shell.slice(
      shell.indexOf("const MOBILE_TABS"),
      shell.indexOf("] as const", shell.indexOf("const MOBILE_TABS")),
    );
    expect(mobileTabs).not.toContain("songUniverse");
    expect(mobileTabs).not.toContain('domain: "songUniverse"');
  });

  test("Generator consumes Universe handoff through canonical Song Setup instead of a second generator", async () => {
    const generator = await source("src/routes/generate.tsx");
    expect(generator).toContain("SONG_UNIVERSE_SONG_SETUP_HANDOFF_KEY");
    expect(generator).toContain("songUniverseSongSetupHandoffSchema");
    expect(generator).toContain("buildSongUniverseContextText");
    expect(generator).toContain("setSongSetupAssistantOpen(true)");
    expect(generator).toContain("Using Universe Context");
  });

  test("AI actions are deliberate, AI Tools-backed, usage-tracked and use dedicated operation names", async () => {
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
    expect(ai).toContain('operation: "universe_creative_bible_generate"');
    expect(ai).toContain('operation: "universe_creative_bible_refine"');
    expect(admission).toContain('"song_universe"');
    expect(usage).toContain('"universe_continuity_analysis"');
    expect(usage).toContain('"universe_project_fit"');
    expect(usage).toContain('"universe_next_song_plan"');
  });

  test("Story Map evidence is read-only, ownership-scoped and centralized in Project Memory", async () => {
    const memory = await source("src/lib/song-universe-memory.server.ts");
    const functions = await source("src/lib/song-universe.functions.ts");
    expect(memory).toContain('.from("story_maps")');
    expect(memory).toContain('.eq("user_id", userId)');
    const storyMapQueryStart = memory.indexOf('.from("story_maps")');
    const storyMapQueryEnd = memory.indexOf("if (storyError)", storyMapQueryStart);
    const storyMapQuery = memory.slice(storyMapQueryStart, storyMapQueryEnd);
    expect(storyMapQuery).not.toContain('.eq("owner_id", userId)');
    expect(memory).toContain("central_change");
    expect(memory).toContain("turning_point");
    expect(memory).toContain("resolution");
    expect(memory).not.toContain('.from("saved_prompts").update');
    expect(memory).not.toContain('.from("story_maps").update');
    expect(functions).not.toContain('.from("saved_prompts").update');
  });
});
