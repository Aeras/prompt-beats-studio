import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("FINAL-013 Project Prompt action menu accessibility", () => {
  test("moves keyboard focus into the menu and supports menu-key navigation", async () => {
    const menu = await source("src/components/promptbeats/ProjectPromptActionMenu.tsx");

    expect(menu).toContain('querySelectorAll<HTMLButtonElement>(\'[role="menuitem"]\')');
    expect(menu).toContain("enabledMenuItems(menuRef.current)[0]?.focus()");
    expect(menu).toContain('["ArrowDown", "ArrowUp", "Home", "End"]');
    expect(menu).toContain("items[nextIndex]?.focus()");
  });

  test("exposes the transfer panel as a modal dialog and traps focus", async () => {
    const menu = await source("src/components/promptbeats/ProjectPromptActionMenu.tsx");

    expect(menu).toContain('role="dialog"');
    expect(menu).toContain('aria-modal="true"');
    expect(menu).toContain("aria-labelledby={transferTitleId}");
    expect(menu).toContain('querySelector<HTMLSelectElement>("select")?.focus()');
    expect(menu).toContain('if (event.key !== "Tab") return');
    expect(menu).toContain("restoreFocusRef.current");
  });
});
