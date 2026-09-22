import type { GeneratorInputSnapshot } from "@/lib/generator-revision.shared";
import { parseLyricsSections } from "@/lib/lyrics-sections";
import type { SongBlueprintSection } from "@/lib/song-blueprint.shared";

export type VersionDiffStatus = "unchanged" | "changed" | "added" | "removed" | "moved";

export type ComparableProjectVersion = {
  id: string;
  versionNumber: number | null;
  title: string;
  theme: string;
  genre: string;
  mood: string;
  language: string;
  tags: string;
  lyrics: string;
  note: string;
  snapshot: GeneratorInputSnapshot | null;
};

export type ScalarFieldDiff = {
  key: string;
  label: string;
  status: Exclude<VersionDiffStatus, "moved">;
  before: string;
  after: string;
  added?: string[];
  removed?: string[];
};

export type StructureItemDiff = {
  key: string;
  label: string;
  status: VersionDiffStatus;
  beforeIndex: number | null;
  afterIndex: number | null;
};

export type ArrangementSectionDiff = {
  key: string;
  label: string;
  status: VersionDiffStatus;
  beforeIndex: number | null;
  afterIndex: number | null;
  beforeEnergy: number | null;
  afterEnergy: number | null;
  beforeInstruction: string;
  afterInstruction: string;
  energyChanged: boolean;
  instructionChanged: boolean;
};

export type WordDiffToken = {
  value: string;
  status: "unchanged" | "added" | "removed";
};

export type LyricsSectionDiff = {
  key: string;
  label: string;
  status: Exclude<VersionDiffStatus, "moved">;
  before: string;
  after: string;
  tokens: WordDiffToken[];
};

export type ProjectVersionDiff = {
  hasChanges: boolean;
  changeCount: number;
  fields: ScalarFieldDiff[];
  structure: StructureItemDiff[];
  arrangement: ArrangementSectionDiff[];
  lyrics: LyricsSectionDiff[];
};

const compact = (value: string) => value.trim().replace(/\s+/g, " ");

function valueStatus(before: string, after: string): Exclude<VersionDiffStatus, "moved"> {
  if (before === after) return "unchanged";
  if (!before && after) return "added";
  if (before && !after) return "removed";
  return "changed";
}

function arrayValues(selected: string[] | undefined, custom: string | undefined) {
  const values = [...(selected ?? []), ...(custom?.trim() ? [custom.trim()] : [])];
  return [...new Set(values.map(compact).filter(Boolean))];
}

function arrayField(
  key: string,
  label: string,
  beforeValues: string[],
  afterValues: string[],
): ScalarFieldDiff {
  const before = beforeValues.join(", ");
  const after = afterValues.join(", ");
  const beforeSet = new Set(beforeValues);
  const afterSet = new Set(afterValues);
  return {
    key,
    label,
    status: valueStatus(before, after),
    before,
    after,
    added: afterValues.filter((item) => !beforeSet.has(item)),
    removed: beforeValues.filter((item) => !afterSet.has(item)),
  };
}

function scalarField(key: string, label: string, before: unknown, after: unknown): ScalarFieldDiff {
  const beforeText = before == null ? "" : String(before);
  const afterText = after == null ? "" : String(after);
  return {
    key,
    label,
    status: valueStatus(beforeText, afterText),
    before: beforeText,
    after: afterText,
  };
}

function bpmLabel(snapshot: GeneratorInputSnapshot | null) {
  if (!snapshot) return "";
  if (snapshot.bpmMode === "Custom" && snapshot.customBpm.trim()) return `${snapshot.customBpm.trim()} BPM`;
  if (snapshot.bpmMode.trim()) return snapshot.bpmMode.trim();
  return snapshot.customBpm.trim() ? `${snapshot.customBpm.trim()} BPM` : "";
}

function languageLabel(version: ComparableProjectVersion) {
  const snapshot = version.snapshot;
  if (!snapshot) return version.language;
  const language = snapshot.customLanguage.trim() || snapshot.language.trim() || version.language;
  const variant = snapshot.languageVariant.trim();
  return variant ? `${language} · ${variant}` : language;
}

