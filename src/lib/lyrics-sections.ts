export type LyricsSection = {
  key: string;
  label: string;
  displayLabel: string;
  occurrence: number;
  index: number;
  rawHeader: string | null;
  headerStart: number;
  contentStart: number;
  end: number;
  content: string;
  synthetic: boolean;
};

const STRUCTURAL_LABELS = new Set([
  "intro",
  "verse",
  "pre-chorus",
  "pre chorus",
  "chorus",
  "post-chorus",
  "post chorus",
  "bridge",
  "breakdown",
  "instrumental",
  "instrumental break",
  "guitar solo",
  "solo",
  "final chorus",
  "outro",
  "coda",
  "hook",
  "refrain",
  "interlude",
  "build",
  "drop",
  "rap verse",
  "spoken word",
  "spoken interlude",
]);

const INLINE_ROLE_PATTERNS = [
  /^(male|female|both|duet)$/i,
  /^(male|female)\s+(lead|vocal|vocals|backing vocal|backing vocals)$/i,
  /^(lead|backing)\s+vocal(s)?$/i,
  /^(choir|harmony|harmonies|ad[- ]?libs?)$/i,
];

const DIRECTION_WORDS = new Set([
  "enter",
  "enters",
  "entering",
  "drop",
  "drops",
  "build",
  "builds",
  "fade",
  "fades",
  "soft",
  "warm",
  "clean",
  "distorted",
  "overdriven",
  "driving",
  "wide",
  "full",
  "gentle",
  "emotional",
  "atmospheric",
  "whispered",
  "spoken",
  "sung",
  "strummed",
  "strumming",
  "arpeggio",
  "arpeggios",
  "piano",
  "guitar",
  "bass",
  "drums",
  "kick",
  "snare",
  "synth",
  "strings",
  "vocal",
  "vocals",
  "harmony",
  "harmonies",
  "delay",
  "reverb",
  "pulse",
  "dynamic",
  "dynamics",
  "instrumentation",
  "production",
  "soloing",
]);

function normalizeLabel(value: string) {
  return value.trim().replace(/\s+/g, " ").replace(/[–—]/g, "-");
}

function baseStructuralLabel(value: string) {
  return normalizeLabel(value)
    .toLowerCase()
    .replace(/\s+#?\d+$/, "")
    .replace(/\s+\d+$/, "");
}

function looksLikeInlineDirection(label: string) {
  if (INLINE_ROLE_PATTERNS.some((pattern) => pattern.test(label))) return true;
  const words = label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 6) return true;
  if (words.some((word) => DIRECTION_WORDS.has(word))) return true;
  if (
    /\b(with|and|then|into|under|over|only|returns?|continues?|rises?|slows?|fades?)\b/i.test(label)
  )
    return true;
  return false;
}

export function isStructuralSectionHeader(line: string): boolean {
  const match = line.match(/^[\t ]*\[([^\]\r\n]+)\][\t ]*$/);
  if (!match) return false;
  const label = normalizeLabel(match[1]!);
  if (!label || label.length > 80) return false;
  const base = baseStructuralLabel(label);
  if (STRUCTURAL_LABELS.has(base)) return true;
  if (
    /\b(verse|chorus|refrain|hook|bridge|outro|intro|coda|breakdown|interlude|instrumental|solo)\b/i.test(
      base,
    )
  )
    return true;
  if (looksLikeInlineDirection(label)) return false;
  // Preserve concise unknown/custom labels as structural sections.
  return label.split(/\s+/).length <= 5;
}

