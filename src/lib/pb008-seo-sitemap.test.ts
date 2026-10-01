import { describe, expect, test } from "bun:test";

import { buildSitemapXml, escapeXml } from "./seo-sitemap.shared";

describe("PB-008 sitemap XML safety", () => {
  test("escapes XML metacharacters", () => {
    expect(escapeXml(`https://example.test/a?x=1&y=<tag>\"'`)).toBe(
      "https://example.test/a?x=1&amp;y=&lt;tag&gt;&quot;&apos;",
    );
  });

  test("deduplicates stable URLs without inventing lastmod", () => {
    const xml = buildSitemapXml([
      "https://promptbeats.app/",
      "https://promptbeats.app/discover",
      "https://promptbeats.app/discover",
    ]);
    expect(xml.match(/<loc>/g)?.length).toBe(2);
    expect(xml).not.toContain("lastmod");
    expect(xml).toContain("https://promptbeats.app/discover");
  });
});
