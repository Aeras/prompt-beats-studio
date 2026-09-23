import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import {
  buildStoryMapSongSetupDescription,
  storyMapDraftSchema,
  storyMapSongSetupHandoffSchema,
} from "./story-map.shared";

async function source(path: string) {
  return readFile(path, "utf8");
}

const beat = (position: number, title: string) => ({
  position,
  title,
  whatHappens: "",
  emotion: "",
  purpose: "",
  narratorState: "",
  keyImage: "",
  reveal: "",
  changeAfterBeat: "",
  lyricAnchor: "",
  suggestedSections: [],
  isKeyBeat: false,
});

describe("Story Map", () => {
  test("draft contract requires a bounded narrative progression", () => {
    const draft = {
      progressionType: "narrative" as const,
      summary: "A guarded narrator finally chooses to leave.",
      narrator: "First-person narrator",
      pointOfView: "first person",
      startingState: "stuck",
      centralChange: "accepts the truth",
      turningPoint: "packs the final box",
      resolution: "walks away",
      beats: [beat(0, "Setup"), beat(1, "Turn"), beat(2, "Resolution")],
    };
    expect(storyMapDraftSchema.parse(draft)).toEqual(draft);
    expect(() => storyMapDraftSchema.parse({ ...draft, beats: draft.beats.slice(0, 2) })).toThrow();
  });

  test("Song Setup handoff is strict and remains structured", () => {
    const handoff = {
      version: 1 as const,
      storyMapId: "00000000-0000-4000-8000-000000000001",
      storyMapTitle: "Leaving Home",
      projectId: null,
      concept: "A narrator decides to leave a stagnant relationship.",
      progressionType: "emotional" as const,
      summary: "Restraint becomes resolve.",
      narrator: "the person leaving",
      pointOfView: "first person",
      startingState: "hesitant",
      centralChange: "gains resolve",
      turningPoint: "stops asking permission",
      resolution: "leaves",
      beats: [beat(0, "Hesitation")],
    };
    expect(storyMapSongSetupHandoffSchema.parse(handoff)).toEqual(handoff);
    expect(() =>
      storyMapSongSetupHandoffSchema.parse({ ...handoff, rawLyrics: "not allowed" }),
    ).toThrow();
  });

  test("Song Setup description keeps narrative fields and beat order", () => {
    const text = buildStoryMapSongSetupDescription(
      {
        version: 1,
        storyMapId: "00000000-0000-4000-8000-000000000001",
        storyMapTitle: "Night Train",
        projectId: null,
        concept: "A departure becomes a decision.",
        progressionType: "narrative",
        summary: "The narrator moves from doubt to action.",
        narrator: null,
        pointOfView: null,
        startingState: null,
        centralChange: null,
        turningPoint: null,
        resolution: null,
        beats: [beat(2, "Arrival"), beat(0, "Platform"), beat(1, "Departure")],
      },
      "en",
    );
    expect(text).toContain("Concept: A departure becomes a decision.");
    expect(text.indexOf("Platform")).toBeLessThan(text.indexOf("Departure"));
    expect(text.indexOf("Departure")).toBeLessThan(text.indexOf("Arrival"));
  });

  test("standalone Story Map route is feature-gated and uses atomic beat reorder", async () => {
    const route = await source("src/routes/story-map.tsx");
    expect(route).toContain('createFileRoute("/story-map")');
    expect(route).toContain('useFeatureAccess("story_map")');
    expect(route).toContain("reorderStoryMapBeatsAtomic");
    expect(route).toContain("STORY_MAP_SONG_SETUP_HANDOFF_KEY");
  });

  test("Lyrics Workspace mounts Story Map review and targeted rewrite integration", async () => {
    const workspace = await source("src/components/promptbeats/LyricsWorkspace.tsx");
    const panel = await source("src/components/promptbeats/StoryMapLyricsPanel.tsx");
    expect(workspace).toContain("StoryMapLyricsPanel");
    expect(panel).toContain("analyzeLyricsWithStoryMap");
    expect(panel).toContain("createStoryMapFromLyrics");
    expect(panel).toContain("onPrepareRewrite(item.sectionKey, item.suggestion)");
    expect(panel).toContain("without automatically changing the lyrics");
  });

  test("Generator consumes Story Map handoff and supports story-driven planning without direct beat labels", async () => {
    const generator = await source("src/routes/generate.tsx");
    const ai = await source("src/lib/story-map-ai.functions.ts");
    expect(generator).toContain("storyMapSongSetupHandoffSchema");
    expect(generator).toContain("STORY_MAP_SONG_SETUP_HANDOFF_KEY");
    expect(generator).toContain("planStoryDrivenGeneration");
    expect(generator).toContain("createStoryMap");
    expect(generator).toContain("replaceStoryMapDraft");
    expect(generator).toContain("Story-driven lyrics");
    expect(ai).toContain("planStoryDrivenGeneration");
    expect(ai.toLowerCase()).toContain("beat");
  });

  test("database contract is owner-only and atomic for beat reorder and draft replacement", async () => {
    const step1 = await source("supabase/migrations/20260923201500_story_map_step1.sql");
    const atomic = await source("supabase/migrations/20260923201600_story_map_atomic_draft.sql");
    const workspace = await source("src/lib/story-map-workspace.functions.ts");
    expect(step1).toContain("ALTER TABLE public.story_maps ENABLE ROW LEVEL SECURITY");
    expect(step1).toContain("user_id = auth.uid()");
    expect(step1).toContain("CREATE OR REPLACE FUNCTION public.reorder_story_map_beats");
    expect(step1).toContain("SET CONSTRAINTS story_map_beats_story_map_position_key DEFERRED");
    expect(atomic).toContain("CREATE OR REPLACE FUNCTION public.replace_story_map_draft");
    expect(atomic).toContain("Story Map requires 3 to 10 beats.");
    expect(workspace).toContain('.rpc("reorder_story_map_beats"');
    expect(workspace).toContain('.rpc("replace_story_map_draft"');
  });
});
