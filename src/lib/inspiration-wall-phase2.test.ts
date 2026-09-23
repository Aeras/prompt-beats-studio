import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import {
  INSPIRATION_WALL_IMAGE_ACCEPT,
  MAX_INSPIRATION_WALL_IMAGE_BYTES,
} from "@/lib/inspiration-wall-image";

const source = (path: string) => readFile(path, "utf8");

describe("Inspiration Wall Phase 2 UI", () => {
  test("keeps the private image contract at JPEG/PNG/WebP and 4 MB", () => {
    expect(INSPIRATION_WALL_IMAGE_ACCEPT).toBe("image/jpeg,image/png,image/webp");
    expect(MAX_INSPIRATION_WALL_IMAGE_BYTES).toBe(4 * 1024 * 1024);
  });

  test("preserves small images and only compresses oversized images", async () => {
    const code = await source("src/lib/inspiration-wall-image.ts");
    expect(code).toContain("if (file.size <= MAX_INSPIRATION_WALL_IMAGE_BYTES) return file;");
    expect(code).toContain("Math.min(1, MAX_IMAGE_DIMENSION / originalMax)");
    expect(code).toContain('canvasBlob(canvas, "image/webp"');
  });

  test("ships all four visual themes and all eight MVP card types", async () => {
    const code = await source("src/routes/inspiration-wall.tsx");
    for (const theme of ["whiteboard", "corkboard", "neon_studio", "clean_studio"]) {
      expect(code).toContain(`id: "${theme}"`);
    }
    expect(code).toContain("INSPIRATION_WALL_CARD_TYPES.map");
  });

  test("artistic cards save layout on pointer release rather than every pointer move", async () => {
    const code = await source("src/routes/inspiration-wall.tsx");
    const move = code.slice(code.indexOf("const onPointerMove"), code.indexOf("const onPointerUp"));
    const up = code.slice(code.indexOf("const onPointerUp"), code.indexOf("const style ="));
    expect(move).not.toContain("updateInspirationWallCard");
    expect(up).toContain("updateInspirationWallCard");
  });

  test("text edits use a debounce instead of writing on every keystroke", async () => {
    const code = await source("src/routes/inspiration-wall.tsx");
    expect(code).toContain("setTimeout(() =>");
    expect(code).toContain("650");
    expect(code).toContain("queueSave({ body: event.target.value })");
  });

  test("navigation exposes Inspiration Wall without adding it to the permanent mobile tabs", async () => {
    const sidebar = await source("src/components/promptbeats/Sidebar.tsx");
    const shell = await source("src/components/promptbeats/AppShell.tsx");
    expect(sidebar).toContain('id: "inspirationWall"');
    expect(sidebar).toContain('useFeatureAccess("inspiration_wall")');
    expect(shell).toContain('inspirationWall: "/inspiration-wall"');
    const mobileTabs = shell.slice(
      shell.indexOf("const MOBILE_TABS"),
      shell.indexOf("const DESKTOP_SIDEBAR_STORAGE_KEY"),
    );
    expect(mobileTabs).not.toContain('id: "inspirationWall"');
  });

  test("artistic themes self-host canonical Pecita and Caveat fonts with OFL notices", async () => {
    const styles = await source("src/styles.css");
    expect(styles).toContain('font-family: "Pecita"');
    expect(styles).toContain('font-family: "Caveat"');
    expect(styles).toContain("/fonts/inspiration-wall/pecita/Pecita.otf");
    expect(styles).toContain("/fonts/inspiration-wall/caveat/Caveat[wght].ttf");
    const pecitaLicense = await source("public/fonts/inspiration-wall/pecita/OFL.txt");
    const caveatLicense = await source("public/fonts/inspiration-wall/caveat/OFL.txt");
    expect(pecitaLicense).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(caveatLicense).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });

  test("artistic cards expose bounded rotation, size controls and theme-specific fasteners", async () => {
    const code = await source("src/routes/inspiration-wall.tsx");
    expect(code).toContain("Math.max(-8, Math.min(8, current + delta))");
    expect(code).toContain('option value="small"');
    expect(code).toContain('option value="medium"');
    expect(code).toContain('option value="large"');
    expect(code).toContain('theme === "whiteboard"');
    expect(code).toContain("bg-sky-400");
    expect(code).toContain("bg-red-700");
  });

  test("wall metadata is editable with debounced persistence and artistic mobile canvas scrolls", async () => {
    const code = await source("src/routes/inspiration-wall.tsx");
    expect(code).toContain("queueWallSave");
    expect(code).toContain("Optional description");
    expect(code).toContain('artistic ? "overflow-auto sm:min-h-[760px]"');
    expect(code).toContain("min-w-[900px] sm:min-w-full");
  });
});
