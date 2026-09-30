import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(path, "utf8");
}

describe("Song Universe Next Song Planner copy action", () => {
  test("exposes copy-all action with copied feedback", async () => {
    const code = await source("src/components/promptbeats/SongUniverseNextSongPlanner.tsx");

    expect(code).toContain("navigator.clipboard.writeText(blocks.join");
    expect(code).toContain("const [copiedBrief, setCopiedBrief] = useState(false)");
    expect(code).toContain('el ? "Αντιγραφή όλων" : "Copy all"');
    expect(code).toContain('el ? "Αντιγράφηκε" : "Copied"');
  });

  test("copy output includes the visible Next Song Brief sections", async () => {
    const code = await source("src/components/promptbeats/SongUniverseNextSongPlanner.tsx");

    for (const field of [
      "identityToPreserve",
      "mustRespect",
      "themesToExplore",
      "preferNotToRepeatThemes",
      "preferNotToRepeatMotifs",
      "mustAvoid",
      "portfolioBalanceNotes",
      "narrativeState",
      "eventsNotToRepeat",
      "storyProgression",
      "nextNarrativeOpportunity",
      "evidence",
      "reasoningSummary",
    ]) {
      expect(code).toContain(`brief.${field}`);
    }
  });

  test("copy output carries visible planner metadata and diagnostics", async () => {
    const code = await source("src/components/promptbeats/SongUniverseNextSongPlanner.tsx");

    expect(code).toContain("planMeta.trackCount");
    expect(code).toContain("planMeta.plannedTrackCount");
    expect(code).toContain("planMeta.overallCompleteness");
    expect(code).toContain("planMeta.modelLabel");
    expect(code).toContain("planMeta.fallbackReason");
    expect(code).toContain("planMeta.duplicateRisk");
  });
});
