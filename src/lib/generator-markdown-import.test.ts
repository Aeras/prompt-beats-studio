import { describe, expect, test } from "bun:test";
import { buildGeneratorBenchmarkMarkdown } from "./generator-benchmark-export";
import { MAX_SONG_MARKDOWN_BYTES, parseGeneratorMarkdown } from "./generator-markdown-import";

const input = {
  title: "Μια Καλησπέρα",
  musicStyle: "Greek pop, warm bass, 100 BPM",
  lyrics: "[Verse]\nΜια απλή καλησπέρα\n\n[Chorus]\nΕδώ ξανά",
  producerNote: "Acoustic guitar and intimate voice.",
  modelId: "model-test",
  modelLabel: "Test Model",
  provider: "example",
  targetPlatform: "suno",
  generatorMode: "advanced" as const,
  promptVersion: "v2" as const,
  exportedAt: "2026-10-20T12:00:00Z",
};

describe("Generator markdown round-trip", () => {
  test("imports all four song fields from the app's own MD export", () => {
    const markdown = buildGeneratorBenchmarkMarkdown(input);
    expect(parseGeneratorMarkdown(markdown)).toEqual({
      title: input.title,
      tags: input.musicStyle,
      lyrics: input.lyrics,
      note: input.producerNote,
    });
  });

  test("rejects missing content, unknown formats, and duplicate sections", () => {
    const markdown = buildGeneratorBenchmarkMarkdown(input);
    expect(parseGeneratorMarkdown(markdown.replace("## Lyrics", "## Missing"))).toBeNull();
    expect(parseGeneratorMarkdown(markdown + "\n## Lyrics\nInjected")).toBeNull();
    expect(parseGeneratorMarkdown("# Another export\n" + markdown)).toBeNull();
    expect(MAX_SONG_MARKDOWN_BYTES).toBeGreaterThan(0);
  });

  test("does not erase sung line breaks or bracketed section directions", () => {
    const markdown = buildGeneratorBenchmarkMarkdown(input);
    expect(parseGeneratorMarkdown(markdown)?.lyrics).toBe(input.lyrics);
  });
});
