import { z } from "zod";

export const AUDIO_OUTCOME_NOTE_MAX = 1000;

export const audioOutcomeLevelSchema = z.enum(["not_met", "partially_met", "mostly_met", "met"]);

export const audioOutcomeSourceSchema = z.object({
  projectId: z.string().guid(),
  versionId: z.string().guid(),
  trackId: z.string().guid(),
});

export const saveAudioOutcomeSchema = audioOutcomeSourceSchema.extend({
  level: audioOutcomeLevelSchema,
  note: z.string().trim().max(AUDIO_OUTCOME_NOTE_MAX).default(""),
  expectedLockVersion: z.number().int().nonnegative().nullable().default(null),
});

export const listAudioOutcomesSchema = z.object({
  projectId: z.string().guid(),
  versionId: z.string().guid(),
});

export type AudioOutcomeLevel = z.infer<typeof audioOutcomeLevelSchema>;
