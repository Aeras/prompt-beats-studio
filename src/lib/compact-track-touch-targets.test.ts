import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("compact track card touch targets", () => {
  test("coarse-pointer minimums do not spread compact action icons", async () => {
    const styles = await readFile("src/styles.css", "utf8");

    expect(styles).toContain("article.glass.rounded-xl [data-track-actions] button[aria-label]");
    expect(styles).toContain("min-width: 28px;");
    expect(styles).toContain("min-height: 36px;");
    expect(styles).toContain('article.glass.rounded-xl [data-track-actions="right"] > div');
    expect(styles).toContain("width: max-content;");
    expect(styles).toContain("flex: 0 0 auto;");
  });
});
