import { z } from "zod";

import type { GeneratorInputSnapshot } from "@/lib/generator-revision.shared";
import { diffGeneratorSnapshots } from "@/lib/generator-revision.shared";
import { parseLyricsSections } from "@/lib/lyrics-sections";

export const versionChangeSourceSchema = z.enum([
  "initial_generation",
  "lyrics_workspace",
  "project_revision",
  "advanced_generator",
  "manual_edit",
]);

export const versionChangedSectionSchema = z.object({
  sectionKey: z.string().trim().min(1).max(120),
  sectionLabel: z.string().trim().min(1).max(120),
  changeType: z.enum(["added", "removed", "changed"]),
});

export const versionChangeMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  source: versionChangeSourceSchema,
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(600),
  changedFields: z.array(z.string().trim().min(1).max(80)).max(32),
  changedSections: z.array(versionChangedSectionSchema).max(40),
  userRequest: z.string().trim().max(3000).nullable(),
});

export type VersionChangeMetadata = z.infer<typeof versionChangeMetadataSchema>;
export type VersionChangeSource = z.infer<typeof versionChangeSourceSchema>;

function sentenceList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

export function diffLyricsSections(
  beforeLyrics: string,
  afterLyrics: string,
): VersionChangeMetadata["changedSections"] {
  const before = parseLyricsSections(beforeLyrics);
  const after = parseLyricsSections(afterLyrics);
  const beforeByKey = new Map(before.map((section) => [section.key, section]));
  const afterByKey = new Map(after.map((section) => [section.key, section]));
  const keys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])];

  return keys.flatMap((key) => {
    const previous = beforeByKey.get(key);
    const next = afterByKey.get(key);
    if (!previous && next) {
      return [{
        sectionKey: key,
        sectionLabel: next.displayLabel,
        changeType: "added" as const,
      }];
    }
    if (previous && !next) {
      return [{
        sectionKey: key,
        sectionLabel: previous.displayLabel,
        changeType: "removed" as const,
      }];
    }
    if (previous && next && previous.content !== next.content) {
      return [{
        sectionKey: key,
        sectionLabel: next.displayLabel,
        changeType: "changed" as const,
      }];
    }
    return [];
  });
}

export function buildInitialVersionMetadata(): VersionChangeMetadata {
  return {
    schemaVersion: 1,
    source: "initial_generation",
    title: "Initial version",
    summary: "The initial saved version of this project.",
    changedFields: [],
    changedSections: [],
    userRequest: null,
  };
}

export function buildGeneratorVersionMetadata(input?: {
  title?: string | null;
  baseSnapshot?: GeneratorInputSnapshot | null;
  desiredSnapshot?: GeneratorInputSnapshot | null;
  beforeLyrics?: string | null;
  afterLyrics?: string | null;
}): VersionChangeMetadata {
  const changedFields =
    input?.baseSnapshot && input.desiredSnapshot
      ? diffGeneratorSnapshots(input.baseSnapshot, input.desiredSnapshot)
      : [];
  const changedSections =
    input?.beforeLyrics != null && input?.afterLyrics != null
      ? diffLyricsSections(input.beforeLyrics, input.afterLyrics)
      : [];
  if (changedSections.length && !changedFields.includes("lyrics")) changedFields.push("lyrics");
  const labels = changedSections.map((section) => section.sectionLabel);
  const summaryParts: string[] = [];
  if (labels.length) summaryParts.push(`${sentenceList(labels.slice(0, 4))} changed`);
  if (changedFields.filter((field) => field !== "lyrics").length) {
    summaryParts.push(
      `${sentenceList(
        changedFields
          .filter((field) => field !== "lyrics")
          .slice(0, 4)
          .map((field) => field.replace(/([a-z])([A-Z])/g, "$1 $2")),
      )} updated`,
    );
  }
  return {
    schemaVersion: 1,
    source: "advanced_generator",
    title: (input?.title?.trim() || "Generator version").slice(0, 160),
    summary: (summaryParts.length
      ? `${summaryParts.join("; ")}.`
      : "A new version was saved from the AI Generator.").slice(0, 600),
    changedFields,
    changedSections,
    userRequest: null,
  };
}

