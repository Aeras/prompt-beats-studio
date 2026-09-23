import { describe, expect, test } from "bun:test";

import { diffGeneratorSnapshots, generatorInputSnapshotSchema } from "./generator-revision.shared";
import {
  activeSongBlueprint,
  buildSongBlueprint,
  songBlueprintSchema,
} from "./song-blueprint.shared";
import {
  applyEnergyToAllRegularChoruses,
  applyInstructionToAllRegularChoruses,
  arrangementToSongBlueprint,
  arrangementToSongStructure,
  duplicateArrangementSection,
  moveArrangementSection,
  normalizeSongArrangement,
  removeArrangementSection,
  updateArrangementEnergy,
  updateArrangementInstruction,
} from "./song-arrangement.shared";

function idFactory(...ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

describe("Song Arrangement data foundation", () => {
  test("legacy Blueprint normalizes into runtime sections with required stable IDs and null energy", () => {
    const legacy = buildSongBlueprint(["Intro", "Verse", "Chorus"]);
    const arrangement = normalizeSongArrangement(
      ["Intro", "Verse", "Chorus"],
      legacy,
      idFactory("intro-id", "verse-id", "chorus-id"),
    );

    expect(arrangement.map((section) => section.sectionId)).toEqual([
      "intro-id",
      "verse-id",
      "chorus-id",
    ]);
    expect(arrangement.every((section) => section.sectionId.length > 0)).toBe(true);
    expect(arrangement.map((section) => section.energy)).toEqual([null, null, null]);
  });

  test("reorder preserves section identity, instruction and energy while recalculating indexes and occurrences", () => {
    const stored = songBlueprintSchema.parse([
      { structureIndex: 0, sectionType: "Verse", occurrence: 1, instruction: "" },
      { structureIndex: 1, sectionType: "Chorus", occurrence: 1, instruction: "first chorus" },
      { structureIndex: 2, sectionType: "Verse", occurrence: 2, instruction: "" },
      {
        structureIndex: 3,
        sectionType: "Chorus",
        occurrence: 2,
        instruction: "wide second chorus",
        energy: 5,
      },
    ]);
    const arrangement = normalizeSongArrangement(
      ["Verse", "Chorus", "Verse", "Chorus"],
      stored,
      idFactory("verse-a", "chorus-a", "verse-b", "chorus-b"),
    );

    const movedId = arrangement[3]!.sectionId;
    const reordered = moveArrangementSection(arrangement, movedId, 1);

    expect(arrangementToSongStructure(reordered)).toEqual(["Verse", "Chorus", "Chorus", "Verse"]);
    expect(reordered.map((section) => section.structureIndex)).toEqual([0, 1, 2, 3]);
    expect(reordered.map((section) => [section.sectionType, section.occurrence])).toEqual([
      ["Verse", 1],
      ["Chorus", 1],
      ["Chorus", 2],
      ["Verse", 2],
    ]);

    const moved = reordered.find((section) => section.sectionId === movedId);
    expect(moved).toMatchObject({
      sectionId: movedId,
      structureIndex: 1,
      sectionType: "Chorus",
      occurrence: 1,
      instruction: "wide second chorus",
      energy: 5,
    });

    const originalFirstChorus = reordered.find((section) => section.sectionId === "chorus-a");
    expect(originalFirstChorus).toMatchObject({
      structureIndex: 2,
      occurrence: 2,
      instruction: "first chorus",
    });
  });

  test("instruction and energy updates target sectionId rather than position", () => {
    const arrangement = normalizeSongArrangement(
      ["Verse", "Chorus", "Verse"],
      [],
      idFactory("verse-a", "chorus-a", "verse-b"),
    );
    const reordered = moveArrangementSection(arrangement, "verse-b", 0);
    const withInstruction = updateArrangementInstruction(
      reordered,
      "verse-b",
      "stripped acoustic opening",
    );
    const withEnergy = updateArrangementEnergy(withInstruction, "verse-b", 2);

    expect(withEnergy[0]).toMatchObject({
      sectionId: "verse-b",
      sectionType: "Verse",
      occurrence: 1,
      instruction: "stripped acoustic opening",
      energy: 2,
    });
    expect(withEnergy.find((section) => section.sectionId === "verse-a")).toMatchObject({
      occurrence: 2,
      instruction: "",
      energy: null,
    });
  });

  test("duplicate copies section type, instruction and energy but creates a new identity", () => {
    let arrangement = normalizeSongArrangement(
      ["Verse", "Chorus"],
      [],
      idFactory("verse-a", "chorus-a"),
    );
    arrangement = updateArrangementInstruction(arrangement, "chorus-a", "full band");
    arrangement = updateArrangementEnergy(arrangement, "chorus-a", 4);

    const duplicated = duplicateArrangementSection(arrangement, "chorus-a", idFactory("chorus-b"));

    expect(duplicated).toHaveLength(3);
    expect(duplicated[1]).toMatchObject({
      sectionId: "chorus-a",
      sectionType: "Chorus",
      occurrence: 1,
      instruction: "full band",
      energy: 4,
    });
    expect(duplicated[2]).toMatchObject({
      sectionId: "chorus-b",
      sectionType: "Chorus",
      occurrence: 2,
      instruction: "full band",
      energy: 4,
    });
    expect(duplicated[2]!.sectionId).not.toBe(duplicated[1]!.sectionId);
  });

  test("remove uses sectionId and preserves metadata on surviving repeated sections", () => {
    let arrangement = normalizeSongArrangement(
      ["Chorus", "Verse", "Chorus"],
      [],
      idFactory("chorus-a", "verse-a", "chorus-b"),
    );
    arrangement = updateArrangementInstruction(arrangement, "chorus-b", "late chorus");
    arrangement = updateArrangementEnergy(arrangement, "chorus-b", 5);

    const next = removeArrangementSection(arrangement, "chorus-a");
    expect(next.map((section) => section.sectionId)).toEqual(["verse-a", "chorus-b"]);
    expect(next.find((section) => section.sectionId === "chorus-b")).toMatchObject({
      structureIndex: 1,
      occurrence: 1,
      instruction: "late chorus",
      energy: 5,
    });
  });

  test("regular-Chorus instruction apply excludes Final Chorus in normalized runtime state", () => {
    const arrangement = normalizeSongArrangement(
      ["Chorus", "Verse", "Chorus", "Final Chorus"],
      [],
      idFactory("chorus-a", "verse-a", "chorus-b", "final-a"),
    );
    const next = applyInstructionToAllRegularChoruses(arrangement, "bigger drums");

    expect(next[0]!.instruction).toBe("bigger drums");
    expect(next[2]!.instruction).toBe("bigger drums");
    expect(next[3]!.instruction).toBe("");
    expect(next.map((section) => section.sectionId)).toEqual([
      "chorus-a",
      "verse-a",
      "chorus-b",
      "final-a",
    ]);
  });

  test("regular-Chorus energy apply excludes Final Chorus", () => {
    const arrangement = normalizeSongArrangement(
      ["Chorus", "Verse", "Chorus", "Final Chorus"],
      [],
      idFactory("chorus-a", "verse-a", "chorus-b", "final-a"),
    );
    const next = applyEnergyToAllRegularChoruses(arrangement, 4);

    expect(next[0]!.energy).toBe(4);
    expect(next[2]!.energy).toBe(4);
    expect(next[3]!.energy).toBeNull();
  });

  test("energy-only sections are active Blueprint input", () => {
    const parsed = songBlueprintSchema.parse([
      {
        sectionId: "intro-a",
        structureIndex: 0,
        sectionType: "Intro",
        occurrence: 1,
        instruction: "",
        energy: 2,
      },
      {
        sectionId: "verse-a",
        structureIndex: 1,
        sectionType: "Verse",
        occurrence: 1,
        instruction: "",
        energy: null,
      },
    ]);

    expect(activeSongBlueprint(parsed).map((section) => section.sectionId)).toEqual(["intro-a"]);
  });

  test("serialized arrangement round-trip preserves stable IDs and energy", () => {
    let arrangement = normalizeSongArrangement(
      ["Intro", "Chorus"],
      [],
      idFactory("intro-a", "chorus-a"),
    );
    arrangement = updateArrangementEnergy(arrangement, "chorus-a", 5);
    arrangement = updateArrangementInstruction(arrangement, "chorus-a", "largest vocal stack");

    const stored = arrangementToSongBlueprint(arrangement);
    const restored = normalizeSongArrangement(
      arrangementToSongStructure(arrangement),
      stored,
      idFactory("should-not-be-used"),
    );

    expect(restored).toEqual(arrangement);
  });

  test("existing Blueprint rebuilds preserve sectionId and energy metadata", () => {
    const stored = songBlueprintSchema.parse([
      {
        sectionId: "chorus-a",
        structureIndex: 0,
        sectionType: "Chorus",
        occurrence: 1,
        instruction: "wide",
        energy: 4,
      },
    ]);

    expect(buildSongBlueprint(["Chorus"], stored)[0]).toMatchObject({
      sectionId: "chorus-a",
      instruction: "wide",
      energy: 4,
    });
  });

  test("old GeneratorInputSnapshot without sectionId or energy remains valid", () => {
    const parsed = generatorInputSnapshotSchema.parse({
      generatorMode: "advanced",
      songStructure: ["Verse", "Chorus"],
      songBlueprint: [
        {
          structureIndex: 0,
          sectionType: "Verse",
          occurrence: 1,
          instruction: "intimate",
        },
        {
          structureIndex: 1,
          sectionType: "Chorus",
          occurrence: 1,
          instruction: "wide",
        },
      ],
    });

    expect(parsed.songBlueprint[0]?.sectionId).toBeUndefined();
    expect(parsed.songBlueprint[0]?.energy).toBeUndefined();
    expect(parsed.songStructure).toEqual(["Verse", "Chorus"]);
  });

  test("revision diff detects arrangement energy changes in songBlueprint", () => {
    const base = generatorInputSnapshotSchema.parse({
      generatorMode: "advanced",
      songStructure: ["Verse", "Chorus"],
      songBlueprint: [
        {
          sectionId: "verse-a",
          structureIndex: 0,
          sectionType: "Verse",
          occurrence: 1,
          instruction: "",
          energy: 2,
        },
        {
          sectionId: "chorus-a",
          structureIndex: 1,
          sectionType: "Chorus",
          occurrence: 1,
          instruction: "wide",
          energy: 4,
        },
      ],
    });
    const desired = generatorInputSnapshotSchema.parse({
      ...base,
      songBlueprint: base.songBlueprint.map((section) =>
        section.sectionId === "chorus-a" ? { ...section, energy: 5 } : section,
      ),
    });

    expect(diffGeneratorSnapshots(base, desired)).toContain("songBlueprint");
  });

  test("new GeneratorInputSnapshot accepts persisted section IDs and energy without a DB migration", () => {
    const parsed = generatorInputSnapshotSchema.parse({
      generatorMode: "advanced",
      songStructure: ["Verse", "Chorus"],
      songBlueprint: [
        {
          sectionId: "verse-a",
          structureIndex: 0,
          sectionType: "Verse",
          occurrence: 1,
          instruction: "",
          energy: 2,
        },
        {
          sectionId: "chorus-a",
          structureIndex: 1,
          sectionType: "Chorus",
          occurrence: 1,
          instruction: "open wide",
          energy: 5,
        },
      ],
    });

    expect(parsed.songBlueprint[0]?.sectionId).toBe("verse-a");
    expect(parsed.songBlueprint[0]?.energy).toBe(2);
    expect(parsed.songBlueprint[1]?.sectionId).toBe("chorus-a");
    expect(parsed.songBlueprint[1]?.energy).toBe(5);
  });
});
