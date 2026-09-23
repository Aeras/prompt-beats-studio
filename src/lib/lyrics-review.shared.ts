import { parseLyricsSections } from "@/lib/lyrics-sections";

export const LYRICS_REVIEW_LANGUAGE_CODES = ["el", "en", "es", "it", "pt", "ru"] as const;
export type LyricsReviewLanguageCode = (typeof LYRICS_REVIEW_LANGUAGE_CODES)[number];
export type LyricsReviewDetectionConfidence = "high" | "medium" | "low";

export type LyricsReviewLanguage = {
  code: LyricsReviewLanguageCode;
  canonical: string;
  label: { en: string; el: string };
  syllables: "good" | "approximate";
  rhyme: "ending_clues";
};

export const LYRICS_REVIEW_LANGUAGES: readonly LyricsReviewLanguage[] = [
  { code: "el", canonical: "Greek", label: { en: "Greek", el: "Ελληνικά" }, syllables: "good", rhyme: "ending_clues" },
  { code: "en", canonical: "English", label: { en: "English", el: "Αγγλικά" }, syllables: "approximate", rhyme: "ending_clues" },
  { code: "es", canonical: "Spanish", label: { en: "Spanish", el: "Ισπανικά" }, syllables: "good", rhyme: "ending_clues" },
  { code: "it", canonical: "Italian", label: { en: "Italian", el: "Ιταλικά" }, syllables: "good", rhyme: "ending_clues" },
  { code: "pt", canonical: "Portuguese", label: { en: "Portuguese", el: "Πορτογαλικά" }, syllables: "approximate", rhyme: "ending_clues" },
  { code: "ru", canonical: "Russian", label: { en: "Russian", el: "Ρωσικά" }, syllables: "good", rhyme: "ending_clues" },
] as const;

export type LyricsLanguageDetection = {
  code: LyricsReviewLanguageCode | null;
  confidence: LyricsReviewDetectionConfidence;
};

export type LyricsReviewLineMetric = {
  index: number;
  text: string;
  words: number;
  characters: number;
  approximateSyllables: number | null;
  rhymeEnding: string | null;
  flags: Array<"long_line" | "short_line">;
};

export type LyricsReviewSectionMetric = {
  key: string;
  label: string;
  lines: LyricsReviewLineMetric[];
  repeatedWords: Array<{ value: string; count: number }>;
  repeatedPhrases: Array<{ value: string; count: number }>;
  rhymeGroups: Array<{ ending: string; lineIndexes: number[] }>;
};

export type LyricsReviewAnalysis = {
  language: LyricsReviewLanguageCode;
  sections: LyricsReviewSectionMetric[];
  overview: {
    sectionCount: number;
    lineCount: number;
    wordCount: number;
    repeatedWords: Array<{ value: string; count: number }>;
    repeatedPhrases: Array<{ value: string; count: number }>;
    outlierLineCount: number;
  };
};

const STOP_WORDS: Record<Exclude<LyricsReviewLanguageCode, "el" | "ru">, Set<string>> = {
  en: new Set(["the", "and", "you", "i", "to", "of", "in", "my", "your", "me", "we", "is", "it", "that", "for", "on", "with", "this", "but", "not"]),
  es: new Set(["el", "la", "los", "las", "y", "que", "de", "en", "mi", "tu", "yo", "me", "te", "un", "una", "por", "con", "no", "es", "como"]),
  it: new Set(["il", "la", "lo", "gli", "le", "e", "che", "di", "in", "mi", "tu", "io", "un", "una", "per", "con", "non", "è", "come", "nel"]),
  pt: new Set(["o", "a", "os", "as", "e", "que", "de", "em", "meu", "minha", "eu", "me", "um", "uma", "por", "com", "não", "é", "como", "pra"]),
};

const COMMON_WORDS = new Set([
  ...STOP_WORDS.en,
  ...STOP_WORDS.es,
  ...STOP_WORDS.it,
  ...STOP_WORDS.pt,
  "και", "να", "σε", "το", "η", "ο", "μου", "σου", "δεν", "με", "για", "что", "и", "в", "не", "я", "ты", "на", "с", "мне", "тебя",
]);

const SQUARE_BRACKET_TAG_PATTERN = /\[[^\]\r\n]*\]/g;

/** Square-bracket content is PromptBeats/Suno/Udio metadata, never sung lyric content. */
export function stripLyricsReviewTags(text: string) {
  return text.replace(SQUARE_BRACKET_TAG_PATTERN, " ");
}

export function extractLyricsReviewTags(text: string) {
  return text.match(SQUARE_BRACKET_TAG_PATTERN) ?? [];
}

export function lyricsReviewTagsPreserved(original: string, candidate: string) {
  return JSON.stringify(extractLyricsReviewTags(original)) === JSON.stringify(extractLyricsReviewTags(candidate));
}

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeWord(value: string) {
  return stripDiacritics(value.toLocaleLowerCase())
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/^-+|-+$/g, "");
}

function lyricWords(text: string) {
  return stripLyricsReviewTags(text).match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? [];
}

function lyricalLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => stripLyricsReviewTags(line).trim())
    .filter(Boolean);
}

export function lyricsReviewLanguageFromCanonical(value: string | null | undefined): LyricsReviewLanguageCode | null {
  const normalized = (value ?? "").trim().toLocaleLowerCase();
  if (!normalized) return null;
  const match = LYRICS_REVIEW_LANGUAGES.find((item) => normalized === item.canonical.toLocaleLowerCase() || normalized.startsWith(`${item.canonical.toLocaleLowerCase()} (`));
  return match?.code ?? null;
}

export function detectLyricsLanguage(text: string): LyricsLanguageDetection {
  const sample = stripLyricsReviewTags(text).slice(0, 12000);
  const letters = sample.match(/\p{L}/gu) ?? [];
  if (!letters.length) return { code: null, confidence: "low" };

  const greek = (sample.match(/\p{Script=Greek}/gu) ?? []).length;
  const cyrillic = (sample.match(/\p{Script=Cyrillic}/gu) ?? []).length;
  const latin = (sample.match(/\p{Script=Latin}/gu) ?? []).length;
  const total = Math.max(1, greek + cyrillic + latin);

  if (greek / total >= 0.55) return { code: "el", confidence: "high" };
  if (cyrillic / total >= 0.55) return { code: "ru", confidence: "high" };
  if (latin / total < 0.45) return { code: null, confidence: "low" };

  const words = lyricWords(sample).map(normalizeWord).filter(Boolean);
  const scores: Record<"en" | "es" | "it" | "pt", number> = { en: 0, es: 0, it: 0, pt: 0 };
  for (const word of words) {
    for (const code of Object.keys(scores) as Array<keyof typeof scores>) {
      if (STOP_WORDS[code].has(word)) scores[code] += 1;
    }
  }

  const raw = sample.toLocaleLowerCase();
  if (/[¿¡ñ]/u.test(raw)) scores.es += 4;
  if (/\b(pero|porque|quiero|corazón|noche|siempre)\b/u.test(raw)) scores.es += 3;
  if (/\b(perché|sono|cuore|notte|sempre|senza)\b/u.test(raw)) scores.it += 3;
  if (/[ãõç]/u.test(raw)) scores.pt += 4;
  if (/\b(não|você|coração|noite|sempre|sem)\b/u.test(raw)) scores.pt += 3;
  if (/\b(the|this|that|with|without|heart|night|always)\b/u.test(raw)) scores.en += 3;

  const ranked = (Object.entries(scores) as Array<[keyof typeof scores, number]>).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || best[1] <= 0) return { code: "en", confidence: "low" };
  const margin = best[1] - (second?.[1] ?? 0);
  const confidence: LyricsReviewDetectionConfidence = best[1] >= 8 && margin >= 3 ? "high" : best[1] >= 4 && margin >= 1 ? "medium" : "low";
  return { code: best[0], confidence };
}

function countVowelGroups(word: string, vowelRegex: RegExp) {
  return (word.match(vowelRegex) ?? []).length;
}

function countEnglishSyllables(word: string) {
  const w = normalizeWord(word).replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  let count = countVowelGroups(w, /[aeiouy]+/g);
  if (w.endsWith("e") && !/(le|ye)$/.test(w) && count > 1) count -= 1;
  if (/(?:tion|sion)$/.test(w) && count > 1) count = Math.max(1, count);
  return Math.max(1, count);
}

function countGreekSyllables(word: string) {
  const w = stripDiacritics(word.toLocaleLowerCase()).replace(/[^α-ωϊϋΐΰ]/g, "");
  if (!w) return 0;
  const collapsed = w
    .replace(/αι|ει|οι|ου|υι/g, "α")
    .replace(/αυ|ευ|ηυ/g, "α")
    .replace(/([αεηιουωϊϋ])\1+/g, "$1");
  return Math.max(1, (collapsed.match(/[αεηιουωϊϋ]/g) ?? []).length);
}

function countSpanishItalianPortugueseSyllables(word: string) {
  const w = stripDiacritics(word.toLocaleLowerCase()).replace(/[^a-z]/g, "");
  if (!w) return 0;
  return Math.max(1, countVowelGroups(w, /[aeiouy]+/g));
}

function countRussianSyllables(word: string) {
  const w = word.toLocaleLowerCase().replace(/[^а-яё]/g, "");
  if (!w) return 0;
  return Math.max(1, (w.match(/[аеёиоуыэюя]/g) ?? []).length);
}

export function approximateSyllables(text: string, language: LyricsReviewLanguageCode): number | null {
  const words = lyricWords(text);
  if (!words.length) return null;
  const total = words.reduce((sum, word) => {
    if (language === "el") return sum + countGreekSyllables(word);
    if (language === "ru") return sum + countRussianSyllables(word);
    if (language === "en") return sum + countEnglishSyllables(word);
    return sum + countSpanishItalianPortugueseSyllables(word);
  }, 0);
  return total || null;
}

