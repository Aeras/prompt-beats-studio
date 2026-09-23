import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import {
  songUniverseContextSnapshotSchema,
  songUniverseCreativeBibleSchema,
  songUniverseProjectStatusSchema,
  songUniverseStatusSchema,
  songUniverseTypeSchema,
  type SongUniverseCreativeBible,
  type SongUniverseProjectRecord,
  type SongUniverseRecord,
} from "@/lib/song-universe.shared";

const idSchema = z.string().uuid();

const createSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).nullable().optional().default(null),
  universeType: songUniverseTypeSchema.optional().default("other"),
  initialDirection: z.string().trim().max(4000).nullable().optional().default(null),
});

const updateSchema = z
  .object({
    universeId: idSchema,
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    universeType: songUniverseTypeSchema.optional(),
    status: songUniverseStatusSchema.optional(),
    creativeBible: songUniverseCreativeBibleSchema.optional(),
    initialDirection: z.string().trim().max(4000).nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "universeId"),
    "No changes supplied.",
  );

function mapUniverse(row: any): SongUniverseRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description ?? null,
    universeType: row.universe_type,
    status: row.status,
    creativeBible: songUniverseCreativeBibleSchema.parse(row.creative_bible ?? { items: [] }),
    initialDirection: row.initial_direction ?? null,
    coverObjectKey: row.cover_object_key ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMembership(row: any): SongUniverseProjectRecord {
  const project = Array.isArray(row.prompt_projects) ? row.prompt_projects[0] : row.prompt_projects;
  return {
    id: row.id,
    universeId: row.universe_id,
    projectId: row.project_id,
    projectName: project?.name ?? "Untitled Project",
    position: row.position,
    universeRole: row.universe_role ?? null,
    projectStatus: row.project_status,
    intentionalOutlier: row.intentional_outlier === true,
    inheritedTraits: Array.isArray(row.inherited_traits) ? row.inherited_traits : [],
    contextSnapshot: (() => {
      const parsed = songUniverseContextSnapshotSchema.safeParse(row.context_snapshot);
      return parsed.success ? parsed.data : null;
    })(),
    contextSnapshotAt: row.context_snapshot_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireOwnedUniverse(supabase: any, universeId: string, userId: string) {
  const { data, error } = await supabase
    .from("song_universes")
    .select("*")
    .eq("id", universeId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Song Universe not found.");
  return data;
}

async function requireOwnedProject(supabase: any, projectId: string, userId: string) {
  const { data, error } = await supabase
    .from("prompt_projects")
    .select("id,name")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project not found.");
  return data;
}

export const listSongUniverses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    const { data, error } = await (context.supabase as any)
      .from("song_universes")
      .select("*")
      .eq("owner_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { universes: (data ?? []).map(mapUniverse) };
  });

export const getSongUniverse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ universeId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    const supabase = context.supabase as any;
    const universeRow = await requireOwnedUniverse(supabase, data.universeId, context.userId);
    const { data: memberships, error } = await supabase
      .from("song_universe_projects")
      .select("*, prompt_projects!inner(id,name)")
      .eq("universe_id", data.universeId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      universe: mapUniverse(universeRow),
      projects: (memberships ?? []).map(mapMembership),
    };
  });

export const createSongUniverse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    const { data: row, error } = await (context.supabase as any)
      .from("song_universes")
      .insert({
        owner_id: context.userId,
        title: data.title,
        description: data.description,
        universe_type: data.universeType,
        initial_direction: data.initialDirection,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { universe: mapUniverse(row) };
  });

export const updateSongUniverse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    const supabase = context.supabase as any;
    await requireOwnedUniverse(supabase, data.universeId, context.userId);
    const changes: Record<string, unknown> = {};
    if (data.title !== undefined) changes["title"] = data.title;
    if (data.description !== undefined) changes["description"] = data.description;
    if (data.universeType !== undefined) changes["universe_type"] = data.universeType;
    if (data.status !== undefined) changes["status"] = data.status;
    if (data.creativeBible !== undefined) changes["creative_bible"] = data.creativeBible;
    if (data.initialDirection !== undefined) changes["initial_direction"] = data.initialDirection;
    const { data: row, error } = await supabase
      .from("song_universes")
      .update(changes)
      .eq("id", data.universeId)
      .eq("owner_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { universe: mapUniverse(row) };
  });

