import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { searchHighlightTerms } from "@/components/promptbeats/SearchTermHighlighter";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("search term highlighting", () => {
  test("prefers the full phrase while retaining useful word matches", () => {
    expect(searchHighlightTerms("  put   it  ")).toEqual(["put it", "put", "it"]);
  });

  test("deduplicates repeated terms and ignores one-character noise", () => {
    expect(searchHighlightTerms("test test x")).toEqual(["test test x", "test"]);
  });

  test("does not highlight empty or one-character searches", () => {
    expect(searchHighlightTerms(" ")).toEqual([]);
    expect(searchHighlightTerms("a")).toEqual([]);
  });

  test("FINAL-011 bounds broad DOM rescans and debounces active highlighting", async () => {
    const highlighter = await source("src/components/promptbeats/SearchTermHighlighter.tsx");

    expect(highlighter).toContain("const MAX_VISITED_TEXT_NODES = 2500");
    expect(highlighter).toContain("const HIGHLIGHT_DEBOUNCE_MS = 120");
    expect(highlighter).toContain("visitedTextNodes < MAX_VISITED_TEXT_NODES");
    expect(highlighter).toContain("if (activeQuery) schedule();");
    expect(highlighter).toContain("if (!activeQuery) {");
    expect(highlighter).toContain("cancelScheduledRender();");
  });

  test("FINAL-011 preserves editor/input exclusions and CSS Highlight rendering", async () => {
    const highlighter = await source("src/components/promptbeats/SearchTermHighlighter.tsx");

    expect(highlighter).toContain(
      "script, style, input, textarea, select, option, [contenteditable='true'], [data-pb-no-search-highlight]",
    );
    expect(highlighter).toContain("new HighlightCtor(...ranges)");
    expect(highlighter).toContain(`::highlight(\${HIGHLIGHT_NAME})`);
  });
});
