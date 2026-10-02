import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("PB-003 follow-up release scope", () => {
  test("translator stays proposal-only and external-result expansion is absent", async () => {
    const translator = await source("src/lib/audio-revision-intent-ai.functions.ts");
    const sourceGuard = await source("src/lib/audio-revision-source.server.ts");

    expect(sourceGuard).toContain('track.source_type !== "upload"');
    expect(sourceGuard).toContain('track.moderation_status !== "active"');
    expect(translator).not.toContain("youtube");
    expect(translator).not.toContain("soundcloud");
    expect(translator).not.toContain("startGenerationJob");
  });
});
