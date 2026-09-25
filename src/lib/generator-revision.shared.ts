import { z } from "zod";

import { AI_TARGET_PLATFORMS, DEFAULT_AI_TARGET_PLATFORM } from "@/lib/ai-target-platforms";
import { songBlueprintSchema } from "@/lib/song-blueprint.shared";

export const generatorInputSnapshotSchema = z.object({
  generatorMode: z.enum(["basic", "advanced", "revision"]),
  smartPresetId: z.string().max(80).default(""),
  culturalStyleId: z.string().max(80).default(""),
  theme: z.string().max(500).default(""),
  selectedMusicStyles: z.array(z.string().max(150)).max(24).default([]),
  customMusicStyle: z.string().max(500).default(""),
  selectedMoods: z.array(z.string().max(120)).max(24).default([]),
  customMood: z.string().max(120).default(""),
  language: z.string().max(80).default(""),
  languageVariant: z.string().max(80).default(""),
  customLanguage: z.string().max(80).default(""),
  selectedInstruments: z.array(z.string().max(120)).max(40).default([]),
  customInstruments: z.string().max(200).default(""),
  bpmMode: z.string().max(40).default("Auto"),
  customBpm: z.string().max(20).default(""),
  songStructure: z.array(z.string().max(80)).max(40).default([]),
  songBlueprint: songBlueprintSchema,
  productionStyle: z.string().max(2000).default(""),
  additionalInstructions: z.string().max(2000).default(""),
  targetPlatform: z.enum(AI_TARGET_PLATFORMS).default(DEFAULT_AI_TARGET_PLATFORM),
  generationModel: z.string().max(240).nullable().default(null),
});

export type GeneratorInputSnapshot = z.infer<typeof generatorInputSnapshotSchema>;

export const revisionBaseVersionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  versionNumber: z.number().int().positive().nullable(),
  versionLabel: z.string().nullable(),
  customName: z.string().nullable(),
  title: z.string().default(""),
  theme: z.string().default(""),
  genre: z.string().default(""),
  mood: z.string().default(""),
  language: z.string().default(""),
  tags: z.string().default(""),
  lyrics: z.string().default(""),
  note: z.string().default(""),
});

export type RevisionBaseVersion = z.infer<typeof revisionBaseVersionSchema>;

export const revisionJobContextSchema = z.object({
  projectId: z.string().uuid().nullable(),
  basePromptId: z.string().uuid(),
  revisionRequest: z.string().trim().min(1).max(3000),
  baseVersion: revisionBaseVersionSchema,
  baseSnapshot: generatorInputSnapshotSchema.nullable(),
  desiredSnapshot: generatorInputSnapshotSchema,
  changedFields: z.array(z.string().max(80)).max(32),
});

export type RevisionJobContext = z.infer<typeof revisionJobContextSchema>;

export function diffGeneratorSnapshots(
  base: GeneratorInputSnapshot | null,
  desired: GeneratorInputSnapshot,
): string[] {
  if (!base) return [];
  const keys = Object.keys(desired) as Array<keyof GeneratorInputSnapshot>;
  return keys.filter(
    (key) => key !== "generatorMode" && JSON.stringify(base[key]) !== JSON.stringify(desired[key]),
  );
}