export function diffVersionFields(
  before: ComparableProjectVersion,
  after: ComparableProjectVersion,
): ScalarFieldDiff[] {
  const left = before.snapshot;
  const right = after.snapshot;

  return [
    scalarField("title", "Title", before.title, after.title),
    scalarField("theme", "Theme", left?.theme ?? before.theme, right?.theme ?? after.theme),
    arrayField(
      "musicStyle",
      "Music Style",
      arrayValues(left?.selectedMusicStyles, left?.customMusicStyle ?? before.genre),
      arrayValues(right?.selectedMusicStyles, right?.customMusicStyle ?? after.genre),
    ),
    arrayField(
      "mood",
      "Mood",
      arrayValues(left?.selectedMoods, left?.customMood ?? before.mood),
      arrayValues(right?.selectedMoods, right?.customMood ?? after.mood),
    ),
    arrayField(
      "instruments",
      "Instruments",
      arrayValues(left?.selectedInstruments, left?.customInstruments),
      arrayValues(right?.selectedInstruments, right?.customInstruments),
    ),
    scalarField("bpm", "BPM", bpmLabel(left), bpmLabel(right)),
    scalarField("language", "Language", languageLabel(before), languageLabel(after)),
    scalarField("productionStyle", "Production Style", left?.productionStyle ?? "", right?.productionStyle ?? ""),
    scalarField("additionalInstructions", "Additional Instructions", left?.additionalInstructions ?? "", right?.additionalInstructions ?? ""),
    scalarField("targetPlatform", "Target Platform", left?.targetPlatform ?? "", right?.targetPlatform ?? ""),
    scalarField("generationModel", "Generation Model", left?.generationModel ?? "", right?.generationModel ?? ""),
    scalarField("stylePrompt", "Generated Style Prompt", before.tags, after.tags),
    scalarField("producerNote", "Producer Note", before.note, after.note),
  ];
}

function occurrenceKeys(values: string[]) {
  const seen = new Map<string, number>();
  return values.map((label) => {
    const normalized = compact(label).toLowerCase();
    const occurrence = (seen.get(normalized) ?? 0) + 1;
    seen.set(normalized, occurrence);
    return {
      key: `${normalized}:${occurrence}`,
      label: occurrence > 1 ? `${label} ${occurrence}` : label,
    };
  });
}

export function diffSongStructure(
  before: GeneratorInputSnapshot | null,
  after: GeneratorInputSnapshot | null,
): StructureItemDiff[] {
  const left = occurrenceKeys(before?.songStructure ?? []);
  const right = occurrenceKeys(after?.songStructure ?? []);
  const leftMap = new Map(left.map((item, index) => [item.key, { ...item, index }]));
  const rightMap = new Map(right.map((item, index) => [item.key, { ...item, index }]));
  const orderedKeys = [...left.map((item) => item.key), ...right.map((item) => item.key).filter((key) => !leftMap.has(key))];

  return orderedKeys.map((key) => {
    const l = leftMap.get(key);
    const r = rightMap.get(key);
    let status: VersionDiffStatus = "unchanged";
    if (!l && r) status = "added";
    else if (l && !r) status = "removed";
    else if (l && r && l.index !== r.index) status = "moved";
    return {
      key,
      label: r?.label ?? l?.label ?? key,
      status,
      beforeIndex: l?.index ?? null,
      afterIndex: r?.index ?? null,
    };
  });
}

function blueprintIdentity(section: SongBlueprintSection) {
  const id = section.sectionId?.trim();
  return id ? `id:${id}` : `legacy:${compact(section.sectionType).toLowerCase()}:${section.occurrence}`;
}

function blueprintLabel(section: SongBlueprintSection) {
  return `${section.sectionType}${section.occurrence > 1 ? ` ${section.occurrence}` : ""}`;
}

export function diffArrangement(
  before: GeneratorInputSnapshot | null,
  after: GeneratorInputSnapshot | null,
): ArrangementSectionDiff[] {
  const left = before?.songBlueprint ?? [];
  const right = after?.songBlueprint ?? [];
  const leftMap = new Map(left.map((section) => [blueprintIdentity(section), section]));
  const rightMap = new Map(right.map((section) => [blueprintIdentity(section), section]));
  const keys = [...leftMap.keys(), ...[...rightMap.keys()].filter((key) => !leftMap.has(key))];

  return keys.map((key) => {
    const l = leftMap.get(key);
    const r = rightMap.get(key);
    const beforeIndex = l?.structureIndex ?? null;
    const afterIndex = r?.structureIndex ?? null;
    const beforeEnergy = l?.energy ?? null;
    const afterEnergy = r?.energy ?? null;
    const beforeInstruction = l?.instruction ?? "";
    const afterInstruction = r?.instruction ?? "";
    const energyChanged = beforeEnergy !== afterEnergy;
    const instructionChanged = beforeInstruction !== afterInstruction;

    let status: VersionDiffStatus = "unchanged";
    if (!l && r) status = "added";
    else if (l && !r) status = "removed";
    else if (l && r && (energyChanged || instructionChanged)) status = "changed";
    else if (l && r && beforeIndex !== afterIndex) status = "moved";

    return {
      key,
      label: blueprintLabel(r ?? l!),
      status,
      beforeIndex,
      afterIndex,
      beforeEnergy,
      afterEnergy,
      beforeInstruction,
      afterInstruction,
      energyChanged,
      instructionChanged,
    };
  });
}

