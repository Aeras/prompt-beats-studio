import { describe, expect, test } from "bun:test";
import {
  parseLyricsSections,
  replaceAllRegularChorusLyrics,
  replaceLyricsSection,
} from "./lyrics-sections";

describe("lyrics section parser", () => {
  test("parses standard structural sections", () => {
    const sections = parseLyricsSections("[Verse 1]\nA\nB\n\n[Chorus]\nC\nD\n\n[Verse 2]\nE\nF");
    expect(sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus", "Verse 2"]);
  });

  test("assigns stable identities to repeated labels", () => {
    const sections = parseLyricsSections("[Verse]\nA\n[Chorus]\nB\n[Verse]\nC\n[Chorus]\nD");
    expect(sections.map((s) => s.key)).toEqual(["verse:1", "chorus:1", "verse:2", "chorus:2"]);
    expect(sections.map((s) => s.displayLabel)).toEqual(["Verse 1", "Chorus 1", "Verse 2", "Chorus 2"]);
  });

  test("keeps vocal tags inside the structural section", () => {
    const sections = parseLyricsSections("[Chorus]\n[Male]\nLine 1\n[Female]\nLine 2\n[Both]\nLine 3");
    expect(sections).toHaveLength(1);
    expect(sections[0]!.content).toContain("[Male]");
    expect(sections[0]!.content).toContain("[Female]");
    expect(sections[0]!.content).toContain("[Both]");
  });

  test("keeps concise production directions inside sections", () => {
    const sections = parseLyricsSections("[Verse]\n[Clean electric guitar arpeggio]\nLine\n[Chorus]\n[Full band enters]\nHook");
    expect(sections.map((s) => s.label)).toEqual(["Verse", "Chorus"]);
  });

  test("preserves concise custom structural labels", () => {
    const sections = parseLyricsSections("[Whispered Refrain]\nA\n[Final Lift]\nB");
    expect(sections.map((s) => s.label)).toEqual(["Whispered Refrain", "Final Lift"]);
  });

  test("falls back to Full Lyrics when no structural tags exist", () => {
    const lyrics = "One line\nAnother line";
    const sections = parseLyricsSections(lyrics);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.key).toBe("full-lyrics:1");
    expect(sections[0]!.content).toBe(lyrics);
  });

  test("replaces only the targeted repeated occurrence", () => {
    const lyrics = "[Verse]\nA\n\n[Chorus]\nHOOK\n\n[Verse]\nB\n\n[Chorus]\nHOOK";
    const replaced = replaceLyricsSection(lyrics, "verse:2", "NEW");
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.lyrics).toBe("[Verse]\nA\n\n[Chorus]\nHOOK\n\n[Verse]\nNEW\n\n[Chorus]\nHOOK");
  });

  test("preserves separator whitespace when replacement has no trailing newline", () => {
    const lyrics = "[Verse]\nA\n\n[Chorus]\nB";
    const replaced = replaceLyricsSection(lyrics, "verse:1", "NEW");
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.lyrics).toBe("[Verse]\nNEW\n\n[Chorus]\nB");
  });

  test("applies one Chorus lyric body to all regular Chorus occurrences only", () => {
    const lyrics = [
      "[Chorus]",
      "[Full band enters]",
      "OLD ONE",
      "",
      "[Verse]",
      "VERSE",
      "",
      "[Chorus]",
      "[Wide guitars]",
      "OLD TWO",
      "",
      "[Final Chorus]",
      "[Maximum lift]",
      "FINAL OLD",
    ].join("\n");

    const replaced = replaceAllRegularChorusLyrics(
      lyrics,
      "chorus:1",
      "[Full band enters]\nNEW HOOK",
    );
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.changedKeys).toEqual(["chorus:1", "chorus:2"]);
    expect(replaced.lyrics).toContain("[Chorus]\n[Full band enters]\nNEW HOOK");
    expect(replaced.lyrics).toContain("[Chorus]\n[Wide guitars]\nNEW HOOK");
    expect(replaced.lyrics).toContain("[Final Chorus]\n[Maximum lift]\nFINAL OLD");
  });

  test("rejects apply-all outside regular Chorus", () => {
    const lyrics = "[Verse]\nA\n\n[Verse]\nB";
    const replaced = replaceAllRegularChorusLyrics(lyrics, "verse:1", "NEW");
    expect(replaced.ok).toBe(false);
  });

  test("preserves CRLF and unrelated content", () => {
    const lyrics = "[Verse]\r\nA\r\n\r\n[Chorus]\r\nB";
    const replaced = replaceLyricsSection(lyrics, "chorus:1", "C");
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.lyrics.startsWith("[Verse]\r\nA\r\n\r\n[Chorus]\r\n")).toBe(true);
    expect(replaced.lyrics.endsWith("C")).toBe(true);
  });
});