export const deleteSongUniverse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ universeId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    const supabase = context.supabase as any;
    await requireOwnedUniverse(supabase, data.universeId, context.userId);
    const { error } = await supabase
      .from("song_universes")
      .delete()
      .eq("id", data.universeId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSongUniverseProjectOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    const supabase = context.supabase as any;
    const { data: linked, error: linkedError } = await supabase
      .from("song_universe_projects")
      .select("project_id, song_universes!inner(owner_id)")
      .eq("song_universes.owner_id", context.userId);
    if (linkedError) throw new Error(linkedError.message);
    const linkedIds = new Set((linked ?? []).map((row: any) => row.project_id));
    const { data: projects, error } = await supabase
      .from("prompt_projects")
      .select("id,name,updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      projects: (projects ?? []).map((project: any) => ({
        id: project.id,
        name: project.name,
        updatedAt: project.updated_at,
        linked: linkedIds.has(project.id),
      })),
    };
  });

export const addProjectToSongUniverse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        universeId: idSchema,
        projectId: idSchema,
        universeRole: z.string().trim().max(200).nullable().optional().default(null),
        intentionalOutlier: z.boolean().optional().default(false),
        inheritedTraits: z.array(z.string().max(120)).max(200).optional().default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    const supabase = context.supabase as any;
    const universeRow = await requireOwnedUniverse(supabase, data.universeId, context.userId);
    await requireOwnedProject(supabase, data.projectId, context.userId);
    const creativeBible: SongUniverseCreativeBible = songUniverseCreativeBibleSchema.parse(
      universeRow.creative_bible ?? { items: [] },
    );
    const selected = new Set(data.inheritedTraits);
    const inheritedItems = creativeBible.items.filter(
      (item) =>
        item.enabled && (selected.size === 0 ? item.strength === "core" : selected.has(item.id)),
    );
    const { count, error: countError } = await supabase
      .from("song_universe_projects")
      .select("id", { count: "exact", head: true })
      .eq("universe_id", data.universeId);
    if (countError) throw new Error(countError.message);
    const snapshot = {
      universeId: data.universeId,
      universeTitle: universeRow.title,
      capturedAt: new Date().toISOString(),
      selectedItemIds: inheritedItems.map((item) => item.id),
      inheritedItems,
    };
    const { data: row, error } = await supabase
      .from("song_universe_projects")
      .insert({
        universe_id: data.universeId,
        project_id: data.projectId,
        position: count ?? 0,
        universe_role: data.universeRole,
        intentional_outlier: data.intentionalOutlier,
        inherited_traits: inheritedItems.map((item) => item.id),
        context_snapshot: snapshot,
        context_snapshot_at: snapshot.capturedAt,
      })
      .select("*, prompt_projects!inner(id,name)")
      .single();
    if (error?.code === "23505")
      throw new Error("This Project already belongs to a Song Universe.");
    if (error) throw new Error(error.message);
    return { project: mapMembership(row) };
  });

export const removeProjectFromSongUniverse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ universeId: idSchema, membershipId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    const supabase = context.supabase as any;
    await requireOwnedUniverse(supabase, data.universeId, context.userId);
    const { error } = await supabase
      .from("song_universe_projects")
      .delete()
      .eq("id", data.membershipId)
      .eq("universe_id", data.universeId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateSongUniverseProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        universeId: idSchema,
        membershipId: idSchema,
        universeRole: z.string().trim().max(200).nullable().optional(),
        projectStatus: songUniverseProjectStatusSchema.optional(),
        intentionalOutlier: z.boolean().optional(),
      })
      .refine(
        (value) =>
          value.universeRole !== undefined ||
          value.projectStatus !== undefined ||
          value.intentionalOutlier !== undefined,
        "No changes supplied.",
      )
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    const supabase = context.supabase as any;
    await requireOwnedUniverse(supabase, data.universeId, context.userId);
    const changes: Record<string, unknown> = {};
    if (data.universeRole !== undefined) changes["universe_role"] = data.universeRole;
    if (data.projectStatus !== undefined) changes["project_status"] = data.projectStatus;
    if (data.intentionalOutlier !== undefined)
      changes["intentional_outlier"] = data.intentionalOutlier;
    const { data: row, error } = await supabase
      .from("song_universe_projects")
      .update(changes)
      .eq("id", data.membershipId)
      .eq("universe_id", data.universeId)
      .select("*, prompt_projects!inner(id,name)")
      .single();
    if (error) throw new Error(error.message);
    return { project: mapMembership(row) };
  });

export const reorderSongUniverseProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ universeId: idSchema, membershipIds: z.array(idSchema).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    await requireOwnedUniverse(context.supabase as any, data.universeId, context.userId);
    const { error } = await (context.supabase as any).rpc("reorder_song_universe_projects", {
      _universe_id: data.universeId,
      _membership_ids: data.membershipIds,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
