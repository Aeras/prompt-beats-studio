import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  parseStartScreenPreference, parseLastWorkEnvelope, START_SCREEN_FEATURES,
  type Pb012ResolvedDestination, type LastWorkDestination, type StartScreenPreference,
} from "@/lib/pb012-starting-screen.shared";
import type { FeatureKey } from "@/lib/feature-access.functions";

export type DestinationValidation =
  | { status: "valid"; destination: Pb012ResolvedDestination }
  | { status: "invalid" }
  | { status: "feature_unavailable" }
  | { status: "temporary_failure" };

const HOME: DestinationValidation = { status: "valid", destination: { type: "home" } };

type ResolverClient = {
  auth: { getUser: (token: string) => Promise<{ data: { user: { id: string; user_metadata?: Record<string, unknown> } | null }; error: unknown }> };
  rpc: (name: string, args: { _feature_key: FeatureKey }) => Promise<{ data: boolean | null; error: unknown }>;
  from: (table: string) => any;
};

export async function validateDefaultDestination(
  supabase: ResolverClient, userId: string, preference: StartScreenPreference, lastWork: unknown,
): Promise<DestinationValidation> {
  let target: Pb012ResolvedDestination;
  if (preference === "last_work") {
    const parsed = parseLastWorkEnvelope(lastWork);
    if (!parsed) return { status: "invalid" };
    const destination: LastWorkDestination = parsed.destination;
    if (destination.type === "project") target = { type: "project", id: destination.id };
    else if (destination.type === "song_universe") target = { type: "song_universe_exact", id: destination.id };
    else if (destination.type === "story_map") target = { type: "story_map_exact", id: destination.id };
    else if (destination.type === "inspiration_wall") target = { type: "inspiration_wall_exact", id: destination.id };
    else target = { type: destination.type };
  } else target = { type: preference };

  const feature = ({
    ...START_SCREEN_FEATURES,
    song_universe_exact: "song_universe",
    story_map_exact: "story_map",
    inspiration_wall_exact: "inspiration_wall",
  } as Partial<Record<Pb012ResolvedDestination["type"], FeatureKey>>)[target.type];
  if (feature) {
    const { data, error } = await supabase.rpc("current_user_can_use_feature", { _feature_key: feature });
    if (error) return { status: "temporary_failure" };
    if (data !== true) return { status: "feature_unavailable" };
  }

  const object = target.type === "project" ? { table: "prompt_projects", owner: "user_id" }
    : target.type === "song_universe_exact" ? { table: "song_universes", owner: "owner_id" }
    : target.type === "story_map_exact" ? { table: "story_maps", owner: "user_id" }
    : target.type === "inspiration_wall_exact" ? { table: "inspiration_walls", owner: "owner_id" }
    : null;
  if (object && "id" in target) {
    const { data, error } = await supabase.from(object.table).select("id").eq("id", target.id).eq(object.owner, userId).maybeSingle();
    if (error) return { status: "temporary_failure" };
    if (!data) return { status: "invalid" };
    if (target.type === "song_universe_exact") {
      const { data: universe, error: archivedError } = await supabase.from("song_universes").select("status").eq("id", target.id).eq("owner_id", userId).maybeSingle();
      if (archivedError) return { status: "temporary_failure" };
      if (!universe || universe.status === "archived") return { status: "invalid" };
    }
  }
  return { status: "valid", destination: target };
}

export const resolveDefaultEntry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DestinationValidation> => {
    try {
      const client = context.supabase as unknown as ResolverClient;
      const bearer = getRequest().headers.get("authorization");
      const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : "";
      if (!token) return { status: "temporary_failure" };
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user || data.user.id !== context.userId) return { status: "temporary_failure" };
      const metadata = data.user.user_metadata ?? {};
      const preference = parseStartScreenPreference(metadata.default_start_screen);
      const result = await validateDefaultDestination(client, context.userId, preference, metadata.last_resumable_destination);
      return result.status === "valid" ? result : HOME;
    } catch {
      return HOME;
    }
  });
