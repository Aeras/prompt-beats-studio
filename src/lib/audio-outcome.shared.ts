import { z } from "zod";

export const AUDIO_OUTCOME_NOTE_MAX = 1000;

export const audioOutcomeLevelSchema = z.enum([
  "not_met",
  "partially_met",
  "mostly_met",
  "met",
]);

export const audioOutcomeSourceSchema = z.object({
  projectId: z.string().uuid(),
  versionId: z.string().uuid(),
  trackId: z.string().uuid(),
});

export const saveAudioOutcomeSchema = audioOutcomeSourceSchema.extend({
  level: audioOutcomeLevelSchema,
  note: z.string().trim().max(AUDIO_OUTCOME_NOTE_MAX).default(""),
  expectedLockVersion: z.number().int().nonnegative().nullable().default(null),
});

export const listAudioOutcomesSchema = z.object({
  projectId: z.string().uuid(),
  versionId: z.string().uuid(),
});

export type AudioOutcomeLevel = z.infer<typeof audioOutcomeLevelSchema>;
