import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("mobile navigation safe layout", () => {
  test("defines one shared mobile nav height and safe offset", async () => {
    const styles = await source("src/styles.css");
    const shell = await source("src/components/promptbeats/AppShell.tsx");

    expect(styles).toContain("--pb-mobile-nav-content-height: 54px");
    expect(styles).toContain("--pb-mobile-nav-offset");
    expect(styles).toContain('[data-pb-bottom-safe="true"]');
    expect(shell).toContain("pb-[var(--pb-mobile-nav-offset)]");
    expect(shell).toContain("min-h-[var(--pb-mobile-nav-content-height)]");
    expect(shell).toContain('h-[18px] w-[18px]');
  });

  test("persistent player and bottom sheets respect the shared safe boundary", async () => {
    const player = await source("src/components/promptbeats/PlayerBar.tsx");
    const files = await Promise.all([
      "src/components/promptbeats/LibraryFolderPicker.tsx",
      "src/components/promptbeats/StudioModal.tsx",
      "src/components/promptbeats/ReportTrackControl.tsx",
      "src/components/promptbeats/TrackOwnerActions.tsx",
      "src/components/promptbeats/TrackLibraryActions.tsx",
      "src/components/promptbeats/ReportsManagementPanel.tsx",
      "src/routes/ai-music-lab.tsx",
    ].map(source));

    expect(player).toContain("bottom-[var(--pb-mobile-nav-offset)]");
    for (const file of files) {
      expect(file).toContain('data-pb-bottom-safe="true"');
    }
  });

  test("folder picker itself cannot extend behind mobile navigation", async () => {
    const picker = await source("src/components/promptbeats/LibraryFolderPicker.tsx");

    expect(picker).toContain("max-h-[calc(100dvh-var(--pb-mobile-nav-offset)-0.5rem)]");
    expect(picker).toContain("sm:max-h-[86vh]");
  });
});
