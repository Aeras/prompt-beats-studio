import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ATLAS_SOURCE_SHA, type AtlasHandoff } from "./song-atlas.shared";
import {
  createAtlasInstructionLayer,
  restoreAtlasInstructionLayer,
  replaceAtlasInstructionLayer,
  composeAtlasInstructions,
  parseAtlasAwareSetup,
  serializeAtlasAwareSetup,
} from "./atlas-instructions.shared";
import {
  serializeAdvancedSetup,
  parseAdvancedSetup,
  type AdvancedGeneratorSetup,
} from "./advanced-generator-setup";
const origin: AtlasHandoff = {
  format: "promptbeats-atlas-handoff",
  schemaVersion: 1,
  id: "ca290000-0000-4000-8000-000000000001",
  sourceSha: ATLAS_SOURCE_SHA,
  selection: { profileIds: ["ru.chastushka"], optionIds: ["ru.chastushka.mode.lively"] },
};
const layer = createAtlasInstructionLayer({
  handoff: origin,
  instructions: "Atlas fixture directive",
  creativeTechniques: "Fixture",
});
const setup: AdvancedGeneratorSetup = {
  targetPlatform: "udio",
  theme: "User theme",
  selectedMusicStyles: [],
  customMusicStyle: "Pop",
  selectedMoods: [],
  customMood: "Calm",
  selectedInstruments: [],
  customInstruments: "",
  bpmMode: "Auto",
  customBpm: "",
  songStructure: [],
  songBlueprint: [],
  productionStyle: "",
  additionalInstructions: "Manual text",
  language: "Greek",
  languageVariant: "",
  customLanguage: "",
  smartPresetId: "",
  culturalStyleId: "",
};
describe("explicit Atlas instruction ownership", () => {
  test("apply then remove changes only the Atlas layer", () => {
    const manual = "My exact text\nwith spacing  ";
    const applied = replaceAtlasInstructionLayer(null, layer);
    expect(composeAtlasInstructions(manual, applied)).toBe(manual + "\n\n" + layer.text);
    expect(composeAtlasInstructions(manual, null)).toBe(manual);
  });
  test("identical manual wording is never claimed as Atlas-owned", () => {
    const manual = "Do not use: " + layer.text;
    expect(composeAtlasInstructions(manual, layer)).toBe(manual + "\n\n" + layer.text);
    expect(composeAtlasInstructions(manual, null)).toBe(manual);
  });
  test("repeated apply is idempotent by structured identity, not substrings", () => {
    expect(replaceAtlasInstructionLayer(layer, JSON.parse(JSON.stringify(layer)))).toBe(layer);
    expect(composeAtlasInstructions("Manual", replaceAtlasInstructionLayer(layer, layer))).toBe(
      "Manual\n\n" + layer.text,
    );
  });
  test("manual edits during or after apply survive removal verbatim", () => {
    const manual = "Edited manually: " + layer.text + " with my changes";
    expect(composeAtlasInstructions(manual, null)).toBe(manual);
    expect(replaceAtlasInstructionLayer(layer, layer).text).toBe(layer.text);
  });
  test("changing Atlas selection replaces only the typed layer", () => {
    const next = createAtlasInstructionLayer({
      handoff: { ...origin, id: "ca290000-0000-4000-8000-000000000002" },
      instructions: "Other chosen option",
      creativeTechniques: "Other",
    });
    expect(composeAtlasInstructions("Manual", replaceAtlasInstructionLayer(layer, next))).toBe(
      "Manual\n\nOther chosen option",
    );
  });
  test("refresh/session JSON roundtrip keeps explicit provenance", () => {
    const restored = restoreAtlasInstructionLayer(JSON.parse(JSON.stringify(layer)));
    expect(restored).toEqual(layer);
    expect(composeAtlasInstructions("Current manual edits", restored)).toBe(
      "Current manual edits\n\n" + layer.text,
    );
  });
  test("no origin, missing legacy metadata and lookalike manual text imply no ownership", () => {
    expect(restoreAtlasInstructionLayer(undefined)).toBeNull();
    expect(restoreAtlasInstructionLayer(null)).toBeNull();
    expect(composeAtlasInstructions(layer.text, null)).toBe(layer.text);
    expect(() => restoreAtlasInstructionLayer({ ...layer, origin: null })).toThrow();
  });
  test("edited or malformed provenance is explicit ambiguity, never text removal", () => {
    expect(() =>
      restoreAtlasInstructionLayer({ ...layer, text: "Manually edited Atlas fragment" }),
    ).toThrow("ambiguous");
    expect(() => restoreAtlasInstructionLayer({ ...layer, extra: "unknown" })).toThrow();
  });
  test("portable export/import retains separate layers without changing v1 schema", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    expect(serializeAtlasAwareSetup(setup, null, now)).toBe(serializeAdvancedSetup(setup, now));
    expect(parseAtlasAwareSetup(serializeAdvancedSetup(setup, now))).toEqual({ kind: "ordinary" });
    const restored = parseAtlasAwareSetup(serializeAtlasAwareSetup(setup, layer, now));
    expect(restored.kind).toBe("atlas");
    if (restored.kind !== "atlas") throw new Error("Fixture");
    expect(restored.setup.additionalInstructions).toBe("Manual text");
    expect(restored.layer).toEqual(layer);
    expect(parseAdvancedSetup(serializeAtlasAwareSetup(setup, layer, now)).ok).toBe(false);
  });
  test("edited export cannot masquerade as removable Atlas provenance", () => {
    const raw = JSON.parse(serializeAtlasAwareSetup(setup, layer));
    raw.atlas.text = "My edited fragment";
    expect(parseAtlasAwareSetup(JSON.stringify(raw))).toEqual({ kind: "invalid" });
    expect(setup.additionalInstructions).toBe("Manual text");
  });
  test("oversized combined input fails without truncation or state mutation", () => {
    const manual = "x".repeat(1990);
    expect(() => composeAtlasInstructions(manual, layer)).toThrow("exceed");
    expect(manual).toHaveLength(1990);
    expect(layer.text).toBe("Atlas fixture directive");
  });
  test("Generator and bridge never replace manual state when applying or removing Atlas", () => {
    const bridge = readFileSync("src/components/promptbeats/AtlasGeneratorBridge.tsx", "utf8");
    expect(bridge).not.toContain("onApply(");
    expect(bridge).not.toContain("mergeAtlasInstructions");
    expect(bridge).toContain("onLayerChange(null)");
    const page = readFileSync("src/routes/generate.tsx", "utf8");
    expect(page).toContain("onLayerChange={setAtlasInstructions}");
    expect(page).toContain("atlasInstructions, atlasRecoveryText");
  });
});
