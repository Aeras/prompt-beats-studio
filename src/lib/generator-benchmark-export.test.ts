import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("Super Admin Generator benchmark export", () => {
  test("serializes the complete generator result with model metadata", async () => {
    const helper = await source("./generator-benchmark-export.ts");
    expect(helper).toContain("# PromptBeats Generator Test Result");
    expect(helper).toContain("## Generation Metadata");
    expect(helper).toContain("**AI Model:**");
    expect(helper).toContain("**Provider Model ID:**");
    expect(helper).toContain("## Title");
    expect(helper).toContain("## Music Style");
    expect(helper).toContain("## Lyrics");
    expect(helper).toContain("## Producer Note");
    expect(helper).toContain("PromptBeats_Test_");
  });

  test("keeps the export control Super Admin-only and uses the actual generation result model", async () => {
    const route = await source("../routes/generate.tsx");
    expect(route).toContain("useModeration");
    expect(route).toContain("moderation.isSuperAdmin &&");
    expect(route).toContain("Εξαγωγή Test (.md)");
    expect(route).toContain("generationResultModel ??");
    expect(route).toContain("songContext?.inputSnapshot?.generationModel");
    expect(route).toContain("buildGeneratorBenchmarkMarkdown");
    expect(route).toContain("generatorBenchmarkFilename");
  });
});
