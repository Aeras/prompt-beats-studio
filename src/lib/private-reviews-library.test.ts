import { describe, expect, test } from "bun:test";

import { LIBRARY_TAB_IDS, isLibraryTab } from "@/lib/library-tabs";

describe("Private Reviews library and detail actions", () => {
  test("review tab is routed through the existing Library tab contract", async () => {
    const route = await Bun.file("src/routes/library.tsx").text();
    expect(LIBRARY_TAB_IDS).toContain("reviews");
    expect(isLibraryTab("reviews")).toBe(true);
    expect(route).toContain('tab === "reviews"');
    expect(route).toContain("<PrivateReviewsLibraryPanel");
  });

  test("history is grouped by source track, not by share token", async () => {
    const source = await Bun.file(
      "src/components/promptbeats/PrivateReviewsLibraryPanel.tsx",
    ).text();
    expect(source).toContain('session.sourceType !== "track"');
    expect(source).toContain("groups.get(id)");
    expect(source).toContain("historyOnly");
    expect(source).toContain("inline");
    expect(source).toContain("aria-expanded={selectedTrackId === track.id}");
    expect(source).not.toContain("{selectedTrackId && (");
    expect(source).toContain("canCreateNew={false}");
  });

  test("six track-detail icons have no overflow menu", async () => {
    const route = await Bun.file("src/routes/track.$id.tsx").text();
    const library = await Bun.file("src/components/promptbeats/TrackLibraryActions.tsx").text();
    expect(route).toContain("<LikeButton trackId={track.id} compact />");
    expect(route).toContain("detailMode");
    expect(route).toContain("<TrackOwnerActions");
    expect(library).toContain("if (detailMode)");
    expect(library).toContain("<Bookmark");
    expect(library).toContain("<ListPlus");
    expect(library).toContain("<Download");
  });
});
