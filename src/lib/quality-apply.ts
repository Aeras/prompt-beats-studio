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

/** Strips surrounding brackets and whitespace from a section label. */
function cleanLabel(label: string) {
  return normalize(label.replace(/^\s*\[/, "").replace(/\]\s*$/, ""));
}

/** Returns the [start,end) character range of the named section body, or null. */
function sectionRange(lyrics: string, label: string): { from: number; to: number } | null {
  const { lines, blocks } = sections(lyrics);
  const wanted = cleanLabel(label);
  if (!wanted) return null;
  const exact = blocks.filter((b) => cleanLabel(b.label) === wanted);
  const matches =
    exact.length === 1
      ? exact
      : blocks.filter((b) => {
          const l = cleanLabel(b.label);
          return l === wanted || l.startsWith(wanted);
        });
  if (matches.length !== 1) return null;
  const block = matches[0]!;
  const offset = (index: number) =>
    lines.slice(0, index).reduce((n, l) => n + l.length + 1, 0);
  return { from: offset(block.start), to: Math.min(lyrics.length, offset(block.end)) };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Builds a safe, narrowly-normalized matcher for the needle:
 * line breaks and whitespace runs are interchangeable, and insignificant
 * trailing punctuation/whitespace is optional. Nothing else is relaxed.
 */
function normalizedPattern(needle: string): RegExp | null {
  const core = needle.trim().replace(/[\s.,!?;:…]+$/u, "");
  if (!core) return null;
  const source = core
    .split(/\s+/)
    .map(escapeRe)
    .join("[ \\t]*\\r?\\n?[ \\t]*");
  return new RegExp(source + "[ \\t]*[.,!?;:…]*", "gu");
}

type Match = { start: number; end: number };

function findMatches(hay: string, needle: string): Match[] {
  const out: Match[] = [];
  let at = hay.indexOf(needle);
  while (at !== -1) {
    out.push({ start: at, end: at + needle.length });
    at = hay.indexOf(needle, at + needle.length);
  }
  if (out.length) return out;

  const re = normalizedPattern(needle);
  if (!re) return out;
  for (const m of hay.matchAll(re)) {
    if (typeof m.index === "number" && m[0].length) {
      out.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  return out;
}

function replaceOccurrence(
  text: string,
  needle: string,
  replacement: string,
  occurrenceIndex: number,
  scope: { from: number; to: number } | null,
): ApplyResult {
  if (!needle.trim()) return { ok: false, error: "The correction has no target text." };
  const from = scope?.from ?? 0;
  const to = scope?.to ?? text.length;
  const hay = text.slice(from, to);

  const matches = findMatches(hay, needle);
  if (matches.length === 0) {
    return { ok: false, error: "The original text no longer matches — nothing was changed." };
  }
  const index = scope ? Math.max(1, occurrenceIndex) - 1 : 0;
  if (!scope && matches.length !== 1) {
    return { ok: false, error: "The intended occurrence could not be identified — nothing was changed." };
  }
  if (index >= matches.length) {
    return { ok: false, error: "The intended occurrence could not be identified — nothing was changed." };
  }
  const hit = matches[index]!;
  return {
    ok: true,
    text: text.slice(0, from + hit.start) + replacement + text.slice(from + hit.end),
  };
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
  // Section unknown: document-wide fallback is allowed only when the target
  // text occurs exactly once in the whole lyrics (enforced in replaceOccurrence).
  return replaceOccurrence(lyrics, c.originalText, c.replacementText, c.occurrenceIndex ?? 1, scope);
}

/** Undo of a lyric correction: the same targeted swap, reversed. */
export function undoLyricCorrection(lyrics: string, c: LyricCorrection): ApplyResult {
  const base = {
    sectionLabel: c.sectionLabel ?? null,
    originalText: c.replacementText,
    replacementText: c.originalText,
  };
  const scope = c.sectionLabel ? sectionRange(lyrics, c.sectionLabel) : null;
  // The applied replacement usually exists only once, even when the original
  // text occurred several times, so fall back to it when it is unambiguous.
  const hay = scope ? lyrics.slice(scope.from, scope.to) : lyrics;
  if (findMatches(hay, c.replacementText).length === 1) {
    return applyLyricCorrection(lyrics, { ...base, occurrenceIndex: 1 });
  }
  return applyLyricCorrection(lyrics, { ...base, occurrenceIndex: c.occurrenceIndex ?? 1 });
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

export type VocalInsertion = {
  sectionLabel: string;
  /** 1-based occurrence among sections with the same label. */
  sectionOccurrenceIndex?: number | null;
  tag: string;
};

type Block = { label: string; start: number; end: number };

/**
 * Resolves one arrangement step to a single section header line.
 * Never falls back to "the first match" when the label is ambiguous.
 */
function resolveSection(
  blocks: Block[],
  step: VocalInsertion,
): { ok: true; headerIndex: number } | { ok: false; error: string } {
  const wanted = cleanLabel(step.sectionLabel);
  const exact = blocks.filter((b) => cleanLabel(b.label) === wanted);
  const matches = exact.length ? exact : blocks.filter((b) => cleanLabel(b.label).startsWith(wanted));

  if (matches.length === 0) {
    return { ok: false, error: `Section "${step.sectionLabel}" could not be matched — nothing was changed.` };
  }
  if (matches.length === 1) return { ok: true, headerIndex: matches[0]!.start };

  const index = step.sectionOccurrenceIndex;
  if (!index || !Number.isInteger(index) || index < 1) {
    return {
      ok: false,
      error: `There are ${matches.length} "${step.sectionLabel}" sections and the suggestion does not say which one — nothing was changed.`,
    };
  }
  const block = matches[index - 1];
  if (!block) {
    return {
      ok: false,
      error: `"${step.sectionLabel}" #${index} does not exist in the current lyrics — nothing was changed.`,
    };
  }
  return { ok: true, headerIndex: block.start };
}

/**
 * Inserts approved vocal tags immediately after existing section headers.
 * Sung text, section names, section count and order are never touched.
 * All insertions are applied atomically or none at all.
 */
export function applyVocalArrangement(lyrics: string, plan: VocalInsertion[]): ApplyResult {
  if (!plan.length) return { ok: false, error: "The arrangement has no sections to update." };
  const { lines, blocks } = sections(lyrics);
  const out = [...lines];
  const inserts: { at: number; tag: string }[] = [];

  for (const step of plan) {
    const found = resolveSection(blocks, step);
    if (!found.ok) return { ok: false, error: found.error };

    const tag = step.tag.trim();
    if (!/^\[[^\]]+\]$/.test(tag)) {
      return { ok: false, error: `Invalid vocal tag "${step.tag}" — nothing was changed.` };
    }
    // Already applied at this exact section: skip, never duplicate.
    if (out[found.headerIndex + 1]?.trim() === tag) continue;
    inserts.push({ at: found.headerIndex + 1, tag });
  }
  if (!inserts.length) return { ok: false, error: "These vocal tags are already in place." };

  inserts.sort((a, b) => b.at - a.at).forEach((i) => out.splice(i.at, 0, i.tag));
  return { ok: true, text: out.join("\n") };
}

/** Undo: removes only the exact tag lines inserted at the identified sections. */
export function undoVocalArrangement(lyrics: string, plan: VocalInsertion[]): ApplyResult {
  const { lines, blocks } = sections(lyrics);
  const remove = new Set<number>();
  for (const step of plan) {
    const found = resolveSection(blocks, step);
    if (!found.ok) continue;
    const at = found.headerIndex + 1;
    if (lines[at]?.trim() === step.tag.trim()) remove.add(at);
  }
  if (!remove.size) return { ok: false, error: "The inserted vocal tags were not found — nothing was undone." };
  return { ok: true, text: lines.filter((_, i) => !remove.has(i)).join("\n") };
}

