import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  selectHomeRecentProject,
  type HomeProjectCandidate,
  type HomeRecentProject,
  type HomeVersionCandidate,
} from "@/lib/home-recent-project.shared";

const HOME_RECENT_VERSION_CANDIDATE_LIMIT = 24;

export const getHomeRecentProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HomeRecentProject | null> => {
    const { data: versions, error: versionsError } = await context.supabase
      .from("saved_prompts")
      .select("id, project_id, version_number, version_label, created_at")
      .eq("user_id", context.userId)
      .not("project_id", "is", null)
      .not("version_number", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(HOME_RECENT_VERSION_CANDIDATE_LIMIT);

    if (versionsError) throw new Error(versionsError.message);
    const versionCandidates = (versions ?? []) as HomeVersionCandidate[];
    if (versionCandidates.length === 0) return null;

    const projectIds = [
      ...new Set(versionCandidates.flatMap((version) => version.project_id ?? [])),
    ];
    if (projectIds.length === 0) return null;

    const { data: projects, error: projectsError } = await context.supabase
      .from("prompt_projects")
      .select("id, name")
      .eq("user_id", context.userId)
      .in("id", projectIds);

    if (projectsError) throw new Error(projectsError.message);

    return selectHomeRecentProject(versionCandidates, (projects ?? []) as HomeProjectCandidate[]);
  });
