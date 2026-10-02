import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("PB-003 follow-up linked-result panel", () => {
  test("Outcome lookup is one Version-level query and each Track consumes the batch", async () => {
    const panel = await source(
      "src/components/promptbeats/ProjectVersionAudioOutcomeIntentPanel.tsx",
    );
    expect(panel).toContain("listAudioOutcomeEvaluations");
    expect(panel).toContain('queryKey: ["project-version-audio-outcomes", projectId, versionId]');
    expect(panel).toContain("new Map(");
    expect(panel).toContain("evaluations.get(track.track_id) ?? null");
  });
});
