import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("platform button press feedback", () => {
  test("all enabled buttons and role=button controls receive immediate tactile feedback", async () => {
    const styles = await source("src/styles.css");

    expect(styles).toContain('button:not(:disabled):not([data-pb-no-press="true"])');
    expect(styles).toContain('[role="button"]:not([aria-disabled="true"]):not([data-pb-no-press="true"])');
    expect(styles).toContain("transform: scale(0.96)");
    expect(styles).toContain("filter: brightness(1.08)");
    expect(styles).toContain("-webkit-tap-highlight-color: transparent");
  });

  test("invisible full-screen backdrop buttons opt out of press scaling", async () => {
    const trackSelector = await source("src/components/promptbeats/ProjectVersionLinkedTracks.tsx");
    const libraryMenu = await source("src/components/promptbeats/LibraryItemActionSheet.tsx");

    expect(trackSelector).toContain('data-pb-no-press="true"');
    expect(libraryMenu).toContain('data-pb-no-press="true"');
  });

  test("explicit action utility remains available for emphasized buttons", async () => {
    const styles = await source("src/styles.css");
    const trackSelector = await source("src/components/promptbeats/ProjectVersionLinkedTracks.tsx");

    expect(styles).toContain("@utility pb-action-press");
    expect(trackSelector).toContain("pb-action-press");
  });
});
