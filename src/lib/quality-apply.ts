/**
 * Deterministic Apply / Undo engine for Quality Check 2.0.
 *
 * Every operation here is pure text manipulation performed by the application
 * itself. The AI only supplies the structured recommendation — it is NEVER
 * called again to decide how to apply or undo something.
 */

export type ApplyResult = { ok: true; text: string } | { ok: false; error: string };

const HEADER = /^[ \t]*\[([^\]\n]+)\][ \t]*$/;

/** Splits lyrics into `[Section]` blocks, keeping the exact original text. */
function sections(lyrics: string) {
  const lines = lyrics.split("\n");
  const blocks: { label: string; start: number; end: number }[] = [];
  let current: { label: string; start: number } | null = null;
  lines.forEach((line, i) => {
    const m = line.match(HEADER);
    if (m) {
      if (current) blocks.push({ ...current, end: i });
      current = { label: (m[1] ?? "").trim(), start: i };
    }
  });
  if (current) blocks.push({ ...(current as { label: string; start: number }), end: lines.length });
  return { lines, blocks };
}

function normalize(s: string) {
  return s.trim().toLowerCase();
}

/** Returns the [start,end) character range of the named section body, or null. */
function sectionRange(lyrics: string, label: string): { from: number; to: number } | null {
  const { lines, blocks } = sections(lyrics);
  const wanted = normalize(label);
  const matches = blocks.filter(
    (b) => normalize(b.label) === wanted || normalize(b.label).startsWith(wanted),
  );
  if (matches.length !== 1) return null;
  const block = matches[0]!;
  const offset = (index: number) =>
    lines.slice(0, index).reduce((n, l) => n + l.length + 1, 0);
  return { from: offset(block.start), to: Math.min(lyrics.length, offset(block.end)) };
}

function replaceOccurrence(
  text: string,
  needle: string,
  replacement: string,
  occurrenceIndex: number,
  scope: { from: number; to: number } | null,
): ApplyResult {
  if (!needle) return { ok: false, error: "The correction has no target text." };
  const from = scope?.from ?? 0;
  const to = scope?.to ?? text.length;
  const hay = text.slice(from, to);

  const positions: number[] = [];
  let at = hay.indexOf(needle);
  while (at !== -1) {
    positions.push(at);
    at = hay.indexOf(needle, at + needle.length);
  }
  if (positions.length === 0) {
    return { ok: false, error: "The original text no longer matches — nothing was changed." };
  }
  const index = Math.max(1, occurrenceIndex) - 1;
  if (index >= positions.length) {
    return { ok: false, error: "The intended occurrence could not be identified — nothing was changed." };
  }
  const abs = from + positions[index]!;
  return { ok: true, text: text.slice(0, abs) + replacement + text.slice(abs + needle.length) };
}

export type LyricCorrection = {
  sectionLabel?: string | null;
  originalText: string;
  occurrenceIndex?: number | null;
  replacementText: string;
};

/** Replaces exactly one verified occurrence; never a global replace. */
export function applyLyricCorrection(lyrics: string, c: LyricCorrection): ApplyResult {
  const scope = c.sectionLabel ? sectionRange(lyrics, c.sectionLabel) : null;
  if (c.sectionLabel && !scope) {
    return { ok: false, error: `Section "${c.sectionLabel}" was not found in the current lyrics.` };
  }
  return replaceOccurrence(lyrics, c.originalText, c.replacementText, c.occurrenceIndex ?? 1, scope);
}

/** Undo of a lyric correction: the same targeted swap, reversed. */
export function undoLyricCorrection(lyrics: string, c: LyricCorrection): ApplyResult {
  return applyLyricCorrection(lyrics, {
    sectionLabel: c.sectionLabel ?? null,
    originalText: c.replacementText,
    replacementText: c.originalText,
    occurrenceIndex: c.occurrenceIndex ?? 1,
  });
}

/** Appends to the Music Style without ever replacing the existing prompt. */
export function addToMusicStyle(tags: string, addition: string): ApplyResult {
  const add = addition.trim().replace(/^,|,$/g, "").trim();
  if (!add) return { ok: false, error: "The suggestion has no Music Style text." };
  if (tags.toLowerCase().includes(add.toLowerCase())) {
    return { ok: false, error: "This is already part of the Music Style." };
  }
  const base = tags.trimEnd().replace(/[,\s]+$/, "");
  return { ok: true, text: base ? `${base}, ${add}` : add };
}

export function removeFromMusicStyle(tags: string, addition: string): ApplyResult {
  const add = addition.trim();
  const withComma = `, ${add}`;
  if (tags.includes(withComma)) return { ok: true, text: tags.replace(withComma, "") };
  if (tags.includes(add)) return { ok: true, text: tags.replace(add, "").replace(/^[,\s]+/, "").trimEnd() };
  return { ok: false, error: "The Music Style text has changed — nothing was undone." };
}

export type VocalInsertion = { sectionLabel: string; tag: string };

/**
 * Inserts approved vocal tags immediately after existing section headers.
 * Sung text, section names, section count and order are never touched.
 */
export function applyVocalArrangement(lyrics: string, plan: VocalInsertion[]): ApplyResult {
  if (!plan.length) return { ok: false, error: "The arrangement has no sections to update." };
  const { lines, blocks } = sections(lyrics);
  const out = [...lines];
  const inserts: { at: number; tag: string }[] = [];

  for (const step of plan) {
    const wanted = normalize(step.sectionLabel);
    const matches = blocks.filter(
      (b) => normalize(b.label) === wanted || normalize(b.label).startsWith(wanted),
    );
    if (matches.length !== 1) {
      return { ok: false, error: `Section "${step.sectionLabel}" could not be matched — nothing was changed.` };
    }
    const tag = step.tag.trim();
    if (!/^\[[^\]]+\]$/.test(tag)) {
      return { ok: false, error: `Invalid vocal tag "${step.tag}" — nothing was changed.` };
    }
    const headerIndex = matches[0]!.start;
    if (out[headerIndex + 1]?.trim() === tag) continue;
    inserts.push({ at: headerIndex + 1, tag });
  }
  if (!inserts.length) return { ok: false, error: "These vocal tags are already in place." };

  inserts.sort((a, b) => b.at - a.at).forEach((i) => out.splice(i.at, 0, i.tag));
  return { ok: true, text: out.join("\n") };
}

/** Undo: removes only the exact tag lines that were inserted. */
export function undoVocalArrangement(lyrics: string, plan: VocalInsertion[]): ApplyResult {
  const { lines, blocks } = sections(lyrics);
  const remove = new Set<number>();
  for (const step of plan) {
    const wanted = normalize(step.sectionLabel);
    const matches = blocks.filter(
      (b) => normalize(b.label) === wanted || normalize(b.label).startsWith(wanted),
    );
    if (matches.length !== 1) continue;
    const at = matches[0]!.start + 1;
    if (lines[at]?.trim() === step.tag.trim()) remove.add(at);
  }
  if (!remove.size) return { ok: false, error: "The inserted vocal tags were not found — nothing was undone." };
  return { ok: true, text: lines.filter((_, i) => !remove.has(i)).join("\n") };
}
