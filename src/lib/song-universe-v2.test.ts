import { describe, expect, test } from "bun:test";

import {
  detectNearDuplicateDirection,
  deterministicPortfolioBalanceNotes,
  validateNextSongBriefConsistency,
} from "./song-universe-planner";
import {
  nextSongBriefSchema,
  projectUniverseSummarySchema,
} from "./song-universe-planner.shared";
import {
  buildSongUniverseContextText,
  songUniverseCreativeBibleSchema,
  songUniverseSongSetupHandoffSchema,
  songUniverseStoryBibleSchema,
} from "./song-universe.shared";

const ROOT = new URL("../../", import.meta.url);
const source = (path: string) => Bun.file(new URL(path, ROOT)).text();

describe("Song Universe 2 end-to-end contracts", () => {
  test("legacy Creative Bible rows gain safe recurrence defaults", () => {
    const bible = songUniverseCreativeBibleSchema.parse({
      items: [
        {
          id: "voice",
          section: "vocal_identity",
          content: "Restrained intimate vocal",
          strength: "core",
          enabled: true,
          sortOrder: 0,
        },
      ],
    });
    expect(bible.items[0]?.recurrence).toBe("occasional");
  });

  test("Story Bible is structured and canon remains separate from flexible story context", () => {
    const story = songUniverseStoryBibleSchema.parse({
      canonFacts: ["The story takes place in 1985."],
      characters: ["Anna"],
      desiredEnding: "Anna returns home.",
    });
    expect(story.canonFacts).toEqual(["The story takes place in 1985."]);
    expect(story.characters).toEqual(["Anna"]);
    expect(story.worldRules).toEqual([]);
  });

  test("v2 handoff carries approved direction and provenance into Song Setup context", () => {
    const handoff = songUniverseSongSetupHandoffSchema.parse({
      version: 2,
      universeId: "00000000-0000-4000-8000-000000000001",
      universeTitle: "Album",
      universeType: "album",
      projectId: null,
      selectedItems: [
        {
          id: "production",
          section: "production_identity",
          content: "Atmospheric rock production",
          strength: "core",
          recurrence: "frequent",
          enabled: true,
          sortOrder: 0,
        },
      ],
      approvedNextSongBrief: {
        strategyVersion: "album:v1",
        universeType: "album",
        identityToPreserve: ["Atmospheric rock production"],
        mustRespect: [],
        themesToExplore: ["Friendship"],
        preferNotToRepeatThemes: ["Romantic loss"],
        preferNotToRepeatMotifs: ["Rain"],
        mustAvoid: [],
        recommendedBpmDirection: "Explore 116–130 BPM",
        eventsNotToRepeat: [],
        openStoryQuestions: [],
        intentionalContrast: [],
        continuityNotes: [],
        creativeOpportunity: [],
        portfolioBalanceNotes: [],
        evidence: [],
        reasoningSummary: "Create contrast without losing artist identity.",
      },
      contextSnapshot: {
        universeId: "00000000-0000-4000-8000-000000000001",
        universeTitle: "Album",
        capturedAt: "2026-09-29T20:00:00.000Z",
        selectedItemIds: ["production"],
        inheritedItems: [
          {
            id: "production",
            section: "production_identity",
            content: "Atmospheric rock production",
            strength: "core",
            recurrence: "frequent",
            enabled: true,
            sortOrder: 0,
          },
        ],
        universeType: "album",
        historyFingerprint: "su2:test",
        plannerStrategyVersion: "album:v1",
        plannerSchemaVersion: "next-song-brief:v1",
        approvedNextSongBrief: {
          strategyVersion: "album:v1",
          universeType: "album",
        },
      },
    });

    const context = buildSongUniverseContextText(handoff, "en");
    expect(context).toContain("APPROVED NEXT SONG DIRECTION");
    expect(context).toContain("Friendship");
    expect(context).toContain("Romantic loss");
    expect(context).toContain("Explore 116–130 BPM");
    expect(context).toContain("explicit current-song instructions override Universe recommendations");
  });

  test("near-duplicate guard detects a strongly repeated premise", () => {
    const summary = projectUniverseSummarySchema.parse({
      projectId: "00000000-0000-4000-8000-000000000002",
      projectTitle: "Existing",
      position: 0,
      theme: "late night breakup after a phone call in an empty city",
      narrativeSummary: "A lover receives a phone call and ends a relationship while driving through the empty city at night.",
      mood: "melancholic",
    });
    const brief = nextSongBriefSchema.parse({
      strategyVersion: "album:v1",
      universeType: "album",
      themesToExplore: ["late night breakup after a phone call"],
      recommendedMood: "melancholic",
      recommendedSettingDirection: "empty city at night",
      reasoningSummary: "A lover ends a relationship after a phone call while driving through an empty city.",
    });
    const risk = detectNearDuplicateDirection(brief, [summary]);
    expect(risk.level).toBe("high");
    expect(risk.projectId).toBe(summary.projectId);
  });

  test("brief consistency rejects hard contradictions", () => {
    const brief = nextSongBriefSchema.parse({
      strategyVersion: "song_series:v1",
      universeType: "song_series",
      mustRespect: ["The protagonist is alive"],
      mustAvoid: ["The protagonist is alive"],
      storyProgression: "The heroes enter the castle.",
      eventsNotToRepeat: [],
    });
    const result = validateNextSongBriefConsistency(brief);
    expect(result.valid).toBe(false);
    expect(result.conflicts).toContain("The protagonist is alive");
  });

  test("portfolio balance uses deterministic evidence instead of AI counting", () => {
    const summaries = [1, 2, 3, 4].map((index) =>
      projectUniverseSummarySchema.parse({
        projectId: `00000000-0000-4000-8000-00000000000${index}`,
        projectTitle: `Track ${index}`,
        position: index - 1,
        bpm: 92 + index,
        mood: "Melancholic",
        structure: ["Verse", "Chorus", "Verse", "Chorus"],
      }),
    );
    const { buildDeterministicUsageProfile } = require("./song-universe-planner") as typeof import("./song-universe-planner");
    const notes = deterministicPortfolioBalanceNotes(buildDeterministicUsageProfile(summaries));
    expect(notes.join(" ")).toContain("86–100 BPM");
    expect(notes.join(" ")).toContain("Melancholic");
  });

  test("route sends users through Next Song Planner instead of direct v1 handoff", async () => {
    const route = await source("src/routes/song-universe.tsx");
    expect(route).toContain("SongUniverseNextSongPlanner");
    expect(route).toContain("setPlannerOpen(true)");
    expect(route).not.toContain("version: 1 as const");
    expect(route).not.toContain("window.sessionStorage.setItem(SONG_UNIVERSE_SONG_SETUP_HANDOFF_KEY");
    expect(route).toContain("recurrence: \"occasional\"");
    expect(route).toContain("outlierPurpose");
  });

  test("planner has project memory, durable approval, fallback and duplicate retry", async () => {
    const planner = await source("src/lib/song-universe-planner.functions.ts");
    expect(planner).toContain("loadSongUniverseProjectMemory");
    expect(planner).toContain("detectNearDuplicateDirection");
    expect(planner).toContain("fallback = true");
    expect(planner).toContain("song_universe_planner_briefs");
    expect(planner).toContain("approveSongUniverseNextSongDirection");
    expect(planner).toContain("pinnedFields");
  });

  test("project memory reads Story Maps with user_id and never mutates source Projects", async () => {
    const memory = await source("src/lib/song-universe-memory.server.ts");
    expect(memory).toContain('.from("story_maps")');
    expect(memory).toContain('.eq("user_id", userId)');
    expect(memory).toContain("generator_input_snapshot");
    expect(memory).toContain("sourceCompleteness");
    expect(memory).not.toContain('.from("saved_prompts").update');
    expect(memory).not.toContain('.from("story_maps").update');
  });

  test("migration persists v2 planning controls with RLS", async () => {
    const migration = await source("supabase/migrations/20260929234500_song_universe_2_core.sql");
    expect(migration).toContain("planned_track_count");
    expect(migration).toContain("story_bible");
    expect(migration).toContain("outlier_purpose");
    expect(migration).toContain("song_universe_planner_briefs");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("current_user_can_use_feature('song_universe')");
  });
});
