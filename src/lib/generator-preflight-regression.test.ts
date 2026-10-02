import { describe, expect, test } from "bun:test";

import { generatorInputSnapshotSchema } from "@/lib/generator-revision.shared";

function richSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    generatorMode: "advanced",
    smartPresetId: "",
    culturalStyleId: "",
    theme: "T".repeat(1200),
    selectedMusicStyles: ["S".repeat(600)],
    customMusicStyle: "M".repeat(8000),
    selectedMoods: ["D".repeat(600)],
    customMood: "O".repeat(6000),
    language: "Greek",
    languageVariant: "gr",
    customLanguage: "",
    selectedInstruments: ["I".repeat(600)],
    customInstruments: "N".repeat(8000),
    bpmMode: "Custom",
    customBpm: "118",
    songStructure: ["Verse", "Chorus"],
    songBlueprint: [],
    productionStyle: "P".repeat(8000),
    additionalInstructions: "A".repeat(8000),
    targetPlatform: "suno",
    generationModel: "gemini-3.8-flash",
    ...overrides,
  };
}

describe("Generator durable preflight snapshot", () => {
  test("accepts rich persistence context above normal live authoring limits", () => {
    const parsed = generatorInputSnapshotSchema.safeParse(richSnapshot());
    expect(parsed.success).toBe(true);
  });

  test("keeps a finite technical ceiling for persistence fields", () => {
    const parsed = generatorInputSnapshotSchema.safeParse(
      richSnapshot({ theme: "T".repeat(32_001) }),
    );
    expect(parsed.success).toBe(false);
  });

  test("does not redefine live Generator authoring limits", async () => {
    const source = await Bun.file("src/lib/generator-input-limits.ts").text();
    expect(source).toContain(
      'if (input.theme.length > 500) throw new Error("Theme must be 500 characters or fewer.")',
    );
    expect(source).toContain(
      'if (input.theme.length > 300) throw new Error("Theme must be 300 characters or fewer.")',
    );
    expect(source).toContain("if (input.instruments.length > 200)");
  });
});
