import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const source = () => readFile("src/routes/generate.tsx", "utf8");

describe("Generator mobile result layout", () => {
  test("result section headers and copy controls remain visible on mobile", async () => {
    const generator = await source();
    expect(generator).toContain('<div className="flex items-center gap-3">');
    expect(generator).not.toContain('<div className="hidden items-center gap-3 md:flex">');
    expect(generator).toContain("<CopyButton value={value} />");
  });

  test("mode controls wrap independently from secondary actions", async () => {
    const generator = await source();
    expect(generator).toContain('className="flex flex-wrap items-center gap-2"');
    expect(generator).toContain("whitespace-nowrap rounded-full");
    expect(generator).toContain('className="ml-auto inline-flex items-center gap-1.5 rounded-lg');
  });
});
