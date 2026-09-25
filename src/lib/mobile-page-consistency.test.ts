import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(path, "utf8");

describe("mobile page header consistency and prompt assignment", () => {
  test("Lyrics Review and Song Universes have header icons", async () => {
    const lyrics = await source("src/routes/lyrics-review.tsx");
    const universe = await source("src/routes/song-universe.tsx");
    expect(lyrics).toContain("<ListMusic");
    expect(universe).toContain("<Orbit");
  });

  test("Generator and Trending do not repeat their page headers", async () => {
    const generator = await source("src/routes/generate.tsx");
    const trending = await source("src/routes/trending.tsx");
    expect(generator).not.toContain('t("generator.backToFeed")');
    expect(generator).not.toContain('t("generator.optimizedFor")');
    expect(generator).not.toContain('t("generator.title")');
    expect(trending).not.toContain('t("trending.subtitle")');
    expect((trending.match(/t\("trending.title"\)/g) ?? []).length).toBe(1);
  });

  test("Prompt assignment refreshes folder-backed library views and verifies persistence", async () => {
    const library = await source("src/routes/library.tsx");
    const ai = await source("src/lib/ai.functions.ts");
    expect(library).toContain('["library", "folder-contents"]');
    expect(library).toContain('["library", "folder-scope-search"]');
    expect(library).toContain("disabled={movingToProject}");
    expect(ai).toContain("Prompt project assignment did not persist.");
    expect(ai).toContain('.select("id, project_id, version_number")');
  });
});
