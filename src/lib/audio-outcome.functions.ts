import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCurrentAudioRevisionSource } from "@/lib/audio-revision-source.server";
import {
  listAudioOutcomesSchema,
  saveAudioOutcomeSchema,
  type AudioOutcomeLevel,
} from "@/lib/audio-outcome.shared";

export type AudioOutcomeEvaluation = {
  id: string;
  trackId: string;
  level: AudioOutcomeLevel;
  note: string;
  lockVersion: number;
  updatedAt: string;
};

async function assertOwnedProjectVersion(
  supabase: any,
  userId: string,
  projectId: string,
  versionId: string,
) {
  const { data: project, error: projectError } = await supabase
    .from("prompt_projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (projectError) throw new Error(projectError.message);
  if (!project) throw new Error("Project not found.");

  const { data: version, error: versionError } = await supabase
    .from("saved_prompts")
    .select("id")
    .eq("id", versionId)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (versionError) throw new Error(versionError.message);
  if (!version) throw new Error("Project version not found.");
}

export const listAudioOutcomeEvaluations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listAudioOutcomesSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertOwnedProjectVersion(
      context.supabase,
      context.userId,
      data.projectId,
      data.versionId,
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("project_audio_outcome_evaluations")
      .select("id, source_track_id, intent_match_level, note, lock_version, updated_at")
      .eq("user_id", context.userId)
      .eq("project_id", data.projectId)
      .eq("source_version_prompt_id", data.versionId);
    if (error) throw new Error(error.message);

    return {
      evaluations: (rows ?? []).map((row: any) => ({
        id: row.id as string,
        trackId: row.source_track_id as string,
        level: row.intent_match_level as AudioOutcomeLevel,
        note: (row.note as string | null) ?? "",
        lockVersion: row.lock_version as number,
        updatedAt: row.updated_at as string,
      })) satisfies AudioOutcomeEvaluation[],
    };
  });

export const saveAudioOutcomeEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveAudioOutcomeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCurrentAudioRevisionSource({
      supabase: context.supabase,
      userId: context.userId,
      projectId: data.projectId,
      versionId: data.versionId,
      trackId: data.trackId,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = (supabaseAdmin as any).from("project_audio_outcome_evaluations");

    if (data.expectedLockVersion === null) {
      const { data: inserted, error } = await table
        .insert({
          user_id: context.userId,
          project_id: data.projectId,
          source_version_prompt_id: data.versionId,
          source_track_id: data.trackId,
          intent_match_level: data.level,
          note: data.note || null,
          lock_version: 0,
        })
        .select("id, source_track_id, intent_match_level, note, lock_version, updated_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new Error("This evaluation changed in another tab. Reload it before saving again.");
        }
        throw new Error(error.message);
      }
      return {
        evaluation: {
          id: inserted.id,
          trackId: inserted.source_track_id,
          level: inserted.intent_match_level as AudioOutcomeLevel,
          note: inserted.note ?? "",
          lockVersion: inserted.lock_version,
          updatedAt: inserted.updated_at,
        } satisfies AudioOutcomeEvaluation,
      };
    }

    const nextLockVersion = data.expectedLockVersion + 1;
    const { data: updated, error } = await table
      .update({
        intent_match_level: data.level,
        note: data.note || null,
        lock_version: nextLockVersion,
      })
      .eq("user_id", context.userId)
      .eq("project_id", data.projectId)
      .eq("source_version_prompt_id", data.versionId)
      .eq("source_track_id", data.trackId)
      .eq("lock_version", data.expectedLockVersion)
      .select("id, source_track_id, intent_match_level, note, lock_version, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) {
      throw new Error("This evaluation changed in another tab. Reload it before saving again.");
    }

    return {
      evaluation: {
        id: updated.id,
        trackId: updated.source_track_id,
        level: updated.intent_match_level as AudioOutcomeLevel,
        note: updated.note ?? "",
        lockVersion: updated.lock_version,
        updatedAt: updated.updated_at,
      } satisfies AudioOutcomeEvaluation,
    };
  });
