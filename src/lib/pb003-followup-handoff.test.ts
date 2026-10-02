import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("PB-003 follow-up handoff and recovery", () => {
  test("Audio Revision accepts private Intent ID only and keeps manual path", async () => {
    const route = await source("src/routes/audio-revision.tsx");

    expect(route).toContain('intent: z.string().uuid().optional()');
    expect(route).toContain("getAudioRevisionIntent");
    expect(route).toContain("revisionIntentId: intentId");
    expect(route).toContain("idempotencyKey: feedback.feedbackId");
    expect(route).toContain('operation: "revision"');
    expect(route).toContain("completeAudioRevisionFeedback");
    expect(route).not.toContain("generationKey.current");
  });

  test("accepted direction is bounded and never silently sliced", async () => {
    const route = await source("src/routes/audio-revision.tsx");

    expect(route).toContain("keep.length > 900");
    expect(route).toContain("change.length > 1200");
    expect(route).toContain("revisionBrief.length > 600");
    expect(route).not.toContain("setKeep(event.target.value.slice");
    expect(route).not.toContain("setChange(event.target.value.slice");
    expect(route).not.toContain("setRevisionBrief(event.target.value.slice");
  });

  test("Outcome/Intent UI keeps manual revision first-class and AI proposal explicit", async () => {
    const ui = await source("src/components/promptbeats/AudioOutcomeIntentControls.tsx");

    expect(ui).toContain('to="/audio-revision"');
    expect(ui).toContain("Manual Audio Revision");
    expect(ui).toContain("AI proposal — not applied");
    expect(ui).toContain("Use proposal for editing");
    expect(ui).toContain("saveAudioOutcomeEvaluation");
    expect(ui).toContain("updateAudioRevisionIntent");
  });
});
