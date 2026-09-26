from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Anchor not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# AppShell: touch-device tab swipes, tablet landscape persistent sidebar, and 2s drawer inactivity close.
path = "src/components/promptbeats/AppShell.tsx"
replace_once(
    path,
    'import { useEffect, useState, type ReactNode } from "react";',
    'import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";',
)
replace_once(
    path,
    'const DESKTOP_SIDEBAR_STORAGE_KEY = "pb:desktop-sidebar-open";\n',
    '''const DESKTOP_SIDEBAR_STORAGE_KEY = "pb:desktop-sidebar-open";
const DRAWER_IDLE_MS = 2_000;
const TOUCH_TAB_SWIPE_THRESHOLD = 72;
const TOUCH_TAB_SWIPE_DOMINANCE = 1.25;
const TABLET_LANDSCAPE_QUERY =
  "(hover: none) and (pointer: coarse) and (min-width: 768px) and (min-height: 600px) and (max-width: 1366px) and (orientation: landscape)";
const TOUCH_TAB_QUERY = "(hover: none) and (pointer: coarse) and (max-width: 1366px)";

function isSwipeInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="slider"], [data-swipe-ignore="true"]',
    ),
  );
}
''',
)
replace_once(
    path,
    '''  const [drawer, setDrawer] = useState(false);
  const [studio, setStudio] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);''',
    '''  const [drawer, setDrawer] = useState(false);
  const [studio, setStudio] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [tabletLandscape, setTabletLandscape] = useState(false);
  const drawerIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);''',
)
replace_once(
    path,
    '''  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY);
    if (saved === "false") setDesktopSidebarOpen(false);
    if (saved === "true") setDesktopSidebarOpen(true);
  }, []);

  if (lockLoading)''',
    '''  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY);
    if (saved === "false") setDesktopSidebarOpen(false);
    if (saved === "true") setDesktopSidebarOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(TABLET_LANDSCAPE_QUERY);
    const sync = () => {
      setTabletLandscape(media.matches);
      if (media.matches) setDrawer(false);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const clearDrawerIdleTimer = useCallback(() => {
    if (!drawerIdleTimerRef.current) return;
    clearTimeout(drawerIdleTimerRef.current);
    drawerIdleTimerRef.current = null;
  }, []);

  const scheduleDrawerAutoClose = useCallback(() => {
    clearDrawerIdleTimer();
    if (typeof window === "undefined" || tabletLandscape) return;
    const coarseTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (!coarseTouch) return;
    drawerIdleTimerRef.current = setTimeout(() => setDrawer(false), DRAWER_IDLE_MS);
  }, [clearDrawerIdleTimer, tabletLandscape]);

  useEffect(() => {
    if (!drawer) {
      clearDrawerIdleTimer();
      return;
    }
    scheduleDrawerAutoClose();
    return clearDrawerIdleTimer;
  }, [clearDrawerIdleTimer, drawer, scheduleDrawerAutoClose]);

  useEffect(() => {
    if (typeof window === "undefined" || (active !== "studio" && active !== "library")) return;
    const media = window.matchMedia(TOUCH_TAB_QUERY);
    let startX = 0;
    let startY = 0;
    let eligible = false;

    const onTouchStart = (event: TouchEvent) => {
      if (!media.matches || event.touches.length !== 1 || isSwipeInteractiveTarget(event.target)) {
        eligible = false;
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      if (touch.clientX <= 24 || touch.clientX >= window.innerWidth - 24) {
        eligible = false;
        return;
      }
      startX = touch.clientX;
      startY = touch.clientY;
      eligible = true;
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!eligible || !media.matches || event.changedTouches.length !== 1) return;
      eligible = false;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (
        Math.abs(deltaX) < TOUCH_TAB_SWIPE_THRESHOLD ||
        Math.abs(deltaX) < Math.abs(deltaY) * TOUCH_TAB_SWIPE_DOMINANCE
      )
        return;

      const selector = active === "studio" ? "[data-generator-mode]" : "[data-library-tab]";
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(selector)).filter(
        (button) => button.offsetParent !== null && !button.disabled,
      );
      const currentIndex = buttons.findIndex((button) => button.getAttribute("aria-pressed") === "true");
      if (currentIndex < 0) return;
      const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex < 0 || nextIndex >= buttons.length) return;
      buttons[nextIndex]?.click();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [active]);

  if (lockLoading)''',
)
replace_once(
    path,
    '''          "fixed inset-y-0 left-0 z-30 hidden border-r border-white/10 bg-black/40 backdrop-blur-xl transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block",
          desktopSidebarOpen ? "w-[270px]" : "w-5",''',
    '''          "fixed inset-y-0 left-0 z-30 border-r border-white/10 bg-black/40 backdrop-blur-xl transition-[width] duration-200 ease-out motion-reduce:transition-none",
          tabletLandscape ? "block" : "hidden lg:block",
          desktopSidebarOpen ? "w-[270px]" : "w-5",''',
)
replace_once(
    path,
    '<div className="fixed inset-y-0 left-0 z-30 hidden w-5 border-r border-white/10 bg-black/30 backdrop-blur-md md:block lg:hidden">',
    '''<div
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden w-5 border-r border-white/10 bg-black/30 backdrop-blur-md md:block lg:hidden",
          tabletLandscape && "!hidden",
        )}
      >''',
)
replace_once(
    path,
    '''        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          drawer ? "pointer-events-auto" : "pointer-events-none",
        )}''',
    '''        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          tabletLandscape && "hidden",
          drawer ? "pointer-events-auto" : "pointer-events-none",
        )}''',
)
replace_once(
    path,
    '''        <div
          className={cn(
            "glass-strong absolute inset-y-0 left-0 w-[80%] max-w-[300px] transition-transform duration-200 ease-out motion-reduce:transition-none",
            drawer ? "translate-x-0" : "-translate-x-full",
          )}
        >''',
    '''        <div
          onTouchStart={scheduleDrawerAutoClose}
          onTouchMove={scheduleDrawerAutoClose}
          onClick={scheduleDrawerAutoClose}
          onScroll={scheduleDrawerAutoClose}
          className={cn(
            "glass-strong absolute inset-y-0 left-0 w-[80%] max-w-[300px] overflow-y-auto transition-transform duration-200 ease-out motion-reduce:transition-none",
            drawer ? "translate-x-0" : "-translate-x-full",
          )}
        >''',
)
replace_once(
    path,
    '''          "relative z-10 pb-[var(--pb-mobile-nav-offset)] transition-[padding-left] duration-200 ease-out motion-reduce:transition-none sm:pb-0 md:pl-5",
          desktopSidebarOpen ? "lg:pl-[270px]" : "lg:pl-5",''',
    '''          "relative z-10 pb-[var(--pb-mobile-nav-offset)] transition-[padding-left] duration-200 ease-out motion-reduce:transition-none sm:pb-0 md:pl-5",
          tabletLandscape && (desktopSidebarOpen ? "!pl-[270px]" : "!pl-5"),
          desktopSidebarOpen ? "lg:pl-[270px]" : "lg:pl-5",''',
)

