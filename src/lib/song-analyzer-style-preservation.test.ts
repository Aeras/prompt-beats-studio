import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Song Analyzer style, language and structure preservation", () => {
  test("Stage B preserves independently supported hybrid style families", async () => {
    const code = await source("src/lib/song-analyzer.functions.ts");

    expect(code).toContain("HYBRID STYLE PRESERVATION");
    expect(code).toContain("Instrument prominence and genre identity are different signals");
    expect(code).toContain("RHYTHMIC / VOCAL FAMILY PRESERVATION");
    expect(code).toContain("GENRE FAMILY ACCOUNTING GATE");
    expect(code).toContain('Do not use "ballad" merely because');
    expect(code).toContain("use a hybrid/crossover description");
    expect(code).toContain("at least TWO independent evidence categories");
  });

  test("lyrics language cannot create a regional music-style label", async () => {
    const code = await source("src/lib/song-analyzer.functions.ts");

    expect(code).toContain("LANGUAGE / VOCAL DELIVERY ISOLATION");
    expect(code).toContain("LANGUAGE / CULTURAL STYLE ISOLATION");
    expect(code).toContain("Greek-language vocals do not equal Greek Pop");
    expect(code).toContain("at least TWO independent non-language musical indicators");
    expect(code).toContain("Remove nationality/regional style wording");
  });

  test("Stage A and Stage B preserve full timeline coverage", async () => {
    const code = await source("src/lib/song-analyzer.functions.ts");

    expect(code).toContain("FULL-TIMELINE SECTION COVERAGE");
    expect(code).toContain("startSeconds");
    expect(code).toContain("endSeconds");
    expect(code).toContain("Transition / Uncertain section");
    expect(code).toContain("STRUCTURE / TIMELINE COVERAGE");
    expect(code).toContain("songStructure: structure ?? result.generatorReady.songStructure");
  });

  test("generator instructions cannot invent unsupported arrangement events", async () => {
    const code = await source("src/lib/song-analyzer.functions.ts");

    expect(code).toContain("ARRANGEMENT CLAIM GROUNDING");
    expect(code).toContain("descriptive reconstruction, not a place to redesign or improve the song");
    expect(code).toContain("Do not turn a low-confidence or ambiguous Stage A observation into a definite generator instruction");
  });
});
