import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(path, "utf8");
}

function savedInputBlock(code: string) {
  const start = code.indexOf("const savedInput = z.object({");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = code.indexOf("\n});", start);
  expect(end).toBeGreaterThan(start);
  return code.slice(start, end + 4);
}

describe("saved prompt rich persistence input", () => {
  test("accepts rich Generator metadata up to a finite technical persistence ceiling", async () => {
    const code = await source("src/lib/ai.functions.ts");
    const block = savedInputBlock(code);

    expect(block).toContain('theme: z.string().trim().max(32000).default("")');
    expect(block).toContain('genre: z.string().trim().max(32000).default("")');
    expect(block).toContain('mood: z.string().trim().max(32000).default("")');

    expect(block).not.toContain('theme: z.string().trim().max(500).default("")');
    expect(block).not.toContain('genre: z.string().trim().max(500).default("")');
    expect(block).not.toContain('mood: z.string().trim().max(120).default("")');
  });

  test("keeps the save boundary finite and separate from live authoring limits", async () => {
    const code = await source("src/lib/ai.functions.ts");
    const block = savedInputBlock(code);

    expect(block).toContain("Persistence accepts rich Generator/Song Universe context");
    expect(block.match(/max\(32000\)/g)?.length).toBe(3);
  });
});
