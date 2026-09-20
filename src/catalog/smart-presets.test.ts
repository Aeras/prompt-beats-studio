import { describe, expect, test } from "bun:test";

import {
  CULTURAL_STYLES,
  SMART_PRESETS,
  buildPresetBlueprint,
  resolveSmartPreset,
} from "@/catalog/smart-presets";

describe("Smart Presets catalog", () => {
  test("keeps the curated catalog within the requested release size", () => {
    expect(SMART_PRESETS.length).toBeGreaterThanOrEqual(30);
    expect(SMART_PRESETS.length).toBeLessThanOrEqual(45);
  });

  test("uses unique stable preset ids", () => {
    const ids = SMART_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("keeps preset structures bounded and valid", () => {
    for (const preset of SMART_PRESETS) {
      expect(preset.structure.length).toBeGreaterThan(0);
      expect(preset.structure.length).toBeLessThanOrEqual(40);
      expect(preset.name.en.trim().length).toBeGreaterThan(0);
      expect(preset.name.el.trim().length).toBeGreaterThan(0);
      expect(preset.productionStyle.trim().length).toBeGreaterThan(0);
    }
  });

  test("resolves Local Folk / Popular by cultural style without a lyrics-language field", () => {
    const local = SMART_PRESETS.find((preset) => preset.id === "local-folk-popular");
    expect(local).toBeDefined();

    const greek = resolveSmartPreset(local!, "greek");
    const japanese = resolveSmartPreset(local!, "japanese");

    expect(greek.productionStyle).not.toBe(japanese.productionStyle);
    expect(greek.instruments).not.toEqual(japanese.instruments);
    expect("language" in greek).toBe(false);
    expect("language" in japanese).toBe(false);
    expect(CULTURAL_STYLES.length).toBeGreaterThanOrEqual(10);
  });

  test("builds occurrence-aware Blueprint directions", () => {
    const preset = SMART_PRESETS.find((item) => item.id === "modern-pop");
    expect(preset).toBeDefined();

    const blueprint = buildPresetBlueprint(["Verse", "Chorus", "Verse", "Chorus", "Final Chorus"], preset!);
    expect(blueprint.map((item) => item.occurrence)).toEqual([1, 1, 2, 2, 1]);
    expect(blueprint[1]?.instruction).toContain("wider");
    expect(blueprint[3]?.instruction).toBe("");
    expect(blueprint[4]?.instruction).toContain("final chorus");
  });
});
