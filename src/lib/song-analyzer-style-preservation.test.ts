import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Song Analyzer hybrid style preservation", () => {
  test("Stage B preserves independently supported hybrid style families", async () => {
    const code = await source("src/lib/song-analyzer.functions.ts");

    expect(code).toContain("HYBRID STYLE PRESERVATION");
    expect(code).toContain("Instrument prominence and genre identity are different signals");
    expect(code).toContain("GENRE FAMILY ACCOUNTING GATE");
    expect(code).toContain('Do not use "ballad" merely because');
    expect(code).toContain("use a hybrid/crossover description");
    expect(code).toContain("rhythmic or vocal style family");
  });
});
