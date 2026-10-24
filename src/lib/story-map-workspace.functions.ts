import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import { storyMapDraftSchema } from "@/lib/story-map.shared";

const idSchema = z.string().guid();

async function requireOwnedMap(supabase: any, storyMapId: string, userId: string) {
  const { data, error } = await supabase
    .from("story_maps")
    .select("id")
    .eq("id", storyMapId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Story Map not found.");
}

export const listStoryMapProjectOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    const { data, error } = await (context.supabase as any)
      .from("prompt_projects")
      .select("id,name,updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return {
      projects: (data ?? []).map((project: any) => ({
        id: String(project.id),
        name: String(project.name ?? "Untitled Project"),
      })),
    };
  });

export const getStoryMapIdForProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    const { data: project, error: projectError } = await (context.supabase as any)
      .from("prompt_projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found.");
    const { data: map, error } = await (context.supabase as any)
      .from("story_maps")
      .select("id")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { storyMapId: map?.id ? String(map.id) : null };
  });

export const replaceStoryMapDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ storyMapId: idSchema, draft: storyMapDraftSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    await requireOwnedMap(context.supabase as any, data.storyMapId, context.userId);
    const { error } = await (context.supabase as any).rpc("replace_story_map_draft", {
      _story_map_id: data.storyMapId,
      _progression_type: data.draft.progressionType,
      _summary: data.draft.summary,
      _narrator: data.draft.narrator,
      _point_of_view: data.draft.pointOfView,
      _starting_state: data.draft.startingState,
      _central_change: data.draft.centralChange,
      _turning_point: data.draft.turningPoint,
      _resolution: data.draft.resolution,
      _beats: data.draft.beats,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderStoryMapBeatsAtomic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ storyMapId: idSchema, beatIds: z.array(idSchema).min(1).max(10) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    await requireOwnedMap(context.supabase as any, data.storyMapId, context.userId);
    const { error } = await (context.supabase as any).rpc("reorder_story_map_beats", {
      _story_map_id: data.storyMapId,
      _beat_ids: data.beatIds,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
