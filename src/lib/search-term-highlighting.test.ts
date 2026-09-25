import { describe, expect, test } from "bun:test";
import { searchHighlightTerms } from "@/components/promptbeats/SearchTermHighlighter";

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
});
