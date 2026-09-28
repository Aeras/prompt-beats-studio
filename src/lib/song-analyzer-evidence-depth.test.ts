import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Song Analyzer evidence-depth guards", () => {
  test("verifies vocal delivery independently from genre and language", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("VOCAL DELIVERY CHECK");
    expect(code).toContain('"sing_rap"');
    expect(code).toContain('"conversational_singing"');
    expect(code).toContain("Conversational singing is not automatically sing-rap");
    expect(code).toContain("this is delivery evidence, not a genre label");
  });

  test("actively rechecks keyboard and micro-production detail without forcing it", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("Actively inspect the intro, verses, choruses, bridge/breakdown and outro");
    expect(code).toContain("Do not call a generic warm pad Rhodes");
    expect(code).toContain("Actively inspect quiet openings/endings, breakdowns and transitions");
    expect(code).toContain("Return an empty array when they are not directly audible");
  });

  test("recovers null section starts only from label-matched cross-field clocks", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("recoverNullSectionStart");
    expect(code).toContain("normalizedSectionKeywords");
    expect(code).toContain("label-matched cross-field start boundary value(s)");
    expect(code).toContain("endSeconds: durationSeconds");
  });

  test("allows the Demucs other stem only as secondary corroboration for extra detail", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("must never be the sole basis for keyboard or production claims");
    expect(code).toContain("Full mix remains authoritative");
  });
});
