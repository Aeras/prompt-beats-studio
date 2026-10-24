import { z } from "zod";
import { AI_TARGET_PLATFORMS, DEFAULT_AI_TARGET_PLATFORM } from "@/lib/ai-target-platforms";
import {
  generatorInputSnapshotSchema,
  type GeneratorInputSnapshot,
} from "@/lib/generator-revision.shared";
import { CUSTOM_LANGUAGE_VALUE, resolveSongLanguage } from "@/catalog/song-languages";

export const LYRICS_SECTION_ACTIONS = [
  "rewrite",
  "improve_rhyme",
  "improve_singability",
  "keep_meaning_improve_wording",
  "more_emotional",
  "more_concise",
  "more_poetic",
  "stronger_hook",
  "custom",
] as const;

export const lyricsSectionActionSchema = z.enum(LYRICS_SECTION_ACTIONS);
export type LyricsSectionAction = z.infer<typeof lyricsSectionActionSchema>;

export function resolveLyricsWorkspaceLanguage(
  storedLanguage: string | null | undefined,
  snapshot:
    | Pick<GeneratorInputSnapshot, "language" | "languageVariant" | "customLanguage">
    | null
    | undefined,
): string {
  const stored = storedLanguage?.trim() ?? "";
  if (stored) return stored;
  if (!snapshot) return "";

  const snapshotLanguage = snapshot.language.trim();
  if (!snapshotLanguage) return "";
  if (snapshotLanguage === CUSTOM_LANGUAGE_VALUE) return snapshot.customLanguage.trim();
  return resolveSongLanguage(snapshotLanguage, snapshot.languageVariant).trim();
}

export const lyricsSectionEditRequestSchema = z.object({
  idempotencyKey: z.string().guid(),
  feature: z.enum(["lyrics_workspace", "lyrics_review"]).default("lyrics_workspace"),
  generationModel: z.string().trim().min(1).max(240).nullish(),
  fullLyrics: z.string().min(1).max(12000),
  sectionKey: z.string().trim().min(1).max(120),
  action: lyricsSectionActionSchema,
  customInstruction: z.string().trim().max(2000).default(""),
  title: z.string().max(200).default(""),
  tags: z.string().max(4000).default(""),
  note: z.string().max(6000).default(""),
  theme: z.string().max(500).default(""),
  genre: z.string().max(500).default(""),
  mood: z.string().max(120).default(""),
  language: z.string().trim().min(1).max(80),
  targetPlatform: z.enum(AI_TARGET_PLATFORMS).default(DEFAULT_AI_TARGET_PLATFORM),
  generatorInputSnapshot: generatorInputSnapshotSchema.nullable().default(null),
  projectId: z.string().guid().nullish(),
  basePromptId: z.string().guid().nullish(),
});

export const lyricsSectionContextSchema = z.object({
  fullLyrics: z.string().min(1).max(12000),
  sectionKey: z.string().trim().min(1).max(120),
  sectionLabel: z.string().trim().min(1).max(80),
  sectionOccurrence: z.number().int().positive().max(100),
  selectedContent: z.string().max(8000),
  action: lyricsSectionActionSchema,
  customInstruction: z.string().trim().max(2000).default(""),
  title: z.string().max(200).default(""),
  tags: z.string().max(4000).default(""),
  note: z.string().max(6000).default(""),
  theme: z.string().max(500).default(""),
  genre: z.string().max(500).default(""),
  mood: z.string().max(120).default(""),
  language: z.string().trim().min(1).max(80),
  targetPlatform: z.enum(AI_TARGET_PLATFORMS).default(DEFAULT_AI_TARGET_PLATFORM),
  generatorInputSnapshot: generatorInputSnapshotSchema.nullable().default(null),
  projectId: z.string().guid().nullish(),
  basePromptId: z.string().guid().nullish(),
});

export const lyricsSectionEditJobSchema = z.object({
  operation: z.literal("lyrics_section_edit"),
  feature: z.enum(["lyrics_workspace", "lyrics_review"]).default("lyrics_workspace"),
  generationModel: z.string().trim().min(1).max(240).nullish(),
  sectionEdit: lyricsSectionContextSchema,
});

export const lyricsSectionEditOutputSchema = z.object({
  sectionLabel: z.string().trim().min(1).max(80),
  replacement: z.string().min(1).max(8000),
  alternatives: z.array(z.string().min(1).max(8000)).max(2).default([]),
});

export type LyricsSectionEditOutput = z.infer<typeof lyricsSectionEditOutputSchema>;
export type LyricsSectionEditContext = z.infer<typeof lyricsSectionContextSchema>;

export const workspaceSaveInputSchema = z.object({
  projectId: z.string().guid().nullable(),
  basePromptId: z.string().guid(),
  lyrics: z.string().min(1).max(12000),
  versionLabel: z.string().trim().min(1).max(120).default("Lyrics edit"),
});
