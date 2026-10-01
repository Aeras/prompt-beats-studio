import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  audioRevisionFeedbackInputSchema,
  buildAudioRevisionRequest,
} from "@/lib/audio-revision-feedback.shared";

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
    if (!relation) throw new Error("The selected audio result is no longer linked to this version.");

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
    const columns =
      "id, project_id, source_version_prompt_id, source_track_id, keep_text, change_text, revision_brief";
    const { data: existing, error: existingError } = await table
      .select(columns)
      .eq("user_id", context.userId)
      .eq("idempotency_key", data.idempotencyKey)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    let feedback = existing;
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
        .select(columns)
        .single();
      if (insertError) throw new Error(insertError.message);
      feedback = inserted;
    }

    if (!feedback) throw new Error("The audio revision feedback could not be saved.");
    if (
      feedback.project_id !== data.projectId ||
      feedback.source_version_prompt_id !== data.versionId ||
      feedback.source_track_id !== data.trackId
    ) {
      throw new Error("The audio revision request conflicts with an earlier retry.");
    }

    const revisionRequest = buildAudioRevisionRequest({
      keep: String(feedback.keep_text ?? ""),
      change: String(feedback.change_text ?? ""),
      revisionBrief: String(feedback.revision_brief ?? ""),
    });

    return {
      feedbackId: feedback.id as string,
      projectId: feedback.project_id as string,
      versionId: feedback.source_version_prompt_id as string,
      trackId: feedback.source_track_id as string,
      revisionRequest,
    };
  });
