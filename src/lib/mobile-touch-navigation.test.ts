import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(path, "utf8");
}

describe("mobile and tablet touch navigation", () => {
  test("mobile drawer stays open until an intentional dismissal", async () => {
    const shell = await source("src/components/promptbeats/AppShell.tsx");
    expect(shell).not.toContain("DRAWER_IDLE_MS");
    expect(shell).not.toContain("scheduleDrawerAutoClose");
    expect(shell).not.toContain("drawerIdleTimerRef");
    expect(shell).toContain("onClick={() => setDrawer(false)}");
    expect(shell).toContain("onNavigate={() => setDrawer(false)}");
  });

  test("mobile drawer has keyboard focus handling and explicit dialog semantics", async () => {
    const shell = await source("src/components/promptbeats/AppShell.tsx");
    expect(shell).toContain("drawerCloseButtonRef");
    expect(shell).toContain('event.key === "Escape"');
    expect(shell).toContain('role="dialog"');
    expect(shell).toContain("aria-modal={drawer ? true : undefined}");
    expect(shell).toContain("inert={!drawer}");
  });

  test("tablet landscape uses the persistent collapsible sidebar", async () => {
    const shell = await source("src/components/promptbeats/AppShell.tsx");
    expect(shell).toContain("TABLET_LANDSCAPE_QUERY");
    expect(shell).toContain('tabletLandscape ? "block" : "hidden lg:block"');
    expect(shell).toContain('tabletLandscape && (desktopSidebarOpen ? "!pl-[270px]" : "!pl-5")');
  });

  test("touch swipes remain an accelerator for visible generator and library tabs", async () => {
    const shell = await source("src/components/promptbeats/AppShell.tsx");
    const generator = await source("src/routes/generate.tsx");
    const library = await source("src/routes/library.tsx");
    expect(shell).toContain("TOUCH_TAB_SWIPE_THRESHOLD = 72");
    expect(shell).toContain('active === "studio" ? "[data-generator-mode]" : "[data-library-tab]"');
    expect(shell).toContain("if (nextIndex < 0 || nextIndex >= buttons.length) return");
    expect(generator).toContain("data-generator-mode={mode.key}");
    expect(library).toContain("aria-pressed={tab === item}");
  });

  test("mobile navigation exposes a non-color active cue and keyboard focus", async () => {
    const shell = await source("src/components/promptbeats/AppShell.tsx");
    expect(shell).toContain('aria-current={isActive ? "page" : undefined}');
    expect(shell).toContain('isActive ? "text-primary font-semibold" : "text-muted-foreground"');
    expect(shell).toContain("focus-visible:ring-2");
  });

  test("coarse-pointer menu controls use a reliable touch target without enlarging glyphs", async () => {
    const shell = await source("src/components/promptbeats/AppShell.tsx");
    expect(shell).toContain("min-h-11 min-w-11");
    expect(shell).toContain('className="h-4 w-4"');
    expect(shell).toContain('className="h-5 w-5 md:hidden"');
  });

  test("library horizontal tab overflow keeps its explicit responsive visual cue", async () => {
    const library = await source("src/routes/library.tsx");
    expect(library).toContain("showTabFade");
    expect(library).toContain("bg-gradient-to-l from-background");
    expect(library).toContain("scrollIntoView");
  });

  test("compact destructive card controls require confirmation and a reliable touch area", async () => {
    const wall = await source("src/routes/inspiration-wall.tsx");
    expect(wall).toContain('aria-label={language === "el" ? "Διαγραφή κάρτας" : "Delete card"}');
    expect(wall).toContain('language === "el" ? "Διαγραφή αυτής της κάρτας;" : "Delete this card?"');
    expect(wall).toContain("min-h-11 min-w-11");
    expect(wall).toContain("focus-visible:ring-2");
  });
});
