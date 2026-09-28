import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Song Analyzer Stage A grounding guard", () => {
  test("adds an independent audio verification pass for unstable source-family claims", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("Stage A Critical Evidence Verifier");
    expect(code).toContain('drumSource: z.object');
    expect(code).toContain('bassSource: z.object');
    expect(code).toContain('guitarPresence: z.object');
    expect(code).toContain('synthPresence: z.object');
    expect(code).toContain('rhythmicLayerSource: z.object');
    expect(code).toContain("temperature: 0");
    expect(code).toContain("reconcileVerification");
  });

  test("uses a neutral ambiguous pluck/strum resolver instead of a guitar-biased detector", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("NEUTRAL RHYTHMIC-LAYER RESOLVER");
    expect(code).toContain('"guitar", "processed_guitar", "synth_pluck", "other_plucked_string", "mixed", "uncertain"');
    expect(code).toContain("at least two independent guitar-like cues");
    expect(code).toContain("Do not search for guitar preferentially");
    expect(code).toContain("rhythmicLayerResolutionRequired");
    expect(code).toContain("Rhythmic Plucked Layer");
  });

  test("treats verification as a confidence gate rather than a genre classifier", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("You are NOT a genre classifier");
    expect(code).toContain("Conflicting specific claims were confidence-downgraded");
    expect(code).toContain("felt tempo changed by a half/double-time factor");
  });

  test("preserves verifier-confirmed recurring rhythm guitar without forcing acoustic vs electric source", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("sustained chordal strumming/comping texture");
    expect(code).toContain("rhythmGuitarConfirmed");
    expect(code).toContain('instrument: "Rhythm Guitar"');
    expect(code).toContain("Chordal strumming / rhythmic comping");
    expect(code).toContain("acoustic vs clean electric source unresolved");
    expect(code).toContain("Stage A guitar guard:");
  });

  test("prevents half-double tempo ambiguity from acting as genre evidence by itself", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("Stage A tempo guard:");
    expect(code).toContain("BPM alone must never determine genre family");
    expect(code).toContain("drum-pattern, bass, vocal-phrasing, harmonic-rhythm, arrangement, and production evidence");
  });

  test("hardens section timestamps against mm:ss concatenation and duration overflow", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("explicitMmSs");
    expect(code).toContain("concatenated");
    expect(code).toContain("durationSeconds + 0.5");
    expect(code).toContain("Deterministic timeline guard corrected");
  });

  test("runs the guard before the final judge and displays guarded Stage A evidence", async () => {
    const route = await source("src/routes/song-analyzer.tsx");
    expect(route).toContain("guardSongAnalyzerStageA");
    expect(route).toContain("initialResult: guarded.initialResult");
    expect(route).toContain("stageAEvidence: guarded.stageAEvidence");
    expect(route).toContain("setStageAEvidence(guarded.stageAEvidence as StageAEvidence)");
  });

  test("keeps verification failure non-fatal", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("Stage A verifier unavailable; continuing with deterministic guard");
    expect(code).toContain("deterministic timeline validation still ran");
  });
});
