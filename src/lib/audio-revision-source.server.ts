export async function assertCurrentAudioRevisionSource(input: {
  supabase: any;
  userId: string;
  projectId: string;
  versionId: string;
  trackId: string;
}) {
  const { data: project, error: projectError } = await input.supabase
    .from("prompt_projects")
    .select("id")
    .eq("id", input.projectId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (projectError) throw new Error(projectError.message);
  if (!project) throw new Error("Project not found.");

  const { data: version, error: versionError } = await input.supabase
    .from("saved_prompts")
    .select("id")
    .eq("id", input.versionId)
    .eq("project_id", input.projectId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (versionError) throw new Error(versionError.message);
  if (!version) throw new Error("Project version not found.");

  const { data: relation, error: relationError } = await (input.supabase as any)
    .from("project_version_tracks")
    .select("track_id")
    .eq("user_id", input.userId)
    .eq("project_id", input.projectId)
    .eq("version_prompt_id", input.versionId)
    .eq("track_id", input.trackId)
    .maybeSingle();
  if (relationError) throw new Error(relationError.message);
  if (!relation) {
    throw new Error("The selected audio result is no longer linked to this version.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: track, error: trackError } = await (supabaseAdmin.from("tracks") as any)
    .select("id, user_id, source_type, moderation_status, audio_url")
    .eq("id", input.trackId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (trackError) throw new Error(trackError.message);
  if (
    !track ||
    track.source_type !== "upload" ||
    track.moderation_status !== "active" ||
    !track.audio_url
  ) {
    throw new Error("The selected audio result is not available for revision.");
  }

  return { projectId: input.projectId, versionId: input.versionId, trackId: input.trackId };
}
