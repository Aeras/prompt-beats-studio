import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "src");
const essentia = readFileSync(resolve(root, "lib/song-analyzer-essentia.ts"), "utf8");
const enhancedJobs = readFileSync(resolve(root, "lib/song-analyzer-enhanced-job.functions.ts"), "utf8");
const cancelJob = readFileSync(resolve(root, "lib/song-analyzer-enhanced-cancel.functions.ts"), "utf8");
const background = readFileSync(resolve(root, "lib/song-analyzer-background.ts"), "utf8");
const route = readFileSync(resolve(root, "routes/song-analyzer.tsx"), "utf8");

describe("Song Analyzer resilience", () => {
  it("fails closed instead of silently using legacy Stage 0", () => {
    expect(essentia).toContain("Analysis was stopped instead of using degraded legacy DSP");
    expect(essentia).not.toContain("legacy browser DSP fallback used");
  });

  it("submits one RunPod job and resumes by polling its persisted identity", () => {
    expect(essentia).toContain("startEnhancedStage0Job");
    expect(essentia).toContain("pollEnhancedStage0Job");
    expect(essentia).toContain("ACTIVE_RUNPOD_JOB_KEY");
    expect(essentia).toContain("persistRunpodJob(active)");
    expect(essentia).toContain("fileFingerprint");
    expect(essentia).toContain("Do not automatically retry submission");
    expect(enhancedJobs).toContain("/run");
    expect(enhancedJobs).toContain("/status/");
    expect(enhancedJobs).toContain('status: "processing" as const');
  });

  it("separates normal GPU execution timeout from the longer mobile recovery window", () => {
    expect(essentia).toContain("RUNPOD_EXECUTION_TIMEOUT_MS = 11 * 60 * 1000");
    expect(essentia).toContain("RUNPOD_RECOVERY_WINDOW_MS = 30 * 60 * 1000");
    expect(essentia).toContain("exceeded the 11-minute GPU execution limit and was cancelled");
    expect(essentia).toContain("cancelAndForget(active)");
  });

  it("can cancel a runaway RunPod job and clean temporary R2 audio", () => {
    expect(cancelJob).toContain("/cancel/${encodeURIComponent(data.jobId)}");
    expect(cancelJob).toContain("assertOwnedAnalyzerKey");
    expect(cancelJob).toContain("deleteTemporaryAudio(data.audioKey)");
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
    expect(essentia).toContain("readPersistedRunpodJob");
  });

  it("keeps enhanced transport audio temporary and user-scoped", () => {
    expect(enhancedJobs).toContain("analyzer-temp/${context.userId}/");
    expect(enhancedJobs).toContain("assertOwnedAnalyzerKey");
    expect(enhancedJobs).toContain("deleteTemporaryAudio(data.audioKey)");
  });
});
