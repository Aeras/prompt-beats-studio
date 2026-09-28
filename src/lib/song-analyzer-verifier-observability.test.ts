import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Song Analyzer verifier observability", () => {
  test("does not misclassify electronic drum kit wording as acoustic drum kit", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("const programmedDrum = /drum machine|programmed.*drum|electronic.*drum/");
    expect(code).toContain("const acousticDrum = !programmedDrum");
  });

  test("records drum and keyboard verifier decisions even when they are not positive identifications", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("Stage A drum-source verifier classified the rhythm section as");
    expect(code).toContain("Stage A keyboard-family verifier classified the material keyboard layer as");
    expect(code).toContain("Direct cues:");
  });

  test("records positive, low-confidence and empty micro-production outcomes", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("Stage A micro-production verifier decisions:");
    expect(code).toContain("low-confidence cues remain diagnostic only");
    expect(code).toContain("found no independently supported tape saturation");
  });
});
