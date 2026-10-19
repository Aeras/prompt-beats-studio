import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const generator = readFileSync("src/routes/generate.tsx", "utf8");

describe("Generator narrative lyrics isolation", () => {
  test("story-driven checkbox adds narrative direction to the normal generation job", () => {
    expect(generator).toContain("const narrativeInstruction = storyDriven && !revisionMode");
    expect(generator).toContain("NARRATIVE LYRICS DIRECTION:");
    expect(generator).toContain("instructions: combinedInstructions");
  });
  test("does not plan or show an embedded Story Map", () => {
    expect(generator).not.toContain("planStoryDrivenGeneration");
    expect(generator).not.toContain("storyDrivenDraft");
    expect(generator).not.toContain("storyMapFeature.allowed && !revisionMode");
    expect(generator).toContain("storyMapSongSetupHandoffSchema");
  });
  test("narrative lyrics remains available independently of Story Map feature", () => {
    expect(generator).toContain("{!revisionMode && (");
    expect(generator).toContain('checked={storyDriven}');
  });
});
