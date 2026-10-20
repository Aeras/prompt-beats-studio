import { describe, expect, test } from "bun:test";
import { buildV3ReviewPrompt, isSafeV3Review } from "./advanced-generator-v3-review";

const lyrics = [
  "[Verse]",
  "[Warm vocal]",
  "I used to hide the words from you",
  "Now I can speak the simple truth",
  "[Chorus]",
  "[Full band]",
  "Come back to me, come back tonight",
  "We found a way to make it right",
].join("\n");

describe("Independent V3 lyric review", () => {
  test("retains complete V2 metadata and prohibits unrelated changes", () => {
    const prompt = buildV3ReviewPrompt({
      title: "Song",
      tags: "Pop",
      lyrics,
      note: "Producer note",
      language: "English",
      genre: "Pop",
      mood: "Hopeful",
      production: "100 BPM, sung",
      structure: "Verse -> Chorus",
    });
    expect(prompt).toContain("title, tags, lyrics and note");
    expect(prompt).toContain("Copy title, tags and note EXACTLY");
    expect(prompt).toContain("Language: English");
    expect(prompt).toContain(lyrics);
  });

  test("accepts unchanged or minimal lyric changes", () => {
    expect(isSafeV3Review(lyrics, lyrics)).toBe(true);
    expect(isSafeV3Review(lyrics, lyrics.replace("simple truth", "honest truth"))).toBe(true);
  });

  test("rejects section structure modifications or excessive rewrites", () => {
    expect(isSafeV3Review(lyrics, lyrics.replace("[Chorus]", "[Verse]"))).toBe(false);
    expect(isSafeV3Review(lyrics, lyrics.replace("[Warm vocal]", "[Rap vocal]"))).toBe(false);
    expect(
      isSafeV3Review(
        lyrics,
        lyrics
          .replace("I used", "I always used")
          .replace("Now I", "Never I")
          .replace("Come back", "Stay away"),
      ),
    ).toBe(false);
    expect(isSafeV3Review(lyrics, "")).toBe(false);
  });
});
