import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import { workspaceSaveInputSchema } from "@/lib/lyrics-workspace.shared";
import { buildLyricsWorkspaceVersionMetadata } from "@/lib/project-version-history.shared";

const saveResultSchema = z.object({
  id: z.string().guid(),
  project_id: z.string().guid(),
  version_number: z.number().int().positive(),
  parent_prompt_id: z.string().guid(),
  version_label: z.string().nullable(),
});

export const saveLyricsWorkspaceVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => workspaceSaveInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "lyrics_workspace");

    let baseQuery = context.supabase
      .from("saved_prompts")
      .select("id, lyrics")
      .eq("id", data.basePromptId)
      .eq("user_id", context.userId);
    baseQuery = data.projectId
      ? baseQuery.eq("project_id", data.projectId)
      : baseQuery.is("project_id", null);
    const { data: base, error: baseError } = await baseQuery.maybeSingle();
    if (baseError) throw new Error(baseError.message);
    if (!base) throw new Error("Base prompt not found.");

    if (!data.projectId) {
      const { data: replaced, error } = await context.supabase
        .from("saved_prompts")
        .update({ lyrics: data.lyrics, updated_at: new Date().toISOString() })
        .eq("id", data.basePromptId)
        .eq("user_id", context.userId)
        .is("project_id", null)
        .select("id")
        .maybeSingle();
      if (error || !replaced)
        throw new Error("The edited lyrics could not replace the standalone Prompt.");
      return {
        savedPromptId: replaced.id,
        projectId: null,
        versionNumber: null,
        parentPromptId: null,
        versionLabel: null,
      };
    }

    const { data: project, error: projectError } = await context.supabase
      .from("prompt_projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found.");

    const versionChangeMetadata = buildLyricsWorkspaceVersionMetadata({
      beforeLyrics: base.lyrics,
      afterLyrics: data.lyrics,
      versionLabel: data.versionLabel,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: raw, error } = await supabaseAdmin.rpc("create_prompt_lyrics_workspace_version", {
      _user_id: context.userId,
      _project_id: data.projectId,
      _parent_prompt_id: data.basePromptId,
      _lyrics: data.lyrics,
      _version_label: data.versionLabel,
      _version_change_metadata: versionChangeMetadata,
    });
    if (error) throw new Error("The edited lyrics could not be saved as a new version.");

    const parsed = saveResultSchema.safeParse(raw);
    if (!parsed.success) throw new Error("The edited lyrics could not be saved as a new version.");
    return {
      savedPromptId: parsed.data.id,
      projectId: parsed.data.project_id,
      versionNumber: parsed.data.version_number,
      parentPromptId: parsed.data.parent_prompt_id,
      versionLabel: parsed.data.version_label,
    };
  });
