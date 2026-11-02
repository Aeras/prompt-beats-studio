import { describe, expect, it } from "vitest";
import { buildFootballSourceSnapshot } from "./football-ai-source-snapshot.shared";

const source = (url: string, excerpt = "some source text") => ({
  title: "Example", url, accessedAt: "2026-11-02T12:00:00Z", excerpt,
  researchIntent: "match_facts" as const,
});

describe("football research snapshots", () => {
  it("deduplicates URLs and strips fragments while preserving source timestamps", () => {
    const result = buildFootballSourceSnapshot([
      source("https://example.com/match#news"),
      source("https://example.com/match#other"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe("https://example.com/match");
    expect(result[0]?.accessedAt).toBe("2026-11-02T12:00:00.000Z");
  });
  it("bounds excerpts and source counts; discards invalid URLs", () => {
    const docs = [
      source("http://example.com/insecure"),
      source("https://bad.example.com/", "x".repeat(1000)),
      ...Array.from({ length: 30 }, (_, i) => source(`https://example.com/${i}`)),
    ];
    const results = buildFootballSourceSnapshot(docs);
    expect(results).toHaveLength(18);
    expect(results[0]?.excerpt).toHaveLength(650);
    expect(results.every((d) => d.url.startsWith("https://"))).toBe(true);
  });
});
