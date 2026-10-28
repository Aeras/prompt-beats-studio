import { describe, expect, it } from "bun:test";
import type { AdvancedGeneratorSetup } from "./advanced-generator-setup";
import {
  applyInspirationProposal,
  undoInspirationProposal,
} from "./music-inspiration-apply.shared";
import type { InspirationResearch } from "./music-inspiration.shared";

const current: AdvancedGeneratorSetup = {
  targetPlatform: "suno",
  theme: "My original subject",
  selectedMusicStyles: [],
  customMusicStyle: "",
  selectedMoods: [],
  customMood: "",
  selectedInstruments: [],
  customInstruments: "",
  bpmMode: "auto",
  customBpm: "",
  songStructure: [],
  songBlueprint: [],
  productionStyle: "",
  additionalInstructions: "",
  language: "Greek",
  languageVariant: "Modern",
  customLanguage: "",
  smartPresetId: "",
  culturalStyleId: "",
};
const proposal: InspirationResearch["proposal"] = {
  musicStyles: ["Pop"],
  moods: ["Nostalgic"],
  instruments: ["Synth"],
  bpm: 120,
  productionStyle: "Warm vintage synths",
  additionalInstructions: "Original melodic hook.",
  songStructure: ["Verse", "Chorus", "Chorus"],
  blueprint: [
    { structureIndex: 0, sectionType: "Verse", instruction: "Sparse.", energy: 2 },
    { structureIndex: 1, sectionType: "Chorus", instruction: "Bright.", energy: 4 },
    { structureIndex: 2, sectionType: "Chorus", instruction: "Full.", energy: 5 },
  ],
  supportingEvidenceIds: [],
  creativeChoices: ["Tempo selected creatively"],
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
    const existing = {
      ...current,
      customMusicStyle: "Handcrafted rock",
      customBpm: "96",
      bpmMode: "custom",
      productionStyle: "Dry guitars",
      songStructure: ["Bridge"],
      songBlueprint: [
        {
          structureIndex: 0,
          sectionType: "Bridge",
          occurrence: 1,
          instruction: "Manual",
          energy: 3 as const,
        },
      ],
    };
    const result = applyInspirationProposal(existing, proposal);
    expect(result.setup.customMusicStyle).toBe("Handcrafted rock");
    expect(result.setup.customBpm).toBe("96");
    expect(result.setup.productionStyle).toBe("Dry guitars");
    expect(result.setup.songBlueprint[0]?.instruction).toBe("Manual");
    expect(result.skippedFields).toContain("arrangement");
    expect(result.skippedFields).toContain("bpm");
  });
  it("explicit replacement never changes theme, language, platform or preset", () => {
    const existing = {
      ...current,
      theme: "Protected",
      language: "Russian",
      smartPresetId: "manual-preset",
    };
    const result = applyInspirationProposal(existing, proposal, undefined, "replace_selected");
    expect(result.setup.theme).toBe("Protected");
    expect(result.setup.language).toBe("Russian");
    expect(result.setup.smartPresetId).toBe("manual-preset");
    expect(result.setup.targetPlatform).toBe("suno");
  });
  it("clears conflicting custom styles only on explicit replacement", () => {
    const existing = {
      ...current,
      customMusicStyle: "My own style",
      customMood: "Own mood",
      customInstruments: "Own instrument",
    };
    const replaced = applyInspirationProposal(
      existing,
      proposal,
      ["selectedMusicStyles", "selectedMoods", "selectedInstruments"],
      "replace_selected",
    );
    expect(replaced.setup.customMusicStyle).toBe("");
    expect(replaced.setup.customMood).toBe("");
    expect(replaced.setup.customInstruments).toBe("");
    expect(existing.customMusicStyle).toBe("My own style");
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

it("uses canonical Custom and preserves explicit tempo modes", () => {
  expect(applyInspirationProposal(current, proposal).setup.bpmMode).toBe("Custom");
  for (const bpmMode of ["Custom", "120", "Slow", "custom"])
    expect(applyInspirationProposal({ ...current, bpmMode }, proposal).skippedFields).toContain(
      "bpm",
    );
});
it("keeps unknown energy null and section IDs stable on repeated apply", () => {
  const nullable = {
    ...proposal,
    blueprint: proposal.blueprint.map((s) => ({ ...s, energy: null })),
  };
  const first = applyInspirationProposal(current, nullable);
  const second = applyInspirationProposal(
    first.setup,
    nullable,
    ["arrangement"],
    "replace_selected",
  );
  expect(second.setup.songBlueprint.map((s) => s.sectionId)).toEqual(
    first.setup.songBlueprint.map((s) => s.sectionId),
  );
  expect(new Set(first.setup.songBlueprint.map((s) => s.sectionId)).size).toBe(3);
  expect(first.setup.songBlueprint.map((s) => s.energy)).toEqual([null, null, null]);
});
it("undo preserves later manual and custom edits and reports ambiguity", () => {
  const applied = applyInspirationProposal(
    { ...current, customMusicStyle: "Prior" },
    proposal,
    undefined,
    "replace_selected",
  );
  const edited = {
    ...applied.setup,
    customMusicStyle: "Later",
    additionalInstructions: "Later instruction",
    theme: "Later theme",
  };
  const undone = undoInspirationProposal(edited, applied.receipt!);
  expect(undone.setup.customMusicStyle).toBe("Later");
  expect(undone.setup.additionalInstructions).toBe("Later instruction");
  expect(undone.setup.theme).toBe("Later theme");
  expect(undone.ambiguousFields).toEqual(["selectedMusicStyles", "additionalInstructions"]);
  expect(undone.setup.songBlueprint).toEqual([]);
  expect(undoInspirationProposal(applied.setup, applied.receipt!).setup).toEqual({
    ...current,
    customMusicStyle: "Prior",
  });
});
it("rejects malformed proposal, selection and mode even if not selected", () => {
  expect(() => applyInspirationProposal(current, { ...proposal, blueprint: [] }, [])).toThrow();
  expect(() => applyInspirationProposal(current, proposal, ["theme" as never])).toThrow();
  expect(() => applyInspirationProposal(current, proposal, [], "bad" as never)).toThrow();
  expect(() =>
    applyInspirationProposal(current, {
      ...proposal,
      blueprint: proposal.blueprint.map((s) => ({ ...s, energy: 0 })),
    } as never),
  ).toThrow();
});

it("puts unknown suggestions in visible custom fields before recording the receipt", () => {
  const unknown = {
    ...proposal,
    musicStyles: ["Pop", "Post-synth folk", "synth"],
    moods: ["Nostalgic", "Quiet anticipation", "anticipation"],
    instruments: ["Synth", "Prepared tape keyboard", "tape"],
  };
  const result = applyInspirationProposal(current, unknown);
  expect(result.setup.selectedMusicStyles).toEqual(["Pop"]);
  expect(result.setup.customMusicStyle).toBe("Post-synth folk, synth");
  expect(result.setup.selectedMoods).toEqual(["Nostalgic"]);
  expect(result.setup.customMood).toBe("Quiet anticipation, anticipation");
  expect(result.setup.selectedInstruments).toEqual(["Synth"]);
  expect(result.setup.customInstruments).toBe("Prepared tape keyboard, tape");
  expect(result.receipt!.after).toEqual(result.setup);
  expect(undoInspirationProposal(result.setup, result.receipt!).setup).toEqual(current);
});
it("replaces selected custom fields with complete proposal text and restores exact prior values", () => {
  const before = {
    ...current,
    selectedMusicStyles: ["Rock"],
    customMusicStyle: "Manual style",
    customMood: "Manual mood",
    customInstruments: "Manual instrument",
  };
  const unknown = {
    ...proposal,
    musicStyles: ["Synth-pop", "pop", "Synth-pop"],
    moods: ["Reflective dusk", "dusk"],
    instruments: ["Tape loop", "loop"],
  };
  const result = applyInspirationProposal(
    before,
    unknown,
    ["selectedMusicStyles", "selectedMoods", "selectedInstruments"],
    "replace_selected",
  );
  expect(result.setup.selectedMusicStyles).toEqual([]);
  expect(result.setup.customMusicStyle).toBe("Synth-pop, pop, Synth-pop");
  expect(result.setup.customMood).toBe("Reflective dusk, dusk");
  expect(result.setup.customInstruments).toBe("Tape loop, loop");
  expect(result.receipt!.after).toEqual(result.setup);
  expect(undoInspirationProposal(result.setup, result.receipt!).setup).toEqual(before);
  const edited = { ...result.setup, customInstruments: "Later manual loop" };
  const undone = undoInspirationProposal(edited, result.receipt!);
  expect(undone.setup.customInstruments).toBe("Later manual loop");
  expect(undone.ambiguousFields).toEqual(["selectedInstruments"]);
});
