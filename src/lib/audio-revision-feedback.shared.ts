import { z } from "zod";

export const audioRevisionFeedbackInputSchema = z
  .object({
    idempotencyKey: z.string().guid(),
    projectId: z.string().guid(),
    versionId: z.string().guid(),
    trackId: z.string().guid(),
    revisionIntentId: z.string().guid().nullable().optional().default(null),
    keep: z.string().trim().max(900).default(""),
    change: z.string().trim().max(1200).default(""),
    revisionBrief: z.string().trim().max(600).default(""),
  })
  .refine((value) => Boolean(value.keep || value.change), {
    message: "Add something to Keep or Change before creating a revision.",
  });

export type AudioRevisionFeedbackInput = z.infer<typeof audioRevisionFeedbackInputSchema>;

export function buildAudioRevisionRequest(
  input: Pick<AudioRevisionFeedbackInput, "keep" | "change" | "revisionBrief">,
) {
  const parts: string[] = [];
  if (input.keep.trim()) parts.push(`KEEP:\n${input.keep.trim()}`);
  if (input.change.trim()) parts.push(`CHANGE:\n${input.change.trim()}`);
  if (input.revisionBrief.trim()) parts.push(`REVISION BRIEF:\n${input.revisionBrief.trim()}`);
  return parts.join("\n\n");
}
