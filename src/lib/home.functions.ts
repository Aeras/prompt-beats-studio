import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { FeatureKey } from "@/lib/feature-access.functions";
import {
  selectHomeRecentProject,
  type HomeProjectCandidate,
  type HomeRecentProject,
  type HomeVersionCandidate,
} from "@/lib/home-recent-project.shared";
import {
  orderHomeResumeItems,
  type HomeResumeItem,
  type HomeResumeResult,
  type HomeResumeType,
} from "@/lib/home-resume.shared";

const HOME_RECENT_VERSION_CANDIDATE_LIMIT = 24;
const HOME_RESUME_SOURCE_TIMEOUT_MS = 2_500;

type AuthenticatedSupabaseClient = SupabaseClient<Database>;
type WithCreativeRecency<T extends { Row: object; Insert: object; Update: object }> = T & {
  Row: T["Row"] & { creative_updated_at: string };
  Insert: T["Insert"] & { creative_updated_at?: string };
  Update: T["Update"] & { creative_updated_at?: string };
};
type HomeResumeDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      song_universes: WithCreativeRecency<Database["public"]["Tables"]["song_universes"]>;
      story_maps: WithCreativeRecency<Database["public"]["Tables"]["story_maps"]>;
      inspiration_walls: WithCreativeRecency<Database["public"]["Tables"]["inspiration_walls"]>;
    };
  };
};
type HomeResumeSupabaseClient = SupabaseClient<HomeResumeDatabase>;
type HomeFeatureCandidate = {
  id: string;
  title: string;
  creative_updated_at: string;
};

async function resolveRecentProject(
  supabase: AuthenticatedSupabaseClient,
  userId: string,
): Promise<HomeRecentProject | null> {
  const { data: versions, error: versionsError } = await supabase
    .from("saved_prompts")
    .select("id, project_id, version_number, version_label, created_at")
    .eq("user_id", userId)
    .not("project_id", "is", null)
    .not("version_number", "is", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HOME_RECENT_VERSION_CANDIDATE_LIMIT);

  if (versionsError) throw new Error(versionsError.message);
  const versionCandidates = (versions ?? []) as HomeVersionCandidate[];
  if (versionCandidates.length === 0) return null;

  const projectIds = [...new Set(versionCandidates.flatMap((version) => version.project_id ?? []))];
  if (projectIds.length === 0) return null;

  const { data: projects, error: projectsError } = await supabase
    .from("prompt_projects")
    .select("id, name")
    .eq("user_id", userId)
    .in("id", projectIds);

  if (projectsError) throw new Error(projectsError.message);
  return selectHomeRecentProject(versionCandidates, (projects ?? []) as HomeProjectCandidate[]);
}

async function canUseFeature(
  supabase: AuthenticatedSupabaseClient,
  featureKey: FeatureKey,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("current_user_can_use_feature", {
    _feature_key: featureKey,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

function toHomeResumeItem(
  type: Exclude<HomeResumeType, "project">,
  data: HomeFeatureCandidate | null,
): HomeResumeItem | null {
  if (!data?.id || !data.title || !data.creative_updated_at) return null;
  return {
    type,
    id: data.id,
    title: data.title,
    recency: data.creative_updated_at,
  };
}

async function resolveFeatureCandidate(
  supabase: AuthenticatedSupabaseClient,
  userId: string,
  type: Exclude<HomeResumeType, "project">,
  featureKey: FeatureKey,
  table: "song_universes" | "story_maps" | "inspiration_walls",
): Promise<HomeResumeItem | null> {
  if (!(await canUseFeature(supabase, featureKey))) return null;

  // PB-007 adds creative_updated_at before the checked-in generated Supabase
  // snapshot is refreshed. Keep the schema delta explicit and narrow here,
  // matching the existing strongly typed migration-drift boundary pattern.
  const homeSupabase = supabase as unknown as HomeResumeSupabaseClient;

  if (table === "song_universes") {
    const { data, error } = await homeSupabase
      .from("song_universes")
      .select("id, title, creative_updated_at")
      .eq("owner_id", userId)
      .neq("status", "archived")
      .not("creative_updated_at", "is", null)
      .order("creative_updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return toHomeResumeItem(type, data);
  }

  if (table === "story_maps") {
    const { data, error } = await homeSupabase
      .from("story_maps")
      .select("id, title, creative_updated_at")
      .eq("user_id", userId)
      .not("creative_updated_at", "is", null)
      .order("creative_updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return toHomeResumeItem(type, data);
  }

  const { data, error } = await homeSupabase
    .from("inspiration_walls")
    .select("id, title, creative_updated_at")
    .eq("owner_id", userId)
    .not("creative_updated_at", "is", null)
    .order("creative_updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return toHomeResumeItem(type, data);
}

function withSourceTimeout<T>(promise: Promise<T>, source: HomeResumeType): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Home Resume source timed out: ${source}`)),
      HOME_RESUME_SOURCE_TIMEOUT_MS,
    );
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export const getHomeRecentProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HomeRecentProject | null> =>
    resolveRecentProject(context.supabase, context.userId),
  );

export const getHomeResume = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HomeResumeResult> => {
    const { supabase } = context;
    const sources: Array<{ type: HomeResumeType; promise: Promise<HomeResumeItem | null> }> = [
      {
        type: "project",
        promise: resolveRecentProject(supabase, context.userId).then((project) =>
          project
            ? {
                type: "project" as const,
                id: project.projectId,
                title: project.projectName,
                recency: project.versionCreatedAt,
              }
            : null,
        ),
      },
      {
        type: "song_universe",
        promise: resolveFeatureCandidate(
          supabase,
          context.userId,
          "song_universe",
          "song_universe",
          "song_universes",
        ),
      },
      {
        type: "story_map",
        promise: resolveFeatureCandidate(
          supabase,
          context.userId,
          "story_map",
          "story_map",
          "story_maps",
        ),
      },
      {
        type: "inspiration_wall",
        promise: resolveFeatureCandidate(
          supabase,
          context.userId,
          "inspiration_wall",
          "inspiration_wall",
          "inspiration_walls",
        ),
      },
    ];

    const settled = await Promise.allSettled(
      sources.map(({ type, promise }) => withSourceTimeout(promise, type)),
    );
    const items: HomeResumeItem[] = [];
    const failedSources: HomeResumeType[] = [];

    settled.forEach((result, index) => {
      const source = sources[index];
      if (!source) return;
      if (result.status === "fulfilled") {
        if (result.value) items.push(result.value);
      } else {
        failedSources.push(source.type);
      }
    });

    return { items: orderHomeResumeItems(items), failedSources };
  });
