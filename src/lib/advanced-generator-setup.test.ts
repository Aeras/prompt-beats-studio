import { describe, expect, test } from "bun:test";

import {
  advancedSetupFilename,
  parseAdvancedSetup,
  serializeAdvancedSetup,
  splitKnownValues,
  type AdvancedGeneratorSetup,
} from "./advanced-generator-setup";

const setup: AdvancedGeneratorSetup = {
  targetPlatform: "udio",
  theme: "Beach reunion",
  selectedMusicStyles: ["Pop", "Unknown Style"],
  customMusicStyle: "cumbia",
  selectedMoods: ["Happy"],
  customMood: "",
  selectedInstruments: ["Guitar"],
  customInstruments: "",
  bpmMode: "Custom",
  customBpm: "104",
  songStructure: ["Verse", "Chorus", "Verse", "Chorus"],
  songBlueprint: [
    { structureIndex: 1, sectionType: "Chorus", occurrence: 1, instruction: "big", energy: 4 },
  ],
  productionStyle: "warm",
  additionalInstructions: "playful",
  language: "Greek",
  languageVariant: "",
  customLanguage: "",
  smartPresetId: "",
  culturalStyleId: "",
};

describe("advanced generator setup", () => {
  test("round-trips and normalizes blueprint", () => {
    const parsed = parseAdvancedSetup(serializeAdvancedSetup(setup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.setup.theme).toBe("Beach reunion");
    expect(parsed.setup.songBlueprint).toHaveLength(4);
    expect(parsed.setup.songBlueprint[1]?.instruction).toBe("big");
  });

  test("rejects arbitrary JSON, bad format and bad version", () => {
    expect(parseAdvancedSetup("not json")).toEqual({ ok: false, error: "invalid" });
    expect(parseAdvancedSetup("[]")).toEqual({ ok: false, error: "invalid" });
    expect(parseAdvancedSetup(JSON.stringify({ format: "x", schemaVersion: 1 }))).toEqual({
      ok: false,
      error: "invalid",
    });
    const v2 = JSON.parse(serializeAdvancedSetup(setup));
    v2.schemaVersion = 2;
    expect(parseAdvancedSetup(JSON.stringify(v2))).toEqual({ ok: false, error: "version" });
  });

  test("rejects wrong types, platforms and unknown keys", () => {
    const base = JSON.parse(serializeAdvancedSetup(setup));
    for (const patch of [
      { targetPlatform: "other" },
      { selectedMoods: [1] },
      { customBpm: 104 },
      { songBlueprint: [{ foo: 1 }] },
      { extra: "x" },
    ]) {
      const bad = { ...base, setup: { ...base.setup, ...patch } };
      expect(parseAdvancedSetup(JSON.stringify(bad)).ok).toBe(false);
    }
  });

  test("preserves unknown chip values in custom field", () => {
    expect(splitKnownValues(["Pop", "Rare"], ["Pop"], "cumbia")).toEqual({
      selected: ["Pop"],
      custom: "cumbia, Rare",
    });
  });

  test("filename format", () => {
    expect(advancedSetupFilename(new Date(2026, 8, 3))).toBe(
      "promptbeats-advanced-setup-2026-09-03.json",
    );
  });
});
