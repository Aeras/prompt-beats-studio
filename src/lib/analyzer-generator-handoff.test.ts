import { describe, expect, test } from "bun:test";

import { generatorInputSnapshotSchema } from "./generator-revision.shared";
import { buildSongBlueprint, songBlueprintSchema } from "./song-blueprint.shared";

describe("Analyzer to Generator handoff bounds", () => {
  test("Generator snapshot accepts canonical Analyzer-sized generator-ready fields", () => {
    const longSection = "S".repeat(120);
    const structure = [longSection, "Verse 1", "Chorus 1"];
    const snapshot = generatorInputSnapshotSchema.parse({
      generatorMode: "advanced",
      theme: "Recreate the analyzed musical direction with original lyrics.",
      selectedMusicStyles: [],
      customMusicStyle: "M".repeat(4000),
      selectedMoods: [],
      customMood: "V".repeat(2000),
      language: "Greek",
      languageVariant: "",
      customLanguage: "",
      selectedInstruments: [],
      customInstruments: "I".repeat(32000),
      bpmMode: "Custom",
      customBpm: "81",
      songStructure: structure,
      songBlueprint: buildSongBlueprint(structure),
      productionStyle: "P".repeat(4000),
      additionalInstructions: "A".repeat(4000),
      targetPlatform: "suno",
      generationModel: "gemini-3.8-flash",
    });

    expect(snapshot.customMusicStyle).toHaveLength(4000);
    expect(snapshot.customMood).toHaveLength(2000);
    expect(snapshot.customInstruments).toHaveLength(32000);
    expect(snapshot.songStructure[0]).toHaveLength(120);
    expect(songBlueprintSchema.parse(snapshot.songBlueprint)[0]?.sectionType).toHaveLength(120);
    expect(snapshot.productionStyle).toHaveLength(4000);
    expect(snapshot.additionalInstructions).toHaveLength(4000);
  });
});
