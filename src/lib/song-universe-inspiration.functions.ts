import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";

const idSchema = z.string().uuid();

async function requireOwnedUniverse(supabase: any, universeId: string, userId: string) {
  const { data, error } = await supabase
    .from("song_universes")
    .select("id")
    .eq("id", universeId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Song Universe not found.");
}

export const listSongUniverseInspirationWalls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ universeId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    await requireFeatureAccess(context.supabase, "inspiration_wall");
    const supabase = context.supabase as any;
    await requireOwnedUniverse(supabase, data.universeId, context.userId);
    const { data: walls, error } = await supabase
      .from("inspiration_walls")
      .select("id,title,description,universe_id,connected_project_id,updated_at")
      .eq("owner_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      walls: (walls ?? []).map((wall: any) => ({
        id: wall.id as string,
        title: wall.title as string,
        description: (wall.description as string | null | undefined) ?? null,
        universeId: (wall.universe_id as string | null | undefined) ?? null,
        connectedProjectId: (wall.connected_project_id as string | null | undefined) ?? null,
        updatedAt: wall.updated_at as string,
      })),
    };
  });

export const setSongUniverseInspirationWall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ universeId: idSchema, wallId: idSchema, linked: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    await requireFeatureAccess(context.supabase, "inspiration_wall");
    const supabase = context.supabase as any;
    await requireOwnedUniverse(supabase, data.universeId, context.userId);
    const { data: wall, error: wallError } = await supabase
      .from("inspiration_walls")
      .select("id,universe_id")
      .eq("id", data.wallId)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (wallError) throw new Error(wallError.message);
    if (!wall) throw new Error("Inspiration Wall not found.");
    if (data.linked && wall.universe_id && wall.universe_id !== data.universeId) {
      throw new Error("This Inspiration Wall is already linked to another Song Universe.");
    }
    const { error } = await supabase
      .from("inspiration_walls")
      .update({ universe_id: data.linked ? data.universeId : null })
      .eq("id", data.wallId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
