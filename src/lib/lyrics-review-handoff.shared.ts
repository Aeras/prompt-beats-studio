import { z } from "zod";

import { generatorInputSnapshotSchema } from "@/lib/generator-revision.shared";

export const LYRICS_REVIEW_HANDOFF_STORAGE_PREFIX = "pb:lyrics-review-handoff:";

const generatorResultSchema = z.object({
  title: z.string(),
  tags: z.string(),
  lyrics: z.string(),
  note: z.string(),
});

const qualityStateSchema = z.unknown().nullable();

export const lyricsReviewGeneratorHandoffSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  source: z.literal("generator"),
  createdAt: z.string(),
  snapshot: generatorInputSnapshotSchema,
  result: generatorResultSchema,
  authoritativeLanguage: z.string().trim().min(1).max(80),
  generatorState: z.object({
    quality: qualityStateSchema,
    generationId: z.string().uuid().nullable(),
    generationResultModel: z.string().nullable(),
    qualityCheckResultModel: z.string().nullable(),
    saved: z.boolean(),
    open: z.object({
      title: z.boolean(),
      tags: z.boolean(),
      lyrics: z.boolean(),
      note: z.boolean(),
    }),
    revisionMode: z.boolean(),
    revisionProjectId: z.string(),
    revisionBasePromptId: z.string(),
    revisionRequest: z.string(),
    revisionMeta: z.object({
      savedPromptId: z.string().uuid(),
      projectId: z.string().uuid(),
      versionNumber: z.number().int().positive(),
      parentPromptId: z.string().uuid(),
    }).nullable(),
  }),
  returnMode: z.enum(["pending", "apply", "discard"]).default("pending"),
  reviewedLyrics: z.string().max(12000).nullable().default(null),
});

export type LyricsReviewGeneratorHandoff = z.infer<typeof lyricsReviewGeneratorHandoffSchema>;

export function lyricsReviewHandoffStorageKey(id: string) {
  return `${LYRICS_REVIEW_HANDOFF_STORAGE_PREFIX}${id}`;
}

export function writeLyricsReviewGeneratorHandoff(handoff: LyricsReviewGeneratorHandoff) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    lyricsReviewHandoffStorageKey(handoff.id),
    JSON.stringify(lyricsReviewGeneratorHandoffSchema.parse(handoff)),
  );
}

export function readLyricsReviewGeneratorHandoff(id: string): LyricsReviewGeneratorHandoff | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(lyricsReviewHandoffStorageKey(id));
  if (!raw) return null;
  try {
    return lyricsReviewGeneratorHandoffSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function removeLyricsReviewGeneratorHandoff(id: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(lyricsReviewHandoffStorageKey(id));
}
