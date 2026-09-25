import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(path, "utf8");

describe("Track card action row", () => {
  test("uses one action row with content left and utilities right", async () => {
    const card = await source("src/components/promptbeats/TrackCard.tsx");
    expect(card).toContain('data-track-actions="left"');
    expect(card).toContain('data-track-actions="right"');
    expect(card).toContain("<PromptContentIcon compact={compact} />");
    expect(card).toContain("<LyricsContentIcon compact={compact} />");
    expect(card).toContain("<LikeButton");
    expect(card).toContain("<TrackLibraryActions");
    expect(card).toContain("<ShareTrackButton");
    expect(card).toContain("<ReportTrackControl");
    expect(card).toContain("bare");
  });

  test("card action controls expose borderless variants", async () => {
    const files = await Promise.all([
      source("src/components/promptbeats/TrackLibraryActions.tsx"),
      source("src/components/promptbeats/ShareTrackButton.tsx"),
      source("src/components/promptbeats/ReportTrackControl.tsx"),
      source("src/components/promptbeats/TrackOwnerActions.tsx"),
    ]);
    for (const content of files) {
      expect(content).toContain("bare");
      expect(content).toContain("focus-visible:ring");
    }
    expect(files[0]).toContain("rounded-full border border-white/10");
    expect(files[0]).toContain("grid h-10 w-8 place-items-center");
    expect(files[1]).toContain("h-9 w-6");
    expect(files[2]).toContain("h-9 w-6");
  });
});
