import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const projectIdSchema = z.string().uuid();

const bulkDeletePlansSchema = z
  .array(
    z.object({
      projectId: projectIdSchema,
      deletePromptIds: z.array(z.string().uuid()).max(500).default([]),
    }),
  )
  .min(1)
  .max(100);

export type BulkDeletePromptProjectPlan = z.infer<typeof bulkDeletePlansSchema>[number];

export const previewBulkDeletePromptProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectIds: z.array(projectIdSchema).min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const projectIds = Array.from(new Set(data.projectIds));
    if (projectIds.length !== data.projectIds.length) {
      throw new Error("Duplicate Project IDs are not allowed.");
    }

    const { data: projects, error: projectError } = await context.supabase
      .from("prompt_projects")
      .select("id,name")
      .eq("user_id", context.userId)
      .in("id", projectIds);
    if (projectError) throw new Error(projectError.message);
    if ((projects ?? []).length !== projectIds.length) {
      throw new Error("One or more Projects were not found.");
    }

    const { data: promptRows, error: promptError } = await context.supabase
      .from("saved_prompts")
      .select("id,project_id,title,custom_name,version_number,version_label,theme")
      .eq("user_id", context.userId)
      .in("project_id", projectIds)
      .order("version_number", { ascending: true, nullsFirst: false });
    if (promptError) throw new Error(promptError.message);

    const { data: memberships, error: membershipError } = await (context.supabase as any)
      .from("song_universe_projects")
      .select("project_id,song_universes!inner(id,title,owner_id)")
      .in("project_id", projectIds)
      .eq("song_universes.owner_id", context.userId);
    if (membershipError) throw new Error(membershipError.message);

    const universeByProject = new Map<string, { id: string; title: string }>();
    for (const row of memberships ?? []) {
      const universe = Array.isArray(row.song_universes) ? row.song_universes[0] : row.song_universes;
      if (row.project_id && universe?.id && universe?.title) {
        universeByProject.set(row.project_id, { id: universe.id, title: universe.title });
      }
    }

    return {
      projects: projectIds.map((projectId) => {
        const project = (projects ?? []).find((item) => item.id === projectId)!;
        return {
          id: project.id,
          name: project.name,
          universe: universeByProject.get(project.id) ?? null,
          prompts: (promptRows ?? [])
            .filter((prompt) => prompt.project_id === project.id)
            .map((prompt) => ({
              id: prompt.id,
              projectId: prompt.project_id,
              title: prompt.title,
              customName: prompt.custom_name,
              versionNumber: prompt.version_number,
              versionLabel: prompt.version_label,
              theme: prompt.theme,
            })),
        };
      }),
    };
  });

export const bulkDeletePromptProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ plans: bulkDeletePlansSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const projectIds = data.plans.map((plan) => plan.projectId);
    if (new Set(projectIds).size !== projectIds.length) {
      throw new Error("Duplicate Project IDs are not allowed.");
    }

    const { data: result, error } = await (context.supabase as any).rpc(
      "bulk_delete_prompt_projects",
      { _plans: data.plans },
    );
    if (error) throw new Error(error.message);

    return {
      ok: true,
      deletedProjectCount:
        typeof result?.deletedProjectCount === "number" ? result.deletedProjectCount : projectIds.length,
      deletedPromptCount:
        typeof result?.deletedPromptCount === "number"
          ? result.deletedPromptCount
          : data.plans.reduce((sum, plan) => sum + plan.deletePromptIds.length, 0),
    };
  });
