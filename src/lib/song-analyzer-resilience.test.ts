import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "src");
const essentia = readFileSync(resolve(root, "lib/song-analyzer-essentia.ts"), "utf8");
const background = readFileSync(resolve(root, "lib/song-analyzer-background.ts"), "utf8");
const route = readFileSync(resolve(root, "routes/song-analyzer.tsx"), "utf8");
const enhancedJobs = readFileSync(resolve(root, "lib/song-analyzer-enhanced-job.functions.ts"), "utf8");

describe("Song Analyzer resilience", () => {
  it("uses the local Essentia.js worker in the active Stage 0 path", () => {
    expect(essentia).toContain('new Worker(new URL("./song-analyzer-essentia.worker.ts"');
    expect(essentia).toContain("Essentia.js/WASM Stage 0 is supporting MIR evidence");
    expect(essentia).not.toContain("startEnhancedStage0Job");
    expect(essentia).not.toContain("pollEnhancedStage0Job");
  });

  it("keeps legacy local DSP only as the Essentia comparison/fallback layer", () => {
    expect(background).toContain("analyzeStage0Dsp(args.file)");
    expect(background).toContain("analyzeStage0Essentia(args.file, legacyStage0Evidence)");
    expect(essentia).toContain("Essentia.js/WASM Stage 0 unavailable; legacy DSP fallback used.");
  });

  it("resets the durable Analyzer request key after a failed run so retries do not replay stale provider errors", () => {
    expect(background).toContain('completeAuxiliaryRequest("song_analyzer");');
    expect(background).toContain('if (snapshot.status === "failed")');
  });

  it("keeps route changes from owning the Analyzer promise", () => {
    expect(background).toContain("let activePromise");
    expect(background).toContain("subscribeAnalyzerBackground");
    expect(route).toContain("startAnalyzerBackground");
    expect(route).toContain("subscribeAnalyzerBackground");
    expect(route).toContain("Analysis continues if you navigate elsewhere in PromptBeats");
  });

  it("does not restore a frozen running spinner after a hard browser refresh", () => {
    expect(background).toContain('["completed", "failed"]');
    expect(background).toContain("Do not resurrect a frozen spinner after a full browser refresh");
  });

  it("keeps enhanced RunPod/Qdrant support code dormant instead of deleting it", () => {
    expect(enhancedJobs).toContain("RUNPOD_MUSIC_ANALYSIS_ENDPOINT_ID");
    expect(enhancedJobs).toContain("queryMusicMemoryByVector");
    expect(background).not.toContain("consumeAnalyzerSourceStemPreview");
    expect(background).not.toContain("startEnhancedStage0Job");
  });
});
