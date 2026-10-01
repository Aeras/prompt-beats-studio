import { describe, expect, test } from "bun:test";

import {
  canonicalLink,
  canonicalUrl,
  normalizeCanonicalOrigin,
  resolveSeoRuntimeConfig,
  robotsContent,
  safeJsonLd,
} from "./seo-policy";

describe("PB-008 SEO policy", () => {
  test("accepts only a trusted HTTPS origin and normalizes trailing slash", () => {
    expect(normalizeCanonicalOrigin("https://promptbeats.app/")).toBe("https://promptbeats.app");
    expect(normalizeCanonicalOrigin("https://promptbeats.app")).toBe("https://promptbeats.app");
    expect(normalizeCanonicalOrigin("http://promptbeats.app")).toBeNull();
    expect(normalizeCanonicalOrigin("https://promptbeats.app/path")).toBeNull();
    expect(normalizeCanonicalOrigin("https://user:pass@promptbeats.app")).toBeNull();
    expect(normalizeCanonicalOrigin("not-a-url")).toBeNull();
  });

  test("indexing is explicit opt-in and fails closed without a valid origin", () => {
    expect(resolveSeoRuntimeConfig({ canonicalOrigin: "https://promptbeats.app" })).toEqual({
      canonicalOrigin: "https://promptbeats.app",
      indexingEnabled: false,
    });
    expect(
      resolveSeoRuntimeConfig({
        canonicalOrigin: "https://promptbeats.app",
        indexingEnabled: "true",
      }),
    ).toEqual({ canonicalOrigin: "https://promptbeats.app", indexingEnabled: true });
    expect(
      resolveSeoRuntimeConfig({ canonicalOrigin: "not-a-url", indexingEnabled: "true" }),
    ).toEqual({ canonicalOrigin: null, indexingEnabled: false });
  });

  test("canonical URLs never depend on a request host and strip query/hash state", () => {
    const config = { canonicalOrigin: "https://promptbeats.app", indexingEnabled: true };
    expect(canonicalUrl("/discover?q=test#section", config)).toBe(
      "https://promptbeats.app/discover",
    );
    expect(canonicalLink("/track/abc", config)).toEqual({
      rel: "canonical",
      href: "https://promptbeats.app/track/abc",
    });
    expect(canonicalUrl("/discover", { ...config, indexingEnabled: false })).toBeNull();
  });

  test("robots policy is fail-closed outside an authorized indexing environment", () => {
    const off = { canonicalOrigin: null, indexingEnabled: false };
    const on = { canonicalOrigin: "https://promptbeats.app", indexingEnabled: true };
    expect(robotsContent("index", off)).toBe("noindex,nofollow");
    expect(robotsContent("index", on)).toBe("index,follow");
    expect(robotsContent("noindex-follow", on)).toBe("noindex,follow");
    expect(robotsContent("noindex", on)).toBe("noindex,nofollow");
    expect(robotsContent("token", on)).toBe("noindex,nofollow,noarchive");
  });

  test("JSON-LD serialization blocks script breakout and line-separator hazards", () => {
    const encoded = safeJsonLd({ value: '</script><script>\u2028\u2029"' });
    expect(encoded).not.toContain("<");
    expect(encoded).toContain("\\u003c/script>");
    expect(encoded).toContain("\\u2028");
    expect(encoded).toContain("\\u2029");
    expect(JSON.parse(encoded)).toEqual({ value: '</script><script>\u2028\u2029"' });
  });
});
