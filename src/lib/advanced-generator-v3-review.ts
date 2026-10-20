/**
 * V3 second-pass review. The untouched V2 result is always the fallback.
 * Review only sung phrasing; never rewrite metadata or rearrange sections.
 */
export function buildV3ReviewPrompt(input: {
  title: string;
  tags: string;
  lyrics: string;
  note: string;
  language: string;
  genre: string;
  mood: string;
  production: string;
  structure: string;
}): string {
  return `You are an independent expert songwriting editor and native-language fluency reviewer.
Review the following FINAL draft for natural singability. Work in its requested
language (NOT necessarily English or Greek). Think critically and conservatively.

Language: ${input.language}
Genre: ${input.genre}
Mood: ${input.mood}
Production and delivery: ${input.production}
Structure: ${input.structure}

FIRST examine native fluency, idioms, grammar, natural meaning, pronouns,
tense, imagery and forced rhyme. THEN consider breath, lyric density, stress
and articulation appropriate to the genre, intended groove and section.
Do not assume exact melody or section bar durations from BPM.
Never prefer a shorter line if it sounds less natural. Do not impose rhyme.
Respect intentional poetic language. Never change section headings, order,
number of sung lines, bracket directions, narrative intent, voice, or story.
If a line is already good, keep it verbatim.
Make only very small, unmistakably beneficial local changes.
If uncertain, return the original draft EXACTLY.
Return a complete song result in the required structured output schema with\ntitle, tags, lyrics and note. Copy title, tags and note EXACTLY from the original;\nonly lyrics may change.

ORIGINAL LYRICS:
${input.lyrics}`;
}

export function isSafeV3Review(original: string, candidate: string): boolean {
  if (!candidate.trim() || candidate === original) return Boolean(candidate.trim());
  const sections = (s: string) =>
    s.split("\n").map((l) => l.trim()).filter((l) => /^\[(?:intro|verse|pre-chorus|chorus|bridge|hook|breakdown|instrumental|final chorus|outro|post-chorus|refrain)/i.test(l));
  const a = sections(original);
  const b = sections(candidate);
  if (a.length !== b.length || a.some((s, i) => s !== b[i])) return false;
  const lines = (s: string) =>
    s.split("\n").map((l) => l.trim()).filter((l) => l && !/^\[/.test(l));
  const oldLines = lines(original);
  const newLines = lines(candidate);
  if (oldLines.length !== newLines.length) return false;
  const changed = oldLines.filter((l, i) => l !== newLines[i]).length;
  if (changed > Math.max(2, Math.ceil(oldLines.length * 0.15))) return false;
  if (newLines.some((l, i) => l.length > oldLines[i].length * 1.7 + 15)) return false;
  return true;
}