function tokenize(text: string) {
  return text.match(/\s+|[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]+/gu) ?? [];
}

function tokenEquals(a: string, b: string) {
  if (/^\s+$/u.test(a) && /^\s+$/u.test(b)) return true;
  return a === b;
}

export function diffWords(before: string, after: string): WordDiffToken[] {
  if (before === after) return before ? [{ value: before, status: "unchanged" }] : [];
  const left = tokenize(before);
  const right = tokenize(after);
  if (!left.length) return right.map((value) => ({ value, status: "added" as const }));
  if (!right.length) return left.map((value) => ({ value, status: "removed" as const }));

  // Song sections are normally small. Bound worst-case memory on malformed or
  // unusually large synthetic sections rather than turning Compare into a
  // browser memory spike.
  if (left.length > 3500 || right.length > 3500) {
    return [
      { value: before, status: "removed" },
      { value: after, status: "added" },
    ];
  }

  const rows: Uint16Array[] = Array.from(
    { length: left.length + 1 },
    () => new Uint16Array(right.length + 1),
  );
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      rows[i]![j] = tokenEquals(left[i - 1]!, right[j - 1]!)
        ? rows[i - 1]![j - 1]! + 1
        : Math.max(rows[i - 1]![j]!, rows[i]![j - 1]!);
    }
  }

  const reversed: WordDiffToken[] = [];
  let i = left.length;
  let j = right.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && tokenEquals(left[i - 1]!, right[j - 1]!)) {
      reversed.push({ value: right[j - 1]!, status: "unchanged" });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || rows[i]![j - 1]! >= rows[i - 1]![j]!)) {
      reversed.push({ value: right[j - 1]!, status: "added" });
      j -= 1;
    } else {
      reversed.push({ value: left[i - 1]!, status: "removed" });
      i -= 1;
    }
  }

  return reversed.reverse();
}

export function diffLyrics(beforeLyrics: string, afterLyrics: string): LyricsSectionDiff[] {
  const left = parseLyricsSections(beforeLyrics);
  const right = parseLyricsSections(afterLyrics);
  const leftMap = new Map(left.map((section) => [section.key, section]));
  const rightMap = new Map(right.map((section) => [section.key, section]));
  const keys = [...left.map((section) => section.key), ...right.map((section) => section.key).filter((key) => !leftMap.has(key))];

  return keys.map((key) => {
    const l = leftMap.get(key);
    const r = rightMap.get(key);
    const before = l?.content ?? "";
    const after = r?.content ?? "";
    let status: LyricsSectionDiff["status"] = "unchanged";
    if (!l && r) status = "added";
    else if (l && !r) status = "removed";
    else if (before !== after) status = "changed";

    return {
      key,
      label: r?.displayLabel ?? l?.displayLabel ?? key,
      status,
      before,
      after,
      tokens: status === "unchanged"
        ? (before ? [{ value: before, status: "unchanged" as const }] : [])
        : diffWords(before, after),
    };
  });
}

export function compareProjectVersions(
  before: ComparableProjectVersion,
  after: ComparableProjectVersion,
): ProjectVersionDiff {
  const fields = diffVersionFields(before, after);
  const structure = diffSongStructure(before.snapshot, after.snapshot);
  const arrangement = diffArrangement(before.snapshot, after.snapshot);
  const lyrics = diffLyrics(before.lyrics, after.lyrics);

  const changeCount =
    fields.filter((item) => item.status !== "unchanged").length
    + structure.filter((item) => item.status !== "unchanged").length
    + arrangement.filter((item) => item.status !== "unchanged").length
    + lyrics.filter((item) => item.status !== "unchanged").length;

  return {
    hasChanges: changeCount > 0,
    changeCount,
    fields,
    structure,
    arrangement,
    lyrics,
  };
}
