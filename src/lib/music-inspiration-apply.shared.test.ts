import { describe, expect, it } from "vitest";
import type { AdvancedGeneratorSetup } from "./advanced-generator-setup";
import { applyInspirationProposal } from "./music-inspiration-apply.shared";
import type { InspirationResearch } from "./music-inspiration.shared";

const current: AdvancedGeneratorSetup = {
  targetPlatform: "suno",
  theme: "My original subject",
  selectedMusicStyles: [], customMusicStyle: "",
  selectedMoods: [], customMood: "",
  selectedInstruments: [], customInstruments: "",
  bpmMode: "auto", customBpm: "",
  songStructure: [], songBlueprint: [],
  productionStyle: "", additionalInstructions: "",
  language: "Greek", languageVariant: "Modern", customLanguage: "",
  smartPresetId: "", culturalStyleId: "",
};
const proposal: InspirationResearch["proposal"] = {
  musicStyles: ["Pop"], moods: ["Nostalgic"], instruments: ["Synth"],
  bpm: 120, productionStyle: "Warm vintage synths",
  additionalInstructions: "Original melodic hook.",
  songStructure: ["Verse", "Chorus", "Chorus"],
  blueprint: [
    { structureIndex: 0, sectionType: "Verse", instruction: "Sparse.", energy: 2 },
    { structureIndex: 1, sectionType: "Chorus", instruction: "Bright.", energy: 4 },
    { structureIndex: 2, sectionType: "Chorus", instruction: "Full.", energy: 5 },
  ],
  supportingEvidenceIds: [], creativeChoices: ["Tempo selected creatively"],
};

describe("inspiration proposal draft application", () => {
  it("fills empty fields including duplicate section occurrences", () => {
    const result = applyInspirationProposal(current, proposal);
    expect(result.appliedFields).toHaveLength(7);
    expect(result.setup.songBlueprint.map((s) => s.occurrence)).toEqual([1, 1, 2]);
    expect(result.setup.songBlueprint.map((s) => s.energy)).toEqual([2, 4, 5]);
    expect(result.setup.customBpm).toBe("120");
    expect(result.setup.theme).toBe("My original subject");
    expect(result.setup.language).toBe("Greek");
    expect(current.songStructure).toEqual([]);
  });
  it("preserves existing user fields by default", () => {
    const existing = { ...current, customMusicStyle: "Handcrafted rock", customBpm: "96",
      bpmMode: "custom", productionStyle: "Dry guitars", songStructure: ["Bridge"],
      songBlueprint: [{ structureIndex: 0, sectionType: "Bridge", occurrence: 1, instruction: "Manual", energy: 3 as const }] };
    const result = applyInspirationProposal(existing, proposal);
    expect(result.setup.customMusicStyle).toBe("Handcrafted rock");
    expect(result.setup.customBpm).toBe("96");
    expect(result.setup.productionStyle).toBe("Dry guitars");
    expect(result.setup.songBlueprint[0]?.instruction).toBe("Manual");
    expect(result.skippedFields).toContain("arrangement");
    expect(result.skippedFields).toContain("bpm");
  });
  it("explicit replacement never changes theme, language, platform or preset", () => {
    const existing = { ...current, theme: "Protected", language: "Russian", smartPresetId: "manual-preset" };
    const result = applyInspirationProposal(existing, proposal, undefined, "replace_selected");
    expect(result.setup.theme).toBe("Protected");
    expect(result.setup.language).toBe("Russian");
    expect(result.setup.smartPresetId).toBe("manual-preset");
    expect(result.setup.targetPlatform).toBe("suno");
  });
  it("selectively applies requested field groups only", () => {
    const result = applyInspirationProposal(current, proposal, ["productionStyle"]);
    expect(result.appliedFields).toEqual(["productionStyle"]);
    expect(result.setup.selectedInstruments).toEqual([]);
    expect(result.setup.songStructure).toEqual([]);
  });
  it("rejects invalid resulting setup without mutating the input", () => {
    const tooLong = { ...proposal, productionStyle: "x".repeat(4001) };
    expect(() => applyInspirationProposal(current, tooLong)).toThrow();
    expect(current.productionStyle).toBe("");
  });
});
