import { describe, expect, test } from "bun:test";
import {
  activeSongBlueprint,
  appendBlueprintSection,
  applyInstructionToAllRegularChoruses,
  buildSongBlueprint,
  removeBlueprintSection,
  updateBlueprintInstruction,
} from "./song-blueprint.shared";

describe("Song Blueprint helpers", () => {
  test("repeated sections get independent occurrence identities", () => {
    const blueprint = buildSongBlueprint(["Verse", "Chorus", "Verse", "Chorus", "Final Chorus"]);
    expect(blueprint.map((item) => [item.sectionType, item.occurrence])).toEqual([
      ["Verse", 1],
      ["Chorus", 1],
      ["Verse", 2],
      ["Chorus", 2],
      ["Final Chorus", 1],
    ]);
  });

  test("instructions remain independent by occurrence", () => {
    let blueprint = buildSongBlueprint(["Chorus", "Verse", "Chorus"]);
    blueprint = updateBlueprintInstruction(blueprint, 0, "soft first chorus");
    blueprint = updateBlueprintInstruction(blueprint, 2, "wide second chorus");
    expect(blueprint[0]?.instruction).toBe("soft first chorus");
    expect(blueprint[2]?.instruction).toBe("wide second chorus");
  });

  test("apply to all regular Choruses excludes Final Chorus", () => {
    let blueprint = buildSongBlueprint(["Chorus", "Verse", "Chorus", "Final Chorus"]);
    blueprint = applyInstructionToAllRegularChoruses(blueprint, "bigger drums");
    expect(blueprint[0]?.instruction).toBe("bigger drums");
    expect(blueprint[2]?.instruction).toBe("bigger drums");
    expect(blueprint[3]?.instruction).toBe("");
  });

  test("removing a section shifts later blueprint indexes without losing instructions", () => {
    let blueprint = buildSongBlueprint(["Verse", "Chorus", "Verse"]);
    blueprint = updateBlueprintInstruction(blueprint, 2, "late verse");
    blueprint = removeBlueprintSection(blueprint, 1);
    expect(blueprint.map((item) => item.structureIndex)).toEqual([0, 1]);
    expect(blueprint[1]?.sectionType).toBe("Verse");
    expect(blueprint[1]?.occurrence).toBe(2);
    expect(blueprint[1]?.instruction).toBe("late verse");
  });

  test("append creates a new blank occurrence", () => {
    let blueprint = buildSongBlueprint(["Verse", "Chorus"]);
    blueprint = appendBlueprintSection(blueprint, "Chorus");
    expect(blueprint[2]?.sectionType).toBe("Chorus");
    expect(blueprint[2]?.occurrence).toBe(2);
    expect(blueprint[2]?.instruction).toBe("");
  });

  test("active blueprint omits blank instructions", () => {
    let blueprint = buildSongBlueprint(["Intro", "Verse", "Chorus"]);
    blueprint = updateBlueprintInstruction(blueprint, 1, "intimate vocal");
    expect(activeSongBlueprint(blueprint).map((item) => item.sectionType)).toEqual(["Verse"]);
  });
});
