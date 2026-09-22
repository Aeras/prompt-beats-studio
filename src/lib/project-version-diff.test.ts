import { describe, expect, test } from "bun:test";

import { generatorInputSnapshotSchema } from "./generator-revision.shared";
import {
  compareProjectVersions,
  diffArrangement,
  diffLyrics,
  diffSongStructure,
  diffVersionFields,
  diffWords,
  type ComparableProjectVersion,
} from "./project-version-diff.shared";

function snapshot(overrides: Record<string, unknown> = {}) {
  return generatorInputSnapshotSchema.parse({
    generatorMode: "advanced",
    theme: "Night walk",
    customMusicStyle: "Indie Pop",
    customMood: "Melancholic",
    language: "Greek",
    customInstruments: "Electric Guitar, Piano",
    bpmMode: "Custom",
    customBpm: "82",
    songStructure: ["Verse", "Chorus", "Verse", "Chorus"],
    songBlueprint: [
      { sectionId: "verse-a", structureIndex: 0, sectionType: "Verse", occurrence: 1, instruction: "", energy: 2 },
      { sectionId: "chorus-a", structureIndex: 1, sectionType: "Chorus", occurrence: 1, instruction: "wide guitars", energy: 3 },
      { sectionId: "verse-b", structureIndex: 2, sectionType: "Verse", occurrence: 2, instruction: "", energy: 2 },
      { sectionId: "chorus-b", structureIndex: 3, sectionType: "Chorus", occurrence: 2, instruction: "bigger drums", energy: 4 },
    ],
    productionStyle: "Warm modern mix",
    additionalInstructions: "Natural phrasing",
    targetPlatform: "suno",
    generationModel: "gemini-3.8-flash",
    ...overrides,
  });
}

function version(id: string, versionNumber: number, overrides: Partial<ComparableProjectVersion> = {}): ComparableProjectVersion {
  return {
    id,
    versionNumber,
    title: "City Lights",
    theme: "Night walk",
    genre: "Indie Pop",
    mood: "Melancholic",
    language: "Greek",
    tags: "indie pop, warm guitars",
    lyrics: "[Verse]\nΠαλιά γραμμή\n\n[Chorus]\nΜένει το φως",
    note: "Keep it intimate.",
    snapshot: snapshot(),
    ...overrides,
  };
}

