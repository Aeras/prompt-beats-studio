import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "src");
const essentia = readFileSync(resolve(root, "lib/song-analyzer-essentia.ts"), "utf8");
const enhancedJobs = readFileSync(resolve(root, "lib/song-analyzer-enhanced-job.functions.ts"), "utf8");
const background = readFileSync(resolve(root, "lib/song-analyzer-background.ts"), "utf8");
const route = readFileSync(resolve(root, "routes/song-analyzer.tsx"), "utf8");

describe("Song Analyzer resilience", () => {
  it("fails closed instead of silently using legacy Stage 0", () => {
    expect(essentia).toContain("Analysis was stopped instead of using degraded legacy DSP");
    expect(essentia).not.toContain("legacy browser DSP fallback used");
  });

  it("submits one RunPod job and resumes by polling its status", () => {
    expect(essentia).toContain("startEnhancedStage0Job");
    expect(essentia).toContain("pollEnhancedStage0Job");
    expect(essentia).toContain("MAX_CONSECUTIVE_POLL_TRANSPORT_ERRORS");
    expect(essentia).toContain("Do not automatically retry submission");
    expect(enhancedJobs).toContain("/run");
    expect(enhancedJobs).toContain("/status/");
    expect(enhancedJobs).toContain('status: "processing" as const');
  });

  it("keeps route changes from owning the Analyzer promise", () => {
    expect(background).toContain("let activePromise");
    expect(background).toContain("subscribeAnalyzerBackground");
    expect(background).toContain("sessionStorage");
    expect(route).toContain("startAnalyzerBackground");
    expect(route).toContain("subscribeAnalyzerBackground");
    expect(route).toContain("Analysis continues if you navigate elsewhere in PromptBeats");
  });

  it("keeps enhanced transport audio temporary and user-scoped", () => {
    expect(enhancedJobs).toContain("analyzer-temp/${context.userId}/");
    expect(enhancedJobs).toContain("assertOwnedAnalyzerKey");
    expect(enhancedJobs).toContain("deleteTemporaryAudio(data.audioKey)");
  });
});