function rhymeEndingForLine(line: string, language: LyricsReviewLanguageCode) {
  const words = lyricWords(line);
  const last = words.at(-1);
  if (!last) return null;
  const normalized = normalizeWord(last);
  if (!normalized) return null;
  if (language === "ru") {
    const raw = last.toLocaleLowerCase().replace(/[^а-яё]/g, "");
    const match = raw.match(/[аеёиоуыэюя][^аеёиоуыэюя]*$/u);
    return match?.[0] ?? raw.slice(-3);
  }
  if (language === "el") {
    const raw = stripDiacritics(last.toLocaleLowerCase()).replace(/[^α-ωϊϋ]/g, "");
    const match = raw.match(/[αεηιουω][^αεηιουω]*$/u);
    return match?.[0] ?? raw.slice(-3);
  }
  const match = normalized.match(/[aeiouy][^aeiouy]*$/u);
  return match?.[0] ?? normalized.slice(-3);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function repetitionStats(lines: string[]) {
  const words = lines.flatMap((line) => lyricWords(line).map(normalizeWord).filter(Boolean));
  const counts = new Map<string, number>();
  for (const word of words) {
    if (word.length < 3 || COMMON_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const repeatedWords = [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([value, count]) => ({ value, count }));

  const phrases = new Map<string, number>();
  for (const line of lines) {
    const tokens = lyricWords(line).map(normalizeWord).filter(Boolean);
    for (let size = 2; size <= 3; size += 1) {
      for (let i = 0; i <= tokens.length - size; i += 1) {
        const phrase = tokens.slice(i, i + size).join(" ");
        if (phrase.length < 7) continue;
        phrases.set(phrase, (phrases.get(phrase) ?? 0) + 1);
      }
    }
  }
  const repeatedPhrases = [...phrases.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 10)
    .map(([value, count]) => ({ value, count }));

  return { repeatedWords, repeatedPhrases };
}

export function analyzeLyricsDeterministic(lyrics: string, language: LyricsReviewLanguageCode): LyricsReviewAnalysis {
  const parsed = parseLyricsSections(lyrics);
  const sectionMetrics = parsed.map((section) => {
    const lines = lyricalLines(section.content);
    const lineWords = lines.map((line) => lyricWords(line).length);
    const syllables = lines.map((line) => approximateSyllables(line, language) ?? 0);
    const wordMedian = median(lineWords.filter(Boolean));
    const syllableMedian = median(syllables.filter(Boolean));
    const metrics: LyricsReviewLineMetric[] = lines.map((line, index) => {
      const words = lineWords[index] ?? 0;
      const approximate = syllables[index] || null;
      const longByWords = wordMedian >= 2 && words >= wordMedian + Math.max(3, Math.ceil(wordMedian * 0.45));
      const shortByWords = wordMedian >= 5 && words <= Math.max(1, wordMedian - Math.max(3, Math.ceil(wordMedian * 0.45)));
      const longBySyllables = approximate != null && syllableMedian >= 4 && approximate >= syllableMedian + 5;
      const shortBySyllables = approximate != null && syllableMedian >= 8 && approximate <= syllableMedian - 5;
      const flags: LyricsReviewLineMetric["flags"] = [];
      if (longByWords || longBySyllables) flags.push("long_line");
      else if (shortByWords || shortBySyllables) flags.push("short_line");
      return {
        index: index + 1,
        text: line,
        words,
        characters: [...line].length,
        approximateSyllables: approximate,
        rhymeEnding: rhymeEndingForLine(line, language),
        flags,
      };
    });

    const rhymeMap = new Map<string, number[]>();
    for (const line of metrics) {
      if (!line.rhymeEnding || line.rhymeEnding.length < 2) continue;
      const entries = rhymeMap.get(line.rhymeEnding) ?? [];
      entries.push(line.index);
      rhymeMap.set(line.rhymeEnding, entries);
    }
    const rhymeGroups = [...rhymeMap.entries()]
      .filter(([, indexes]) => indexes.length >= 2)
      .map(([ending, lineIndexes]) => ({ ending, lineIndexes }));
    const repeats = repetitionStats(lines);
    return {
      key: section.key,
      label: section.displayLabel,
      lines: metrics,
      repeatedWords: repeats.repeatedWords,
      repeatedPhrases: repeats.repeatedPhrases,
      rhymeGroups,
    };
  });

  const allLines = sectionMetrics.flatMap((section) => section.lines.map((line) => line.text));
  const repeats = repetitionStats(allLines);
  return {
    language,
    sections: sectionMetrics,
    overview: {
      sectionCount: sectionMetrics.length,
      lineCount: sectionMetrics.reduce((sum, section) => sum + section.lines.length, 0),
      wordCount: sectionMetrics.reduce((sum, section) => sum + section.lines.reduce((lineSum, line) => lineSum + line.words, 0), 0),
      repeatedWords: repeats.repeatedWords,
      repeatedPhrases: repeats.repeatedPhrases,
      outlierLineCount: sectionMetrics.reduce((sum, section) => sum + section.lines.filter((line) => line.flags.length > 0).length, 0),
    },
  };
}
