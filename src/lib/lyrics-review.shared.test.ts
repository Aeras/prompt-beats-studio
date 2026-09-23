import { describe, expect, test } from "bun:test";

import {
  LYRICS_REVIEW_LANGUAGES,
  analyzeLyricsDeterministic,
  approximateSyllables,
  detectLyricsLanguage,
  extractLyricsReviewTags,
  lyricsReviewLanguageFromCanonical,
  lyricsReviewTagsPreserved,
  stripLyricsReviewTags,
} from "@/lib/lyrics-review.shared";

describe("Lyrics Review deterministic core", () => {
  test("Phase 1 exposes exactly EL EN ES IT PT RU", () => {
    expect(LYRICS_REVIEW_LANGUAGES.map((item) => item.code)).toEqual([
      "el",
      "en",
      "es",
      "it",
      "pt",
      "ru",
    ]);
  });

  test("canonical Generator and Project language values map to Lyrics Review profiles", () => {
    expect(lyricsReviewLanguageFromCanonical("Greek")).toBe("el");
    expect(lyricsReviewLanguageFromCanonical("English (UK)")).toBe("en");
    expect(lyricsReviewLanguageFromCanonical("Spanish")).toBe("es");
    expect(lyricsReviewLanguageFromCanonical("Italian")).toBe("it");
    expect(lyricsReviewLanguageFromCanonical("Portuguese (Brazil)")).toBe("pt");
    expect(lyricsReviewLanguageFromCanonical("Russian")).toBe("ru");
  });

  test("standalone detection recognizes Greek from script", () => {
    expect(
      detectLyricsLanguage("Στο τζάμι τρέχουν φώτα της γραμμής\nΚοιτάζω έξω και δεν ξέρω τι ζητώ"),
    ).toEqual({ code: "el", confidence: "high" });
  });

  test("standalone detection recognizes Russian from Cyrillic script", () => {
    expect(
      detectLyricsLanguage("Я снова иду по ночному городу\nИ сердце не знает куда мне идти"),
    ).toEqual({ code: "ru", confidence: "high" });
  });

  test("standalone detection distinguishes Spanish Latin lyrics", () => {
    expect(
      detectLyricsLanguage(
        "Yo quiero volver a la noche porque mi corazón no te olvida y siempre vive contigo",
      ).code,
    ).toBe("es");
  });

  test("standalone detection distinguishes Italian Latin lyrics", () => {
    expect(
      detectLyricsLanguage(
        "Io sono qui perché il cuore nella notte resta sempre con te e senza paura",
      ).code,
    ).toBe("it");
  });

  test("standalone detection distinguishes Portuguese Latin lyrics", () => {
    expect(
      detectLyricsLanguage(
        "Eu não sei por que você ficou no meu coração e na noite eu vivo sem você",
      ).code,
    ).toBe("pt");
  });

  test("standalone detection recognizes English when language clues support it", () => {
    expect(
      detectLyricsLanguage(
        "I walk through the night with your heart in my mind and this feeling will always stay",
      ).code,
    ).toBe("en");
  });

  test("low-evidence Latin text remains explicitly low confidence", () => {
    const result = detectLyricsLanguage("amor luna");
    expect(result.confidence).toBe("low");
  });

  test("language detection ignores every square-bracket tag, including inline tags", () => {
    const lyrics =
      "[Русский текст fake]\n[Verse] I walk through the [Громкий русский fake] night with your heart and this feeling will always stay";
    expect(detectLyricsLanguage(lyrics).code).toBe("en");
  });

  test("Greek syllables use a language-specific approximate heuristic", () => {
    expect(approximateSyllables("αγάπη", "el")).toBeGreaterThanOrEqual(3);
  });

  test("Russian syllables follow Russian vowel nuclei", () => {
    expect(approximateSyllables("дорога", "ru")).toBe(3);
  });

  test("English syllables remain approximate rather than a claimed phonetic score", () => {
    expect(approximateSyllables("forever", "en")).toBeGreaterThanOrEqual(2);
  });

  test("square-bracket content never contributes to syllable metrics", () => {
    expect(approximateSyllables("αγάπη [πολύ μεγάλη ψεύτικη φράση]", "el")).toBe(
      approximateSyllables("αγάπη", "el"),
    );
  });

  test("section parser keeps line metrics attached to the correct song section", () => {
    const analysis = analyzeLyricsDeterministic(
      "[Verse 1]\nOne two three\nFour five\n\n[Chorus]\nStay with me tonight\nStay with me tonight",
      "en",
    );
    expect(analysis.sections).toHaveLength(2);
    expect(analysis.sections[0]?.label).toContain("Verse");
    expect(analysis.sections[0]?.lines).toHaveLength(2);
    expect(analysis.sections[1]?.label).toContain("Chorus");
    expect(analysis.sections[1]?.lines).toHaveLength(2);
  });

  test("analysis reports measurable word and line counts without artistry score", () => {
    const analysis = analyzeLyricsDeterministic("[Verse]\nI walk alone\nI walk home", "en");
    expect(analysis.overview.lineCount).toBe(2);
    expect(analysis.overview.wordCount).toBe(6);
    expect(analysis).not.toHaveProperty("score");
  });

  test("tag-only lines are excluded and inline tags contribute zero words and characters", () => {
    const sourceLine = "I walk [whispered backing vocal] alone";
    const analysis = analyzeLyricsDeterministic(
      `[Verse]\n[Soft female vocal, intimate]\n${sourceLine}\nI walk home [drums enter]`,
      "en",
    );
    const first = analysis.sections[0]?.lines[0];
    expect(analysis.overview.lineCount).toBe(2);
    expect(analysis.overview.wordCount).toBe(6);
    expect(first?.words).toBe(3);
    expect(first?.text).not.toContain("[");
    expect(first?.characters ?? sourceLine.length).toBeLessThan(sourceLine.length);
  });

  test("repeated phrases are detected deterministically", () => {
    const analysis = analyzeLyricsDeterministic(
      "[Chorus]\nstay with me tonight\nstay with me tonight\nstay with me forever",
      "en",
    );
    expect(analysis.overview.repeatedPhrases.some((item) => item.value.includes("stay with"))).toBe(
      true,
    );
  });

  test("repetition analysis ignores repeated words inside tags", () => {
    const analysis = analyzeLyricsDeterministic(
      "[Verse]\nI see light [echo echo echo echo]\nYou see stars [echo echo echo echo]\nWe see dawn [echo echo echo echo]",
      "en",
    );
    expect(analysis.overview.repeatedWords.some((item) => item.value === "echo")).toBe(false);
  });

  test("rhyme output is an ending clue group, not a fake percentage", () => {
    const analysis = analyzeLyricsDeterministic(
      "[Verse]\nI wait in the night\nYou hold me tight",
      "en",
    );
    const groups = analysis.sections[0]?.rhymeGroups ?? [];
    expect(groups.length).toBeGreaterThan(0);
    expect(JSON.stringify(groups)).not.toContain("percent");
    expect(JSON.stringify(groups)).not.toContain("score");
  });

  test("rhyme ending ignores a trailing square-bracket production tag", () => {
    const analysis = analyzeLyricsDeterministic(
      "[Verse]\nI wait in the night [drums enter]\nYou hold me tight [guitar swell]",
      "en",
    );
    expect(analysis.sections[0]?.rhymeGroups.length).toBeGreaterThan(0);
  });

  test("large within-section length deviation is flagged as an observation", () => {
    const analysis = analyzeLyricsDeterministic(
      "[Verse]\nShort line\nAnother short line\nThis is an extremely long lyric line with many extra words that clearly changes the rhythmic density of this section",
      "en",
    );
    expect(analysis.overview.outlierLineCount).toBeGreaterThan(0);
  });

  test("square-bracket helper removes metadata without touching the stored lyric source", () => {
    const original = "Hello [whisper] world\n[guitar solo]";
    expect(stripLyricsReviewTags(original)).not.toContain("whisper");
    expect(stripLyricsReviewTags(original)).not.toContain("guitar solo");
    expect(original).toContain("[whisper]");
  });

  test("protected tag comparison requires exact tag text and order", () => {
    const original = "[Verse]\nHello [whisper] world\n[guitar solo]";
    expect(extractLyricsReviewTags(original)).toEqual(["[Verse]", "[whisper]", "[guitar solo]"]);
    expect(lyricsReviewTagsPreserved(original, "[Verse]\nNew line [whisper]\n[guitar solo]")).toBe(
      true,
    );
    expect(lyricsReviewTagsPreserved(original, "[Verse]\nNew line [Whisper]\n[guitar solo]")).toBe(
      false,
    );
    expect(lyricsReviewTagsPreserved(original, "[Verse]\nNew line\n[guitar solo]")).toBe(false);
  });

  test("instant analysis has no provider or network dependency", async () => {
    const source = await Bun.file("src/lib/lyrics-review.shared.ts").text();
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("getModelForUser");
  });
});