# Generator mode buttons become stable swipe targets.
path = "src/routes/generate.tsx"
replace_once(
    path,
    '''                    <button
                      key={mode.key}
                      type="button"
                      aria-pressed={active}''',
    '''                    <button
                      key={mode.key}
                      type="button"
                      data-generator-mode={mode.key}
                      aria-pressed={active}''',
)

# Library tabs expose their active state to the touch-swipe controller.
path = "src/routes/library.tsx"
replace_once(
    path,
    '''                type="button"
                data-library-tab={item}
                onClick={() => void navigate({ to: "/library", search: { tab: item } })}''',
    '''                type="button"
                data-library-tab={item}
                aria-pressed={tab === item}
                onClick={() => void navigate({ to: "/library", search: { tab: item } })}''',
)

# Add narrow source-contract regression coverage.
test_path = Path("src/lib/mobile-touch-navigation.test.ts")
test_path.write_text('''import { describe, expect, test } from "bun:test";\nimport { readFile } from "node:fs/promises";\n\nasync function source(path: string) {\n  return readFile(path, "utf8");\n}\n\ndescribe("mobile and tablet touch navigation", () => {\n  test("mobile drawer auto-closes after two seconds of touch inactivity", async () => {\n    const shell = await source("src/components/promptbeats/AppShell.tsx");\n    expect(shell).toContain("const DRAWER_IDLE_MS = 2_000");\n    expect(shell).toContain("scheduleDrawerAutoClose");\n    expect(shell).toContain("setTimeout(() => setDrawer(false), DRAWER_IDLE_MS)");\n  });\n\n  test("tablet landscape uses the persistent collapsible sidebar", async () => {\n    const shell = await source("src/components/promptbeats/AppShell.tsx");\n    expect(shell).toContain("TABLET_LANDSCAPE_QUERY");\n    expect(shell).toContain('tabletLandscape ? "block" : "hidden lg:block"');\n    expect(shell).toContain('tabletLandscape && (desktopSidebarOpen ? "!pl-[270px]" : "!pl-5")');\n  });\n\n  test("touch swipes move generator and library tabs without looping", async () => {\n    const shell = await source("src/components/promptbeats/AppShell.tsx");\n    const generator = await source("src/routes/generate.tsx");\n    const library = await source("src/routes/library.tsx");\n    expect(shell).toContain("TOUCH_TAB_SWIPE_THRESHOLD = 72");\n    expect(shell).toContain('active === "studio" ? "[data-generator-mode]" : "[data-library-tab]"');\n    expect(shell).toContain("if (nextIndex < 0 || nextIndex >= buttons.length) return");\n    expect(generator).toContain("data-generator-mode={mode.key}");\n    expect(library).toContain("aria-pressed={tab === item}");\n  });\n});\n''')

# Make the regression gate run the new contract test.
path = ".github/workflows/regression-gate.yml"
replace_once(
    path,
    '''      - name: app_role_rank hardening test
        run: bun test src/lib/app-role-rank-hardening.test.ts

      # Lint''',
    '''      - name: app_role_rank hardening test
        run: bun test src/lib/app-role-rank-hardening.test.ts

      - name: Mobile and tablet touch navigation tests
        run: bun test src/lib/mobile-touch-navigation.test.ts

      # Lint''',
)
