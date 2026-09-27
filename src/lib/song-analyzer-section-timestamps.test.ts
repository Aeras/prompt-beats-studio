import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function analyzerSource() {
  return readFile(new URL("./song-analyzer.functions.ts", import.meta.url), "utf8");
}

describe("Song Analyzer section timestamp tolerance", () => {
  test("invalid or missing section timestamps degrade to null instead of failing Stage A", async () => {
    const source = await analyzerSource();

    expect(source).toContain("const tolerantSectionTimeSchema = z.preprocess(");
    expect(source).toContain("value === undefined || value === \"\"");
    expect(source).toContain(").catch(null);");
    expect(source).toContain("value.endSeconds < value.startSeconds");
    expect(source).toContain("return { ...value, startSeconds: null, endSeconds: null };");
    expect(source).not.toContain('message: "Invalid section time range"');
  });
});
