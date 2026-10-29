import {
  planInspirationApplication,
  inspirationPlanSignature,
} from "./music-inspiration-apply.shared";
import {
  createMusicTracker,
  trackMusicValue,
  sameGeneratorFrame,
} from "./music-inspiration-generator-state";
import { describe, expect, it } from "bun:test";
import type { AdvancedGeneratorSetup } from "./advanced-generator-setup";
import {
  applyInspirationProposal,
  mergeInspirationList,
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

describe("PB-013 safe list enrichment primitive", () => {
  it("retains original order and only appends genuinely new case/spacing variants", () => {
    const original = ["Electric Guitar", "Bass"];
    const result = mergeInspirationList(original, [
      " electric  guitar ",
      "Piano",
      "BASS",
      "Fingerstyle Guitar",
      "piano",
    ]);
    expect(result).toEqual(["Electric Guitar", "Bass", "Piano", "Fingerstyle Guitar"]);
    expect(original).toEqual(["Electric Guitar", "Bass"]);
  });
  it("does not mistakenly deduplicate broader versus narrower techniques", () => {
    expect(mergeInspirationList(["Acoustic Guitar"], ["Fingerstyle Acoustic Guitar"])).toEqual([
      "Acoustic Guitar",
      "Fingerstyle Acoustic Guitar",
    ]);
  });
  it("ignores whitespace-only candidates without mutating current values", () => {
    expect(mergeInspirationList(["Rock"], [" ", "", "Rock"])).toEqual(["Rock"]);
  });
});

describe("PB-013 authoritative planner", () => {
  it("represents seven groups and delegates exactly to the same plan", () => {
    const actions = Object.fromEntries(
      [
        "selectedMusicStyles",
        "selectedMoods",
        "selectedInstruments",
        "bpm",
        "productionStyle",
        "additionalInstructions",
        "arrangement",
      ].map((f) => [f, "fill"]),
    );
    const plan = planInspirationApplication(current, proposal, actions as any);
    expect(plan.groups).toHaveLength(7);
    expect(plan).toEqual(applyInspirationProposal(current, proposal));
    expect(plan.receipt!.after).toEqual(plan.setup);
    expect(plan.appliedFields).toHaveLength(7);
    expect(plan.destructiveFields).toEqual([]);
  });
  it("true no-op has no receipt, including deterministic atomic Arrangement IDs", () => {
    const first = applyInspirationProposal(current, proposal).setup;
    const again = planInspirationApplication(first, proposal, {
      arrangement: "replace",
      productionStyle: "replace",
      bpm: "replace",
    });
    expect(again.appliedFields).toEqual([]);
    expect(again.destructiveFields).toEqual([]);
    expect(again.receipt).toBeUndefined();
    expect(again.setup).toEqual(first);
    expect(planInspirationApplication(current, proposal, { arrangement: "replace" })).toEqual(
      planInspirationApplication(current, proposal, { arrangement: "replace" }),
    );
  });
  it("Add keeps catalog/custom information and distinguishes different musical techniques", () => {
    const before = {
      ...current,
      selectedInstruments: ["Electric Guitar"],
      customInstruments: "Fingerstyle Guitar, Synth",
      customMusicStyle: "Ｋｉｎｏ",
    };
    const value = {
      ...proposal,
      instruments: ["electric  guitar", "Synth", "Piano", "Fingerstyle Acoustic Guitar"],
      musicStyles: ["kino", "Post-punk"],
    };
    const plan = planInspirationApplication(before, value, {
      selectedInstruments: "add",
      selectedMusicStyles: "add",
    });
    expect(plan.setup.selectedInstruments).toEqual(["Electric Guitar", "Piano"]);
    expect(plan.setup.customInstruments).toBe(
      "Fingerstyle Guitar, Synth, Fingerstyle Acoustic Guitar",
    );
    expect(plan.setup.customMusicStyle).toBe("Ｋｉｎｏ, Post-punk");
    expect(plan.destructiveFields).toEqual([]);
    expect(before.customInstruments).toBe("Fingerstyle Guitar, Synth");
    expect(
      planInspirationApplication(plan.setup, value, {
        selectedInstruments: "add",
        selectedMusicStyles: "add",
      }).appliedFields,
    ).toEqual([]);
  });
  it("text enrichment deduplicates exact equivalent lines without dropping different techniques", () => {
    const before = {
      ...current,
      productionStyle: "Warm synths\nDry vocal",
      additionalInstructions: "Use piano",
    };
    const value = {
      ...proposal,
      productionStyle: "warm  synths\nAnalog bass",
      additionalInstructions: "Use electric piano",
    };
    const plan = planInspirationApplication(before, value, {
      productionStyle: "add",
      additionalInstructions: "add",
    });
    expect(plan.setup.productionStyle).toBe("Warm synths\nDry vocal\nAnalog bass");
    expect(plan.setup.additionalInstructions).toBe("Use piano\nUse electric piano");
  });
  it("opposing clauses and length overflow block without truncation or mutation", () => {
    const before = {
      ...current,
      productionStyle: "No reverb",
      additionalInstructions: "x".repeat(3995),
    };
    const value = {
      ...proposal,
      productionStyle: "Use reverb",
      additionalInstructions: "y".repeat(20),
    };
    const plan = planInspirationApplication(before, value, {
      productionStyle: "add",
      additionalInstructions: "add",
    });
    expect(plan.blocked).toBe(true);
    expect(plan.groups.find((g) => g.field === "productionStyle")!.issue).toBe("conflict");
    expect(plan.groups.find((g) => g.field === "additionalInstructions")!.issue).toBe("length");
    expect(plan.setup.productionStyle).toBe(before.productionStyle);
    expect(plan.setup.additionalInstructions).toBe(before.additionalInstructions);
    expect(plan.receipt).toBeUndefined();
  });
  it("BPM/Arrangement Add is rejected and missing values never erase populated groups", () => {
    const before = applyInspirationProposal(current, proposal).setup;
    const unsupported = planInspirationApplication(before, proposal, {
      bpm: "add",
      arrangement: "add",
    });
    expect(unsupported.blocked).toBe(true);
    expect(unsupported.setup).toEqual(before);
    const empty = {
      ...proposal,
      bpm: null,
      songStructure: [],
      blueprint: [],
      musicStyles: [],
      productionStyle: "",
    };
    expect(
      planInspirationApplication(before, empty, {
        bpm: "replace",
        arrangement: "replace",
        selectedMusicStyles: "replace",
        productionStyle: "replace",
      }).setup,
    ).toEqual(before);
    expect(() =>
      planInspirationApplication(before, proposal, { theme: "replace" } as any),
    ).toThrow();
  });
  it("Keep and unselected groups stay byte-identical, Replace requires only actual destructive groups", () => {
    const before = {
      ...current,
      theme: "Personal theme",
      productionStyle: "Manual",
      customMood: "Manual mood",
    };
    const plan = planInspirationApplication(before, proposal, {
      productionStyle: "replace",
      selectedMoods: "keep",
    });
    expect(plan.appliedFields).toEqual(["productionStyle"]);
    expect(plan.destructiveFields).toEqual(["productionStyle"]);
    expect(plan.setup.customMood).toBe("Manual mood");
    expect(plan.setup.theme).toBe("Personal theme");
  });
  it("batched ABA edits invalidate confirmation and Undo ownership without waiting for render", () => {
    const tracker = createMusicTracker();
    const before = { ...current, productionStyle: "Manual" };
    const plan = planInspirationApplication(before, proposal, { productionStyle: "replace" });
    const versions = { ...tracker.versions };
    const signature = inspirationPlanSignature({ kind: "job", id: "fixture" }, plan, versions);
    trackMusicValue(tracker, "production", "productionStyle", "Changed");
    trackMusicValue(tracker, "production", "productionStyle", "Manual");
    expect(
      inspirationPlanSignature({ kind: "job", id: "fixture" }, plan, tracker.versions),
    ).not.toBe(signature);
    expect(
      sameGeneratorFrame(
        { setup: before, versions },
        { setup: before, versions: tracker.versions },
      ),
    ).toBe(false);
    expect(tracker.values["production"]).toBe("Manual");
  });
});

it("list Add blocks exact opposition without losing distinct values", () => {
  const before = { ...current, customInstruments: "No drums" };
  const plan = planInspirationApplication(
    before,
    { ...proposal, instruments: ["Use drums"] },
    { selectedInstruments: "add" },
  );
  expect(plan.blocked).toBe(true);
  expect(plan.groups.find((g) => g.field === "selectedInstruments")!.issue).toBe("conflict");
  expect(plan.setup.customInstruments).toBe("No drums");
  expect(plan.receipt).toBeUndefined();
});
it("confirmation ignores unrelated groups but binds source revision and exact consequences", () => {
  const before = { ...current, productionStyle: "Manual" };
  const tracker = createMusicTracker();
  const actions = { productionStyle: "replace" as const };
  const plan = planInspirationApplication(before, proposal, actions);
  const source = { kind: "profile", id: "fixture", revision: 1 };
  const signature = inspirationPlanSignature(source, plan, tracker.versions);
  trackMusicValue(tracker, "customMood", "selectedMoods", "Changed mood");
  expect(inspirationPlanSignature(source, plan, tracker.versions)).toBe(signature);
  expect(inspirationPlanSignature({ ...source, revision: 2 }, plan, tracker.versions)).not.toBe(
    signature,
  );
  const changed = planInspirationApplication(
    before,
    { ...proposal, productionStyle: "New source proposal" },
    actions,
  );
  expect(inspirationPlanSignature(source, changed, tracker.versions)).not.toBe(signature);
});
