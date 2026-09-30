import { describe, expect, test } from "bun:test";

import {
  SONG_UNIVERSE_PLANNER_BASE_RULES,
  buildDeterministicUsageProfile,
  contrastInstruction,
  getSongUniverseStrategy,
  shouldPreserveBibleItemAsIdentity,
} from "./song-universe-planner";
import {
  SONG_UNIVERSE_PLANNER_PHILOSOPHY,
  SONG_UNIVERSE_PLANNER_PRECEDENCE,
  nextSongBriefSchema,
  projectUniverseSummarySchema,
} from "./song-universe-planner.shared";
import { songUniverseBibleItemSchema } from "./song-universe.shared";

function summary(input: Partial<ReturnType<typeof projectUniverseSummarySchema.parse>> & { projectId: string; projectTitle: string; position: number }) {
  return projectUniverseSummarySchema.parse(input);
}

describe("Song Universe 2 planner foundation", () => {
  test("canonical philosophy uses Project Memory and explicit precedence", () => {
    expect(SONG_UNIVERSE_PLANNER_PHILOSOPHY).toBe(
      "Creative Director + Project Memory + Diversity Planner + Narrative Continuity Engine",
    );
    expect(SONG_UNIVERSE_PLANNER_PRECEDENCE[0]).toBe("explicit_current_song_instruction");
    expect(SONG_UNIVERSE_PLANNER_PRECEDENCE).toContain("must_respect_or_story_canon");
  });

  test("Album and Song Series load materially different strategies", () => {
    const album = getSongUniverseStrategy("album");
    const series = getSongUniverseStrategy("song_series");
    expect(album.headline).toBe("Preserve the artist, reinvent the song.");
    expect(album.diversify).toContain("lyrical theme");
    expect(album.narrativeProgressionRequired).toBe(false);
    expect(series.headline).toBe("Continue the world, advance the story.");
    expect(series.preserve).toContain("Story Canon");
    expect(series.narrativeProgressionRequired).toBe(true);
  });

  test("Core Things-to-Avoid stays a constraint and never becomes identityToPreserve", () => {
    const thingsToAvoid = songUniverseBibleItemSchema.parse({
      id: "avoid-heavy-trap",
      section: "things_to_avoid",
      content: "Heavy trap aesthetic",
      strength: "core",
      recurrence: "always",
      enabled: true,
      sortOrder: 0,
    });
    const coreIdentity = songUniverseBibleItemSchema.parse({
      id: "identity-guitar",
      section: "musical_identity",
      content: "Guitar-led identity",
      strength: "core",
      recurrence: "frequent",
      enabled: true,
      sortOrder: 0,
    });
    const corePalette = songUniverseBibleItemSchema.parse({
      id: "palette-core",
      section: "emotional_palette",
      content: "Intimate emotional palette",
      strength: "core",
      recurrence: "frequent",
      enabled: true,
      sortOrder: 0,
    });

    expect(shouldPreserveBibleItemAsIdentity(thingsToAvoid)).toBe(false);
    expect(shouldPreserveBibleItemAsIdentity(coreIdentity)).toBe(true);
    expect(shouldPreserveBibleItemAsIdentity(corePalette)).toBe(true);
  });

  test("intentional outliers have reduced deterministic usage influence", () => {
    const profile = buildDeterministicUsageProfile([
      summary({
        projectId: "00000000-0000-4000-8000-000000000001",
        projectTitle: "Track 1",
        position: 0,
        bpm: 92,
        mood: "Melancholic",
        instruments: ["Electric Guitar"],
      }),
      summary({
        projectId: "00000000-0000-4000-8000-000000000002",
        projectTitle: "Track 2",
        position: 1,
        bpm: 94,
        mood: "Melancholic",
        instruments: ["Electric Guitar"],
      }),
      summary({
        projectId: "00000000-0000-4000-8000-000000000003",
        projectTitle: "Experimental Track",
        position: 2,
        bpm: 160,
        mood: "Chaotic",
        instruments: ["Brass"],
        intentionalOutlier: true,
      }),
    ]);

    expect(profile.trackCount).toBe(3);
    expect(profile.bpmRanges.find((item) => item.key === "86–100 BPM")?.weightedCount).toBe(2);
    expect(profile.bpmRanges.find((item) => item.key === ">130 BPM")?.weightedCount).toBe(0.25);
    expect(profile.instruments.find((item) => item.key === "Brass")?.weightedCount).toBe(0.25);
  });

  test("usage facts remain deterministic while semantic families stay empty for later AI interpretation", () => {
    const profile = buildDeterministicUsageProfile([
      summary({
        projectId: "00000000-0000-4000-8000-000000000004",
        projectTitle: "Track",
        position: 0,
        theme: "A breakup after a phone call",
        mood: "Dark",
      }),
    ]);
    expect(profile.moods[0]?.key).toBe("Dark");
    expect(profile.themeFamilies).toEqual([]);
    expect(profile.settingFamilies).toEqual([]);
    expect(profile.motifFamilies).toEqual([]);
  });

  test("structured brief keeps soft repetition guidance separate from hard constraints", () => {
    const parsed = nextSongBriefSchema.parse({
      strategyVersion: "album:v1",
      universeType: "album",
      identityToPreserve: ["Intimate vocal identity"],
      mustRespect: ["English lyrics"],
      preferNotToRepeatThemes: ["romantic loss"],
      mustAvoid: ["explicit Universe rule: no profanity"],
      evidence: [
        {
          id: "bpm-1",
          statement: "4 of 5 tracks use a similar BPM range.",
          sourceType: "deterministic_fact",
        },
      ],
    });
    expect(parsed.preferNotToRepeatThemes).toEqual(["romantic loss"]);
    expect(parsed.mustAvoid).toEqual(["explicit Universe rule: no profanity"]);
    expect(parsed.evidence[0]?.sourceType).toBe("deterministic_fact");
  });

  test("contrast is advisory and Planner remains non-mutating", () => {
    expect(contrastInstruction("high")).toContain("strong");
    expect(SONG_UNIVERSE_PLANNER_BASE_RULES).toContain(
      "Saturation is advisory, not a prohibition.",
    );
    expect(SONG_UNIVERSE_PLANNER_BASE_RULES.join(" ")).toContain("does not write or mutate");
  });
});
