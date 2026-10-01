import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  audioRevisionFeedbackInputSchema,
  buildAudioRevisionRequest,
} from "@/lib/audio-revision-feedback.shared";

const feedbackColumns =
  "id, project_id, source_version_prompt_id, source_track_id, keep_text, change_text, revision_brief, created_revision_prompt_id";

function sameFeedbackContext(
  feedback: Record<string, unknown>,
  data: { projectId: string; versionId: string; trackId: string },
) {
  return (
    feedback.project_id === data.projectId &&
    feedback.source_version_prompt_id === data.versionId &&
    feedback.source_track_id === data.trackId
  );
}

export const createAudioRevisionFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => audioRevisionFeedbackInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: relation, error: relationError } = await (context.supabase as any)
      .from("project_version_tracks")
      .select("track_id")
      .eq("user_id", context.userId)
      .eq("project_id", data.projectId)
      .eq("version_prompt_id", data.versionId)
      .eq("track_id", data.trackId)
      .maybeSingle();
    if (relationError) throw new Error(relationError.message);
    if (!relation)
      throw new Error("The selected audio result is no longer linked to this version.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: track, error: trackError } = await (supabaseAdmin.from("tracks") as any)
      .select("id, user_id, source_type, moderation_status")
      .eq("id", data.trackId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (trackError) throw new Error(trackError.message);
    if (!track || track.source_type !== "upload" || track.moderation_status !== "active") {
      throw new Error("The selected audio result is not available for revision.");
    }

    const requestedRevision = buildAudioRevisionRequest(data);
    if (!requestedRevision || requestedRevision.length > 3000) {
      throw new Error("The revision direction is too long.");
    }

    const table = supabaseAdmin.from("project_audio_revision_feedback") as any;
    const findExisting = async () => {
      const { data: existing, error } = await table
        .select(feedbackColumns)
        .eq("user_id", context.userId)
        .eq("idempotency_key", data.idempotencyKey)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return existing as Record<string, unknown> | null;
    };

    let feedback = await findExisting();
    if (!feedback) {
      const { data: inserted, error: insertError } = await table
        .insert({
          user_id: context.userId,
          idempotency_key: data.idempotencyKey,
          project_id: data.projectId,
          source_version_prompt_id: data.versionId,
          source_track_id: data.trackId,
          keep_text: data.keep,
          change_text: data.change,
          revision_brief: data.revisionBrief || null,
          imported_evidence: [],
        })
        .select(feedbackColumns)
        .single();

      if (insertError) {
        if (insertError.code !== "23505") throw new Error(insertError.message);
        feedback = await findExisting();
      } else {
        feedback = inserted as Record<string, unknown>;
      }
    }

    if (!feedback) throw new Error("The audio revision feedback could not be saved.");
    if (!sameFeedbackContext(feedback, data)) {
      throw new Error("The audio revision request conflicts with an earlier retry.");
    }

    const revisionRequest = buildAudioRevisionRequest({
      keep: String(feedback.keep_text ?? ""),
      change: String(feedback.change_text ?? ""),
      revisionBrief: String(feedback.revision_brief ?? ""),
    });

    return {
      feedbackId: String(feedback.id),
      projectId: String(feedback.project_id),
      versionId: String(feedback.source_version_prompt_id),
      trackId: String(feedback.source_track_id),
      revisionRequest,
      createdRevisionPromptId:
        feedback.created_revision_prompt_id == null
          ? null
          : String(feedback.created_revision_prompt_id),
    };
  });

export const completeAudioRevisionFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        feedbackId: z.string().uuid(),
        revisionPromptId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = supabaseAdmin.from("project_audio_revision_feedback") as any;
    const { data: feedback, error: feedbackError } = await table
      .select("id, project_id, source_version_prompt_id, created_revision_prompt_id")
      .eq("id", data.feedbackId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (feedbackError) throw new Error(feedbackError.message);
    if (!feedback) throw new Error("Audio revision feedback not found.");

    if (feedback.created_revision_prompt_id) {
      if (feedback.created_revision_prompt_id !== data.revisionPromptId) {
        throw new Error("This audio revision feedback is already linked to another revision.");
      }
      return { ok: true as const, revisionPromptId: data.revisionPromptId };
    }

    const { data: revision, error: revisionError } = await (
      supabaseAdmin.from("saved_prompts") as any
    )
      .select("id, user_id, project_id, parent_prompt_id")
      .eq("id", data.revisionPromptId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (revisionError) throw new Error(revisionError.message);
    if (
      !revision ||
      revision.project_id !== feedback.project_id ||
      revision.parent_prompt_id !== feedback.source_version_prompt_id
    ) {
      throw new Error("The created revision does not belong to this audio revision request.");
    }

    const { data: updated, error: updateError } = await table
      .update({ created_revision_prompt_id: data.revisionPromptId })
      .eq("id", data.feedbackId)
      .eq("user_id", context.userId)
      .is("created_revision_prompt_id", null)
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!updated) {
      const { data: current, error: currentError } = await table
        .select("created_revision_prompt_id")
        .eq("id", data.feedbackId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (currentError) throw new Error(currentError.message);
      if (current?.created_revision_prompt_id !== data.revisionPromptId) {
        throw new Error("The audio revision feedback could not be linked to the created revision.");
      }
    }

    return { ok: true as const, revisionPromptId: data.revisionPromptId };
  });
