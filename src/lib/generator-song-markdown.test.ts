import { describe, expect, test } from "bun:test";
import { buildGeneratorBenchmarkMarkdown } from "./generator-benchmark-export";
import { parseSongMarkdown } from "./generator-song-markdown";

const song = {
  title: "Τίτλος",
  musicStyle: "Greek pop, 100 BPM",
  lyrics: "[Verse]\nΦυσικοί στίχοι εδώ\n[Chorus]\nΜείνε εδώ",
  producerNote: "Soft violin arrangement",
  modelId: "provider-model",
  modelLabel: "Selected Model",
  provider: "test",
  targetPlatform: "suno",
  generatorMode: "advanced" as const,
  promptVersion: "v2" as const,
  exportedAt: "2026-10-20T12:00:00Z",
};

describe("Generator MD import and export", () => {
  test("round-trips the exact benchmark format", () => {
    const md = buildGeneratorBenchmarkMarkdown(song);
    expect(parseSongMarkdown(md)).toEqual({
      title: song.title,
      tags: song.musicStyle,
      lyrics: song.lyrics,
      note: song.producerNote,
    });
  });

  test("rejects incomplete, unrelated or oversized Markdown", () => {
    const md = buildGeneratorBenchmarkMarkdown(song);
    expect(parseSongMarkdown("## Title\nFake")).toBeNull();
    expect(parseSongMarkdown(md.replace("## Lyrics", "## Not Lyrics"))).toBeNull();
    expect(parseSongMarkdown("x".repeat(300000))).toBeNull();
  });
});
