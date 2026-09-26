import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(path, "utf8");
}

describe("mobile and tablet touch navigation", () => {
  test("mobile drawer auto-closes after two seconds of touch inactivity", async () => {
    const shell = await source("src/components/promptbeats/AppShell.tsx");
    expect(shell).toContain("const DRAWER_IDLE_MS = 2_000");
    expect(shell).toContain("scheduleDrawerAutoClose");
    expect(shell).toContain("setTimeout(() => setDrawer(false), DRAWER_IDLE_MS)");
  });

  test("tablet landscape uses the persistent collapsible sidebar", async () => {
    const shell = await source("src/components/promptbeats/AppShell.tsx");
    expect(shell).toContain("TABLET_LANDSCAPE_QUERY");
    expect(shell).toContain('tabletLandscape ? "block" : "hidden lg:block"');
    expect(shell).toContain('tabletLandscape && (desktopSidebarOpen ? "!pl-[270px]" : "!pl-5")');
  });

  test("touch swipes move generator and library tabs without looping", async () => {
    const shell = await source("src/components/promptbeats/AppShell.tsx");
    const generator = await source("src/routes/generate.tsx");
    const library = await source("src/routes/library.tsx");
    expect(shell).toContain("TOUCH_TAB_SWIPE_THRESHOLD = 72");
    expect(shell).toContain('active === "studio" ? "[data-generator-mode]" : "[data-library-tab]"');
    expect(shell).toContain("if (nextIndex < 0 || nextIndex >= buttons.length) return");
    expect(generator).toContain("data-generator-mode={mode.key}");
    expect(library).toContain("aria-pressed={tab === item}");
  });
});