function slug(value: string) {
  const out = baseStructuralLabel(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return out || "section";
}

function friendlyLabel(label: string, occurrence: number, totalForLabel: number) {
  const explicitNumber = /(?:^|\s)#?\d+$/.test(label.trim());
  if (explicitNumber || totalForLabel <= 1) return label;
  return `${label} ${occurrence}`;
}

function editableContentEnd(lyrics: string, contentStart: number, boundaryEnd: number) {
  const body = lyrics.slice(contentStart, boundaryEnd);
  const trailing = body.match(/[\t \r\n]+$/);
  return trailing ? boundaryEnd - trailing[0].length : boundaryEnd;
}

export function parseLyricsSections(lyrics: string): LyricsSection[] {
  const headerRegex = /^[\t ]*\[([^\]\r\n]+)\][\t ]*$/gm;
  const headers: Array<{ start: number; end: number; raw: string; label: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = headerRegex.exec(lyrics))) {
    if (!isStructuralSectionHeader(match[0])) continue;
    let end = headerRegex.lastIndex;
    if (lyrics.slice(end, end + 2) === "\r\n") end += 2;
    else if (lyrics[end] === "\n" || lyrics[end] === "\r") end += 1;
    headers.push({
      start: match.index,
      end,
      raw: match[0].trim(),
      label: normalizeLabel(match[1]!),
    });
  }

  if (!headers.length) {
    return [
      {
        key: "full-lyrics:1",
        label: "Full Lyrics",
        displayLabel: "Full Lyrics",
        occurrence: 1,
        index: 0,
        rawHeader: null,
        headerStart: 0,
        contentStart: 0,
        end: lyrics.length,
        content: lyrics,
        synthetic: true,
      },
    ];
  }

  const counts = new Map<string, number>();
  for (const header of headers) {
    const id = slug(header.label);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const sections: LyricsSection[] = [];
  if (headers[0]!.start > 0) {
    const boundaryEnd = headers[0]!.start;
    const end = editableContentEnd(lyrics, 0, boundaryEnd);
    sections.push({
      key: "preamble:1",
      label: "Preamble",
      displayLabel: "Preamble",
      occurrence: 1,
      index: 0,
      rawHeader: null,
      headerStart: 0,
      contentStart: 0,
      end,
      content: lyrics.slice(0, end),
      synthetic: true,
    });
  }

  headers.forEach((header, headerIndex) => {
    const id = slug(header.label);
    const occurrence = (seen.get(id) ?? 0) + 1;
    seen.set(id, occurrence);
    const boundaryEnd = headers[headerIndex + 1]?.start ?? lyrics.length;
    const end = editableContentEnd(lyrics, header.end, boundaryEnd);
    sections.push({
      key: `${id}:${occurrence}`,
      label: header.label,
      displayLabel: friendlyLabel(header.label, occurrence, counts.get(id) ?? 1),
      occurrence,
      index: sections.length,
      rawHeader: header.raw,
      headerStart: header.start,
      contentStart: header.end,
      end,
      content: lyrics.slice(header.end, end),
      synthetic: false,
    });
  });

  return sections;
}

export function replaceLyricsSection(
  lyrics: string,
  sectionKey: string,
  replacement: string,
): { ok: true; lyrics: string } | { ok: false; error: string } {
  const sections = parseLyricsSections(lyrics);
  const section = sections.find((item) => item.key === sectionKey);
  if (!section) return { ok: false, error: "The selected lyric section no longer exists." };
  return {
    ok: true,
    lyrics: lyrics.slice(0, section.contentStart) + replacement + lyrics.slice(section.end),
  };
}

export function isRegularChorusSection(section: LyricsSection): boolean {
  return baseStructuralLabel(section.label) === "chorus";
}

function splitLeadingInlineDirections(content: string) {
  const lineRegex = /.*(?:\r\n|\n|\r|$)/g;
  let prefixEnd = 0;
  for (const match of content.matchAll(lineRegex)) {
    const raw = match[0];
    if (!raw) break;
    const line = raw.replace(/[\r\n]+$/, "");
    if (!line.trim()) {
      prefixEnd += raw.length;
      continue;
    }
    if (/^[\t ]*\[[^\]\r\n]+\][\t ]*$/.test(line) && !isStructuralSectionHeader(line)) {
      prefixEnd += raw.length;
      continue;
    }
    break;
  }
  return {
    prefix: content.slice(0, prefixEnd),
    lyricalBody: content.slice(prefixEnd),
  };
}

export function replaceAllRegularChorusLyrics(
  lyrics: string,
  sourceSectionKey: string,
  replacement: string,
): { ok: true; lyrics: string; changedKeys: string[] } | { ok: false; error: string } {
  const sections = parseLyricsSections(lyrics);
  const source = sections.find((item) => item.key === sourceSectionKey);
  if (!source) return { ok: false, error: "The selected lyric section no longer exists." };
  if (!isRegularChorusSection(source)) {
    return { ok: false, error: "Apply to all is only available for regular Chorus sections." };
  }

  const choruses = sections.filter(isRegularChorusSection);
  if (choruses.length < 2) {
    return { ok: false, error: "There is only one regular Chorus section." };
  }

  const replacementBody = splitLeadingInlineDirections(replacement).lyricalBody;
  let output = lyrics;
  const changedKeys: string[] = [];

  for (const section of [...choruses].sort((a, b) => b.contentStart - a.contentStart)) {
    const { prefix } = splitLeadingInlineDirections(section.content);
    output =
      output.slice(0, section.contentStart) + prefix + replacementBody + output.slice(section.end);
    changedKeys.push(section.key);
  }

  return { ok: true, lyrics: output, changedKeys: changedKeys.reverse() };
}

export function structuralHeadersInText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .filter((line) => isStructuralSectionHeader(line))
    .map((line) => line.trim());
}