export function buildManualVersionMetadata(input: {
  baseSnapshot?: GeneratorInputSnapshot | null;
  desiredSnapshot?: GeneratorInputSnapshot | null;
  beforeLyrics?: string | null;
  afterLyrics?: string | null;
}): VersionChangeMetadata {
  const generated = buildGeneratorVersionMetadata(input);
  return versionChangeMetadataSchema.parse({
    ...generated,
    source: "manual_edit",
    title: "Added to project",
    summary: generated.changedFields.length || generated.changedSections.length
      ? generated.summary
      : "A saved prompt was added to this project as a new version.",
    userRequest: null,
  });
}

export function buildLyricsWorkspaceVersionMetadata(input: {
  beforeLyrics: string;
  afterLyrics: string;
  versionLabel?: string | null;
}): VersionChangeMetadata {
  const changedSections = diffLyricsSections(input.beforeLyrics, input.afterLyrics);
  const labels = changedSections.map((section) => section.sectionLabel);
  const title = input.versionLabel?.trim()
    || (labels.length === 1 ? `${labels[0]} revised` : `${labels.length || 1} lyric sections revised`);
  const summary = labels.length
    ? `${sentenceList(labels.slice(0, 4))}${labels.length > 4 ? ` and ${labels.length - 4} more` : ""} changed in Lyrics Workspace.`
    : "Lyrics were edited in Lyrics Workspace.";

  return versionChangeMetadataSchema.parse({
    schemaVersion: 1,
    source: "lyrics_workspace",
    title: title.slice(0, 160),
    summary: summary.slice(0, 600),
    changedFields: ["lyrics"],
    changedSections,
    userRequest: null,
  });
}

export function buildProjectRevisionVersionMetadata(input: {
  revisionRequest: string;
  baseSnapshot: GeneratorInputSnapshot | null;
  desiredSnapshot: GeneratorInputSnapshot;
  beforeLyrics: string;
  afterLyrics: string;
}): VersionChangeMetadata {
  const changedFields = diffGeneratorSnapshots(input.baseSnapshot, input.desiredSnapshot);
  const changedSections = diffLyricsSections(input.beforeLyrics, input.afterLyrics);
  if (changedSections.length && !changedFields.includes("lyrics")) changedFields.push("lyrics");

  const labels = changedSections.map((section) => section.sectionLabel);
  const fieldLabels = changedFields
    .filter((field) => field !== "lyrics")
    .map((field) => field.replace(/([a-z])([A-Z])/g, "$1 $2"));

  let title = "Project revision";
  if (labels.length === 1 && fieldLabels.length === 0) title = `${labels[0]} revised`;
  else if (fieldLabels.length === 1 && labels.length === 0) title = `${fieldLabels[0]} updated`;

  const parts: string[] = [];
  if (labels.length) {
    parts.push(`${sentenceList(labels.slice(0, 4))}${labels.length > 4 ? ` and ${labels.length - 4} more` : ""} changed`);
  }
  if (fieldLabels.length) {
    parts.push(`${sentenceList(fieldLabels.slice(0, 4))}${fieldLabels.length > 4 ? ` and ${fieldLabels.length - 4} more` : ""} updated`);
  }

  return versionChangeMetadataSchema.parse({
    schemaVersion: 1,
    source: "project_revision",
    title: title.slice(0, 160),
    summary: (parts.length ? `${parts.join("; ")}.` : "A project revision created this version.").slice(0, 600),
    changedFields,
    changedSections,
    userRequest: input.revisionRequest.trim() || null,
  });
}

export function versionChangeChips(metadata: VersionChangeMetadata): string[] {
  const chips: string[] = [];
  if (metadata.changedFields.includes("lyrics")) chips.push("Lyrics");
  if (metadata.changedFields.includes("songStructure")) chips.push("Structure");
  if (metadata.changedFields.includes("songBlueprint")) chips.push("Arrangement");
  if (metadata.changedSections.some((section) => section.sectionLabel.toLowerCase().includes("chorus"))) {
    const chorus = metadata.changedSections.find((section) => section.sectionLabel.toLowerCase().includes("chorus"));
    if (chorus) chips.push(chorus.sectionLabel);
  }
  for (const field of metadata.changedFields) {
    if (["lyrics", "songStructure", "songBlueprint"].includes(field)) continue;
    const label = field.replace(/([a-z])([A-Z])/g, "$1 $2");
    chips.push(label.charAt(0).toUpperCase() + label.slice(1));
  }
  return [...new Set(chips)].slice(0, 4);
}
