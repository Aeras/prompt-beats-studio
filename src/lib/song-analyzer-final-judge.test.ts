import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Song Analyzer final judge architecture", () => {
  test("keeps title and artist out of the audio analysis call and routes them to final analysis", async () => {
    const route = await source("src/routes/song-analyzer.tsx");
    const background = await source("src/lib/song-analyzer-background.ts");

    expect(route).toContain("getSongAnalyzerFinalModelAccess");
    expect(route).toContain("startAnalyzerBackground");
    expect(route).toContain('trackTitle: trackTitle.trim() || undefined');
    expect(route).toContain('artist: artist.trim() || undefined');
    expect(background).toContain("finalizeSongAnalysis");
    expect(background).toContain('trackTitle: args.trackTitle?.trim() || undefined');
    expect(background).toContain('artist: args.artist?.trim() || undefined');

    const audioCall = background.slice(
      background.indexOf("const response = await analyzeSong"),
      background.indexOf("const guarded = await guardSongAnalyzerStageA"),
    );
    expect(audioCall).not.toContain("trackTitle:");
    expect(audioCall).not.toContain("artist:");
  });

  test("uses the AI Tools registry for the selectable final model", async () => {
    const code = await source("src/lib/song-analyzer-final.functions.ts");

    expect(code).toContain('getEffectiveModelAccess(userId, "ai_tools")');
    expect(code).toContain('resolveAiModelForUser(userId, "ai_tools", selectedId)');
    expect(code).toContain("modelCaller(selected.model, selected.provider)");
  });

  test("routes Russian research through Dzen with independent cross-checks", async () => {
    const code = await source("src/lib/song-analyzer-final.functions.ts");

    expect(code).toContain("site:dzen.ru");
    expect(code).toContain("independent non-Dzen cross-check");
    expect(code).toContain("Search in the ORIGINAL script/language");
    expect(code).toContain("audio evidence authoritative");
  });

  test("final style judge protects hybrid and hip-hop-derived identity", async () => {
    const code = await source("src/lib/song-analyzer-final.functions.ts");

    expect(code).toContain("Preserve hybrid/crossover identity");
    expect(code).toContain(
      "must not erase a materially supported hip-hop/R&B/electronic/rock/folk rhythmic or vocal foundation",
    );
    expect(code).toContain("must trigger an explicit evaluation of a hip-hop-derived family");
    expect(code).toContain("A prominent guitar must not cause a Pop-Rock/Rock classification");
  });

  test("requires cross-family corroboration before narrow rhythm-defined genre labels", async () => {
    const code = await source("src/lib/song-analyzer-final.functions.ts");
    expect(code).toContain("GENRE EVIDENCE QUORUM");
    expect(code).toContain("BPM or a fast subdivision grid is NEVER sufficient by itself");
    expect(code).toContain("at least THREE independent evidence families");
    expect(code).toContain("half/double-time ambiguity");
    expect(code).toContain(
      "reject the narrow label and fall back to a broader accurate family/crossover description",
    );
  });

  test("passes a deterministic conflict packet to the final judge", async () => {
    const code = await source("src/lib/song-analyzer-final.functions.ts");
    expect(code).toContain("buildInterpretationGuardPacket");
    expect(code).toContain("DETERMINISTIC INTERPRETATION GUARD PACKET");
    expect(code).toContain("tempoAmbiguous");
    expect(code).toContain("sourceResolverNotes");
    expect(code).toContain("stabilityConflicts");
  });

  test("preserves unresolved instrument source alternatives", async () => {
    const code = await source("src/lib/song-analyzer-final.functions.ts");
    expect(code).toContain("INSTRUMENT SOURCE DISCIPLINE");
    expect(code).toContain("rhythmic plucked layer or plucked string instrument");
    expect(code).toContain(
      "uncertain/mixed resolver outcomes are NOT permission to erase a plausible recurring layer",
    );
  });

  test("final judge cannot overwrite audio-measured instruments, BPM or structure", async () => {
    const code = await source("src/lib/song-analyzer-final.functions.ts");

    expect(code).toContain("instruments: initialResult.generatorReady.instruments");
    expect(code).toContain("bpm: initialResult.generatorReady.bpm");
    expect(code).toContain("songStructure: initialResult.generatorReady.songStructure");
  });

  test("existing Analyzer Stage A and Stage B prompts remain present", async () => {
    const code = await source("src/lib/song-analyzer.functions.ts");
    expect(code).toContain("PromptBeats Stage A: RAW AUDIO EVIDENCE EXTRACTOR");
    expect(code).toContain("HYBRID STYLE PRESERVATION");
    expect(code).toContain("RHYTHMIC / VOCAL FAMILY PRESERVATION");
  });
});
