import { z } from "zod";

export const AUDIO_REVISION_HANDOFF_KEY = "pb:audio-revision-handoff";

export const audioRevisionFeedbackInputSchema = z
  .object({
    projectId: z.string().uuid(),
    versionId: z.string().uuid(),
    trackId: z.string().uuid(),
    keep: z.string().trim().max(900).default(""),
    change: z.string().trim().max(1200).default(""),
    revisionBrief: z.string().trim().max(600).default(""),
  })
  .refine((value) => Boolean(value.keep || value.change), {
    message: "Add something to Keep or Change before creating a revision.",
  });

export type AudioRevisionFeedbackInput = z.infer<typeof audioRevisionFeedbackInputSchema>;

export function buildAudioRevisionRequest(input: Pick<AudioRevisionFeedbackInput, "keep" | "change" | "revisionBrief">) {
  const parts: string[] = [];
  if (input.keep.trim()) parts.push(`KEEP:\n${input.keep.trim()}`);
  if (input.change.trim()) parts.push(`CHANGE:\n${input.change.trim()}`);
  if (input.revisionBrief.trim()) parts.push(`REVISION BRIEF:\n${input.revisionBrief.trim()}`);
  return parts.join("\n\n");
}

export const audioRevisionHandoffSchema = z.object({
  feedbackId: z.string().uuid(),
  projectId: z.string().uuid(),
  versionId: z.string().uuid(),
  trackId: z.string().uuid(),
  revisionRequest: z.string().trim().min(1).max(3000),
});

export type AudioRevisionHandoff = z.infer<typeof audioRevisionHandoffSchema>;
