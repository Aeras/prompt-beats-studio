import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  audioRevisionFeedbackInputSchema,
  buildAudioRevisionRequest,
} from "@/lib/audio-revision-feedback.shared";
import { assertCurrentAudioRevisionSource } from "@/lib/audio-revision-source.server";

const feedbackColumns =
  "id, project_id, source_version_prompt_id, source_track_id, revision_intent_id, keep_text, change_text, revision_brief, created_revision_prompt_id";

type AudioRevisionFeedbackRow = {
  id: string;
  project_id: string;
  source_version_prompt_id: string;
  source_track_id: string;
  revision_intent_id: string | null;
  keep_text: string;
  change_text: string;
  revision_brief: string | null;
  created_revision_prompt_id: string | null;
};

function sameFeedbackContext(
  feedback: AudioRevisionFeedbackRow,
  data: { projectId: string; versionId: string; trackId: string; revisionIntentId?: string | null },
) {
  return (
    feedback.project_id === data.projectId &&
    feedback.source_version_prompt_id === data.versionId &&
    feedback.source_track_id === data.trackId &&
    feedback.revision_intent_id === (data.revisionIntentId ?? null)
  );
}

async function markIntentCompleted(supabaseAdmin: any, userId: string, intentId: string | null) {
  if (!intentId) return;
  const { error } = await supabaseAdmin
    .from("project_audio_revision_intents")
    .update({ status: "completed" })
    .eq("id", intentId)
    .eq("user_id", userId)
    .eq("status", "draft");
  if (error) throw new Error(error.message);
}

export const createAudioRevisionFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => audioRevisionFeedbackInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = (supabaseAdmin as any).from("project_audio_revision_feedback");

    const findByIdempotency = async () => {
      const { data: existing, error } = await table
        .select(feedbackColumns)
        .eq("user_id", context.userId)
        .eq("idempotency_key", data.idempotencyKey)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return existing as AudioRevisionFeedbackRow | null;
    };

    const findByIntent = async () => {
      if (!data.revisionIntentId) return null;
      const { data: existing, error } = await table
        .select(feedbackColumns)
        .eq("user_id", context.userId)
        .eq("revision_intent_id", data.revisionIntentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return existing as AudioRevisionFeedbackRow | null;
    };

    let feedback = (await findByIntent()) ?? (await findByIdempotency());
    if (feedback?.created_revision_prompt_id) {
      if (!sameFeedbackContext(feedback, data)) {
        throw new Error("The audio revision request conflicts with an earlier retry.");
      }
      await markIntentCompleted(supabaseAdmin as any, context.userId, feedback.revision_intent_id);
      return {
        feedbackId: feedback.id,
        projectId: feedback.project_id,
        versionId: feedback.source_version_prompt_id,
        trackId: feedback.source_track_id,
        revisionRequest: buildAudioRevisionRequest({
          keep: feedback.keep_text,
          change: feedback.change_text,
          revisionBrief: feedback.revision_brief ?? "",
        }),
        createdRevisionPromptId: feedback.created_revision_prompt_id,
      };
    }

    await assertCurrentAudioRevisionSource({
      supabase: context.supabase,
      userId: context.userId,
      projectId: data.projectId,
      versionId: data.versionId,
      trackId: data.trackId,
    });

    let direction = {
      keep: data.keep,
      change: data.change,
      revisionBrief: data.revisionBrief,
    };

    if (data.revisionIntentId) {
      const { data: intent, error: intentError } = await (supabaseAdmin as any)
        .from("project_audio_revision_intents")
        .select(
          "id, project_id, source_version_prompt_id, source_track_id, status, accepted_keep_text, accepted_change_text, accepted_revision_brief",
        )
        .eq("id", data.revisionIntentId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (intentError) throw new Error(intentError.message);
      if (
        !intent ||
        intent.project_id !== data.projectId ||
        intent.source_version_prompt_id !== data.versionId ||
        intent.source_track_id !== data.trackId ||
        intent.status !== "draft"
      ) {
        throw new Error("Revision intent does not match this audio revision request.");
      }
      direction = {
        keep: intent.accepted_keep_text ?? "",
        change: intent.accepted_change_text ?? "",
        revisionBrief: intent.accepted_revision_brief ?? "",
      };
    }

    const requestedRevision = buildAudioRevisionRequest(direction);
    if (!requestedRevision || requestedRevision.length > 3000) {
      throw new Error("The revision direction is too long.");
    }

    if (!feedback) {
      const { data: inserted, error: insertError } = await table
        .insert({
          user_id: context.userId,
          idempotency_key: data.idempotencyKey,
          project_id: data.projectId,
          source_version_prompt_id: data.versionId,
          source_track_id: data.trackId,
          revision_intent_id: data.revisionIntentId ?? null,
          keep_text: direction.keep,
          change_text: direction.change,
          revision_brief: direction.revisionBrief || null,
          imported_evidence: [],
        })
        .select(feedbackColumns)
        .single();

      if (insertError) {
        if (insertError.code !== "23505") throw new Error(insertError.message);
        feedback = (await findByIntent()) ?? (await findByIdempotency());
      } else {
        feedback = inserted as AudioRevisionFeedbackRow;
      }
    }

    if (!feedback) throw new Error("The audio revision feedback could not be saved.");
    if (!sameFeedbackContext(feedback, data)) {
      throw new Error("The audio revision request conflicts with an earlier retry.");
    }

    return {
      feedbackId: feedback.id,
      projectId: feedback.project_id,
      versionId: feedback.source_version_prompt_id,
      trackId: feedback.source_track_id,
      revisionRequest: buildAudioRevisionRequest({
        keep: feedback.keep_text,
        change: feedback.change_text,
        revisionBrief: feedback.revision_brief ?? "",
      }),
      createdRevisionPromptId: feedback.created_revision_prompt_id,
    };
  });

export const completeAudioRevisionFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ feedbackId: z.string().uuid(), revisionPromptId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = (supabaseAdmin as any).from("project_audio_revision_feedback");
    const { data: feedback, error: feedbackError } = await table
      .select(
        "id, project_id, source_version_prompt_id, revision_intent_id, created_revision_prompt_id",
      )
      .eq("id", data.feedbackId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (feedbackError) throw new Error(feedbackError.message);
    if (!feedback) throw new Error("Audio revision feedback not found.");

    if (feedback.created_revision_prompt_id) {
      if (feedback.created_revision_prompt_id !== data.revisionPromptId) {
        throw new Error("This audio revision feedback is already linked to another revision.");
      }
      await markIntentCompleted(supabaseAdmin as any, context.userId, feedback.revision_intent_id);
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

    await markIntentCompleted(supabaseAdmin as any, context.userId, feedback.revision_intent_id);
    return { ok: true as const, revisionPromptId: data.revisionPromptId };
  });
