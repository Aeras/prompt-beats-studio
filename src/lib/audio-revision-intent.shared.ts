import { z } from "zod";

export const AUDIO_REVISION_INTENT_REQUEST_MAX = 4000;
export const AUDIO_REVISION_KEEP_MAX = 900;
export const AUDIO_REVISION_CHANGE_MAX = 1200;
export const AUDIO_REVISION_BRIEF_MAX = 600;

export const audioRevisionIntentSourceSchema = z.object({
  projectId: z.string().uuid(),
  versionId: z.string().uuid(),
  trackId: z.string().uuid(),
});

export const createAudioRevisionIntentSchema = audioRevisionIntentSourceSchema.extend({
  userRequest: z.string().trim().max(AUDIO_REVISION_INTENT_REQUEST_MAX).default(""),
});

export const getAudioRevisionIntentSchema = audioRevisionIntentSourceSchema.extend({
  intentId: z.string().uuid().optional(),
});

export const unresolvedRevisionSuggestionSchema = z.object({
  structureIndex: z.number().int().nonnegative().nullable(),
  modelLabel: z.string().trim().max(120).nullable(),
  instruction: z.string().trim().min(1).max(600),
  confidence: z.number().min(0).max(1),
  reason: z.enum(["missing_index", "out_of_range", "label_mismatch", "low_confidence"]),
});

export const updateAudioRevisionIntentSchema = audioRevisionIntentSourceSchema.extend({
  intentId: z.string().uuid(),
  expectedLockVersion: z.number().int().nonnegative(),
  userRequest: z.string().trim().max(AUDIO_REVISION_INTENT_REQUEST_MAX),
  acceptedKeep: z.string().trim().max(AUDIO_REVISION_KEEP_MAX).default(""),
  acceptedChange: z.string().trim().max(AUDIO_REVISION_CHANGE_MAX).default(""),
  acceptedRevisionBrief: z.string().trim().max(AUDIO_REVISION_BRIEF_MAX).default(""),
  unresolvedSuggestions: z.array(unresolvedRevisionSuggestionSchema).max(20).default([]),
});

export const requestAudioRevisionIntentTranslationSchema = audioRevisionIntentSourceSchema.extend({
  intentId: z.string().uuid(),
  requestKey: z.string().uuid(),
  model: z.string().trim().min(1).max(240).optional(),
});

export const audioRevisionSectionProposalSchema = z.object({
  structureIndex: z.number().int().nonnegative().nullable(),
  sectionLabel: z.string().trim().max(120).nullable(),
  instruction: z.string().trim().min(1).max(600),
  confidence: z.number().min(0).max(1),
});

export const audioRevisionIntentProposalSchema = z.object({
  keep: z.string().trim().max(AUDIO_REVISION_KEEP_MAX),
  change: z.string().trim().max(AUDIO_REVISION_CHANGE_MAX),
  revisionBrief: z.string().trim().max(AUDIO_REVISION_BRIEF_MAX),
  sectionSuggestions: z.array(audioRevisionSectionProposalSchema).max(12),
});

export type AudioRevisionIntentProposal = z.infer<typeof audioRevisionIntentProposalSchema>;
export type UnresolvedRevisionSuggestion = z.infer<typeof unresolvedRevisionSuggestionSchema>;
