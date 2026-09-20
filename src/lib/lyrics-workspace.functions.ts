import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { workspaceSaveInputSchema } from "@/lib/lyrics-workspace.shared";

const saveResultSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  version_number: z.number().int().positive(),
  parent_prompt_id: z.string().uuid(),
  version_label: z.string().nullable(),
});

export const saveLyricsWorkspaceVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => workspaceSaveInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Explicit ownership checks make crafted workspace URLs fail before the
    // service-role RPC path is reached.
    const { data: project, error: projectError } = await context.supabase
      .from("prompt_projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found.");

    const { data: base, error: baseError } = await context.supabase
      .from("saved_prompts")
      .select("id")
      .eq("id", data.basePromptId)
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (baseError) throw new Error(baseError.message);
    if (!base) throw new Error("Base version not found.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: raw, error } = await supabaseAdmin.rpc("create_prompt_lyrics_workspace_version", {
      _user_id: context.userId,
      _project_id: data.projectId,
      _parent_prompt_id: data.basePromptId,
      _lyrics: data.lyrics,
      _version_label: data.versionLabel,
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