describe("Project Version semantic diff", () => {
  test("structured fields use semantic labels rather than raw snapshot JSON", () => {
    const before = version("v1", 1);
    const after = version("v2", 2, {
      snapshot: snapshot({ customMusicStyle: "Pop Rock", customBpm: "90" }),
    });
    const fields = diffVersionFields(before, after);

    expect(fields.find((item) => item.key === "musicStyle")).toMatchObject({
      before: "Indie Pop",
      after: "Pop Rock",
      status: "changed",
      added: ["Pop Rock"],
      removed: ["Indie Pop"],
    });
    expect(fields.find((item) => item.key === "bpm")).toMatchObject({
      before: "82 BPM",
      after: "90 BPM",
      status: "changed",
    });
  });

  test("song structure is occurrence-aware and reports added plus moved sections", () => {
    const before = snapshot({ songStructure: ["Verse", "Chorus", "Verse", "Chorus"] });
    const after = snapshot({ songStructure: ["Verse", "Chorus", "Bridge", "Verse", "Chorus", "Final Chorus"] });
    const result = diffSongStructure(before, after);

    expect(result.find((item) => item.key === "bridge:1")).toMatchObject({ status: "added", afterIndex: 2 });
    expect(result.find((item) => item.key === "final chorus:1")).toMatchObject({ status: "added", afterIndex: 5 });
    expect(result.find((item) => item.key === "verse:2")).toMatchObject({ status: "moved", beforeIndex: 2, afterIndex: 3 });
  });

  test("arrangement diff uses stable sectionId and keeps energy/instruction bound after move", () => {
    const before = snapshot();
    const after = snapshot({
      songStructure: ["Verse", "Chorus", "Chorus", "Verse"],
      songBlueprint: [
        { sectionId: "verse-a", structureIndex: 0, sectionType: "Verse", occurrence: 1, instruction: "", energy: 2 },
        { sectionId: "chorus-b", structureIndex: 1, sectionType: "Chorus", occurrence: 1, instruction: "stacked harmonies", energy: 5 },
        { sectionId: "chorus-a", structureIndex: 2, sectionType: "Chorus", occurrence: 2, instruction: "wide guitars", energy: 3 },
        { sectionId: "verse-b", structureIndex: 3, sectionType: "Verse", occurrence: 2, instruction: "", energy: 2 },
      ],
    });

    const result = diffArrangement(before, after);
    expect(result.find((item) => item.key === "id:chorus-b")).toMatchObject({
      beforeIndex: 3,
      afterIndex: 1,
      beforeEnergy: 4,
      afterEnergy: 5,
      energyChanged: true,
      instructionChanged: true,
      status: "changed",
    });
    expect(result.find((item) => item.key === "id:chorus-a")).toMatchObject({
      beforeIndex: 1,
      afterIndex: 2,
      status: "moved",
    });
  });

  test("legacy arrangement without sectionId falls back to type plus occurrence", () => {
    const before = snapshot({
      songBlueprint: [
        { structureIndex: 0, sectionType: "Chorus", occurrence: 1, instruction: "wide", energy: 3 },
      ],
    });
    const after = snapshot({
      songBlueprint: [
        { structureIndex: 0, sectionType: "Chorus", occurrence: 1, instruction: "wider", energy: 4 },
      ],
    });
    expect(diffArrangement(before, after)[0]).toMatchObject({
      key: "legacy:chorus:1",
      status: "changed",
      beforeEnergy: 3,
      afterEnergy: 4,
    });
  });

  test("lyrics diff aligns sections and identifies added/removed/changed sections", () => {
    const result = diffLyrics(
      "[Verse]\nπαλιά λέξη\n\n[Chorus]\nίδιο hook",
      "[Verse]\nνέα λέξη\n\n[Bridge]\nκαινούριο bridge",
    );

    expect(result.find((item) => item.key === "verse:1")?.status).toBe("changed");
    expect(result.find((item) => item.key === "chorus:1")?.status).toBe("removed");
    expect(result.find((item) => item.key === "bridge:1")?.status).toBe("added");
  });

  test("word diff highlights replacement instead of showing two undifferentiated blocks", () => {
    const tokens = diffWords(
      "Κι αν φύγεις τώρα, μη γυρίσεις ξανά",
      "Κι αν φύγεις τώρα, ίσως βρούμε ξανά",
    );

    expect(tokens.some((token) => token.status === "removed" && token.value === "μη")).toBe(true);
    expect(tokens.some((token) => token.status === "removed" && token.value === "γυρίσεις")).toBe(true);
    expect(tokens.some((token) => token.status === "added" && token.value === "ίσως")).toBe(true);
    expect(tokens.some((token) => token.status === "added" && token.value === "βρούμε")).toBe(true);
  });

  test("full compare reports no changes for identical immutable versions", () => {
    const before = version("v1", 1);
    const after = version("v2", 2);
    const result = compareProjectVersions(before, after);
    expect(result.hasChanges).toBe(false);
    expect(result.changeCount).toBe(0);
  });

  test("full compare counts semantic changes across fields, structure, arrangement and lyrics", () => {
    const before = version("v1", 1);
    const after = version("v2", 2, {
      lyrics: "[Verse]\nΝέα γραμμή\n\n[Chorus]\nΜένει το φως\n\n[Bridge]\nΝέο bridge",
      snapshot: snapshot({
        customBpm: "90",
        songStructure: ["Verse", "Chorus", "Verse", "Chorus", "Bridge"],
        songBlueprint: [
          { sectionId: "verse-a", structureIndex: 0, sectionType: "Verse", occurrence: 1, instruction: "", energy: 2 },
          { sectionId: "chorus-a", structureIndex: 1, sectionType: "Chorus", occurrence: 1, instruction: "wide guitars", energy: 4 },
          { sectionId: "verse-b", structureIndex: 2, sectionType: "Verse", occurrence: 2, instruction: "", energy: 2 },
          { sectionId: "chorus-b", structureIndex: 3, sectionType: "Chorus", occurrence: 2, instruction: "bigger drums", energy: 4 },
          { sectionId: "bridge-a", structureIndex: 4, sectionType: "Bridge", occurrence: 1, instruction: "strip back", energy: 3 },
        ],
      }),
    });

    const result = compareProjectVersions(before, after);
    expect(result.hasChanges).toBe(true);
    expect(result.fields.find((field) => field.key === "bpm")?.status).toBe("changed");
    expect(result.structure.some((item) => item.status === "added")).toBe(true);
    expect(result.arrangement.some((item) => item.energyChanged)).toBe(true);
    expect(result.lyrics.some((item) => item.status === "added")).toBe(true);
  });
});
