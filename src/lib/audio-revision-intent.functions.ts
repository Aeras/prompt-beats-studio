import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCurrentAudioRevisionSource } from "@/lib/audio-revision-source.server";
import {
  createAudioRevisionIntentSchema,
  getAudioRevisionIntentSchema,
  updateAudioRevisionIntentSchema,
  type UnresolvedRevisionSuggestion,
} from "@/lib/audio-revision-intent.shared";

export type AudioRevisionIntentRecord = {
  id: string;
  projectId: string;
  versionId: string;
  trackId: string;
  userRequest: string;
  acceptedKeep: string;
  acceptedChange: string;
  acceptedRevisionBrief: string;
  unresolvedSuggestions: UnresolvedRevisionSuggestion[];
  status: "draft" | "completed";
  lockVersion: number;
  completedAt: string | null;
  feedbackId: string | null;
  createdRevisionPromptId: string | null;
};

const intentColumns = "id, project_id, source_version_prompt_id, source_track_id, user_request, accepted_keep_text, accepted_change_text, accepted_revision_brief, unresolved_suggestions, status, lock_version, completed_at, created_at, updated_at";

export const getAudioRevisionIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => getAudioRevisionIntentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = (supabaseAdmin as any)
      .from("project_audio_revision_intents")
      .select(intentColumns)
      .eq("user_id", context.userId)
      .eq("project_id", data.projectId)
      .eq("source_version_prompt_id", data.versionId)
      .eq("source_track_id", data.trackId);
    query = data.intentId ? query.eq("id", data.intentId) : query.eq("status", "draft");
    const { data: row, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { intent: null };
    const { data: feedback, error: feedbackError } = await (supabaseAdmin as any)
      .from("project_audio_revision_feedback")
      .select("id, created_revision_prompt_id")
      .eq("user_id", context.userId)
      .eq("revision_intent_id", row.id)
      .maybeSingle();
    if (feedbackError) throw new Error(feedbackError.message);
    return {
      intent: {
        id: row.id,
        projectId: row.project_id,
        versionId: row.source_version_prompt_id,
        trackId: row.source_track_id,
        userRequest: row.user_request ?? "",
        acceptedKeep: row.accepted_keep_text ?? "",
        acceptedChange: row.accepted_change_text ?? "",
        acceptedRevisionBrief: row.accepted_revision_brief ?? "",
        unresolvedSuggestions: Array.isArray(row.unresolved_suggestions) ? row.unresolved_suggestions : [],
        status: row.status,
        lockVersion: row.lock_version,
        completedAt: row.completed_at,
        feedbackId: feedback?.id ?? null,
        createdRevisionPromptId: feedback?.created_revision_prompt_id ?? null,
      } as AudioRevisionIntentRecord,
    };
  });

export const createAudioRevisionIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createAudioRevisionIntentSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCurrentAudioRevisionSource({ supabase: context.supabase, userId: context.userId, projectId: data.projectId, versionId: data.versionId, trackId: data.trackId });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = (supabaseAdmin as any).from("project_audio_revision_intents");
    const { data: inserted, error } = await table.insert({ user_id: context.userId, project_id: data.projectId, source_version_prompt_id: data.versionId, source_track_id: data.trackId, user_request: data.userRequest, status: "draft", lock_version: 0 }).select(intentColumns).single();
    if (!error) return { intentId: inserted.id as string };
    if (error.code !== "23505") throw new Error(error.message);
    const { data: existing, error: existingError } = await table.select("id").eq("user_id", context.userId).eq("project_id", data.projectId).eq("source_version_prompt_id", data.versionId).eq("source_track_id", data.trackId).eq("status", "draft").maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing) throw new Error("The revision intent could not be created safely.");
    return { intentId: existing.id as string };
  });

export const updateAudioRevisionIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateAudioRevisionIntentSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCurrentAudioRevisionSource({ supabase: context.supabase, userId: context.userId, projectId: data.projectId, versionId: data.versionId, trackId: data.trackId });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await (supabaseAdmin as any)
      .from("project_audio_revision_intents")
      .update({ user_request: data.userRequest, accepted_keep_text: data.acceptedKeep, accepted_change_text: data.acceptedChange, accepted_revision_brief: data.acceptedRevisionBrief || null, unresolved_suggestions: data.unresolvedSuggestions, lock_version: data.expectedLockVersion + 1 })
      .eq("id", data.intentId)
      .eq("user_id", context.userId)
      .eq("project_id", data.projectId)
      .eq("source_version_prompt_id", data.versionId)
      .eq("source_track_id", data.trackId)
      .eq("status", "draft")
      .eq("lock_version", data.expectedLockVersion)
      .select("id, lock_version")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("This revision intent changed in another tab. Reload it before saving again.");
    return { intentId: updated.id as string, lockVersion: updated.lock_version as number };
  });
