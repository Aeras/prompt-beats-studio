import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(path, "utf8");

describe("Track card action row", () => {
  test("uses one action row with content left and utilities right", async () => {
    const card = await source("src/components/promptbeats/TrackCard.tsx");
    expect(card).toContain('data-track-actions="left"');
    expect(card).toContain('data-track-actions="right"');
    expect(card).toContain('compact ? "gap-0" : "justify-between gap-2"');
    expect(card).toContain('compact ? "h-9 w-7" : "h-9 w-7"');
    expect(card).toContain("<PromptContentIcon compact={compact} />");
    expect(card).toContain("<LyricsContentIcon compact={compact} />");
    expect(card).toContain("<LikeButton");
    expect(card).toContain("<TrackLibraryActions");
    expect(card).toContain("<ShareTrackButton");
    expect(card).toContain("<ReportTrackControl");
    expect(card).toContain("<SimilarSongsMenuItem");
    expect(card).toContain("menuActions=");
    expect(card).toContain("inlineActions=");
    expect(card).toContain("menuItem");
    expect(card).toContain("bare");
  });

  test("card actions stay compact while secondary actions live in one menu", async () => {
    const libraryActions = await source("src/components/promptbeats/TrackLibraryActions.tsx");
    const like = await source("src/components/promptbeats/LikeButton.tsx");
    const share = await source("src/components/promptbeats/ShareTrackButton.tsx");
    const report = await source("src/components/promptbeats/ReportTrackControl.tsx");
    const owner = await source("src/components/promptbeats/TrackOwnerActions.tsx");

    for (const content of [libraryActions, share, report, owner]) {
      expect(content).toContain("focus-visible:ring");
    }

    expect(libraryActions).toContain("menuActions?: ReactNode");
    expect(libraryActions).toContain("inlineActions?: ReactNode");
        expect(libraryActions).toContain("h-9 w-7");
    expect(libraryActions).toContain('compact ? "flex shrink-0 items-center gap-0"');
    expect(libraryActions).toContain("<MoreVertical");
    expect(libraryActions).toContain("<Download");
    expect(like).toContain('"h-9 w-7"');
    expect(share).toContain("menuItem?: boolean");
    expect(report).toContain("menuItem?: boolean");
  });
});
