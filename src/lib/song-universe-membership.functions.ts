import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";

export const getProjectSongUniverseMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().guid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");

    const { data: project, error: projectError } = await context.supabase
      .from("prompt_projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found.");

    const { data: row, error } = await (context.supabase as any)
      .from("song_universe_projects")
      .select(
        "universe_id,universe_role,intentional_outlier,song_universes!inner(id,title,owner_id)",
      )
      .eq("project_id", data.projectId)
      .eq("song_universes.owner_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { membership: null };

    const universe = Array.isArray(row.song_universes) ? row.song_universes[0] : row.song_universes;
    return {
      membership: {
        universeId: row.universe_id as string,
        universeTitle: (universe?.title as string | undefined) ?? "Song Universe",
        universeRole: (row.universe_role as string | null | undefined) ?? null,
        intentionalOutlier: row.intentional_outlier === true,
      },
    };
  });
