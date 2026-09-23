import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import {
  inspirationWallArtisticLayoutSchema,
  inspirationWallCardTypeSchema,
  inspirationWallCreativeDirectionSchema,
  inspirationWallStructuredLayoutSchema,
  inspirationWallThemeSchema,
  type InspirationWallCardRecord,
  type InspirationWallRecord,
  type InspirationWallTrackLinkRecord,
} from "@/lib/inspiration-wall.shared";

const wallIdSchema = z.string().uuid();
const nullableProjectIdSchema = z.string().uuid().nullable();

const createWallSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional().default(null),
  selectedTheme: inspirationWallThemeSchema.optional().default("neon_studio"),
  connectedProjectId: nullableProjectIdSchema.optional().default(null),
});

const updateWallSchema = z
  .object({
    wallId: wallIdSchema,
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    selectedTheme: inspirationWallThemeSchema.optional(),
    connectedProjectId: nullableProjectIdSchema.optional(),
    creativeDirection: inspirationWallCreativeDirectionSchema.nullable().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.selectedTheme !== undefined ||
      value.connectedProjectId !== undefined ||
      value.creativeDirection !== undefined,
    "No changes supplied.",
  );

const createCardSchema = z.object({
  wallId: wallIdSchema,
  type: inspirationWallCardTypeSchema,
  title: z.string().trim().max(200).nullable().optional().default(null),
  body: z.string().max(10000).nullable().optional().default(null),
  colorValue: z.string().trim().max(64).nullable().optional().default(null),
  imageObjectKey: z.string().trim().max(1024).nullable().optional().default(null),
  isPinned: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).optional().default(0),
  artisticLayout: inspirationWallArtisticLayoutSchema.optional().default({}),
  structuredLayout: inspirationWallStructuredLayoutSchema.optional().default({}),
});

const updateCardSchema = z
  .object({
    cardId: z.string().uuid(),
    type: inspirationWallCardTypeSchema.optional(),
    title: z.string().trim().max(200).nullable().optional(),
    body: z.string().max(10000).nullable().optional(),
    colorValue: z.string().trim().max(64).nullable().optional(),
    imageObjectKey: z.string().trim().max(1024).nullable().optional(),
    isPinned: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
    artisticLayout: inspirationWallArtisticLayoutSchema.optional(),
    structuredLayout: inspirationWallStructuredLayoutSchema.optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "cardId"), "No changes supplied.");

async function requireWallAccess(supabase: any, wallId: string, userId: string) {
  const { data, error } = await supabase
    .from("inspiration_walls")
    .select("id")
    .eq("id", wallId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Inspiration Wall not found.");
}

async function requireOwnedProject(supabase: any, projectId: string | null, userId: string) {
  if (!projectId) return;
  const { data, error } = await supabase
    .from("prompt_projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project not found.");
}

function assertOwnedImageKey(imageObjectKey: string | null | undefined, userId: string) {
  if (!imageObjectKey) return;
  if (!imageObjectKey.startsWith(`${userId}/`)) {
    throw new Error("Invalid Inspiration Wall image key.");
  }
}

export const listInspirationWalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFeatureAccess(context.supabase, "inspiration_wall");
    const supabase = context.supabase as any;
    const { data, error } = await supabase
      .from("inspiration_walls")
      .select(
        "id, owner_id, title, description, selected_theme, connected_project_id, creative_direction, created_at, updated_at",
      )
      .eq("owner_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { walls: (data ?? []) as InspirationWallRecord[] };
  });

export const getInspirationWall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ wallId: wallIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "inspiration_wall");
    const supabase = context.supabase as any;
    await requireWallAccess(supabase, data.wallId, context.userId);

    const [wallResult, cardsResult, linksResult] = await Promise.all([
      supabase
        .from("inspiration_walls")
        .select(
          "id, owner_id, title, description, selected_theme, connected_project_id, creative_direction, created_at, updated_at",
        )
        .eq("id", data.wallId)
        .eq("owner_id", context.userId)
        .single(),
      supabase
        .from("inspiration_wall_cards")
        .select(
          "id, wall_id, type, title, body, color_value, image_object_key, is_pinned, sort_order, artistic_layout, structured_layout, created_at, updated_at",
        )
        .eq("wall_id", data.wallId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("inspiration_wall_track_links")
        .select("id, wall_id, owner_id, track_id, is_primary, created_at")
        .eq("wall_id", data.wallId)
        .eq("owner_id", context.userId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true }),
    ]);

    if (wallResult.error) throw new Error(wallResult.error.message);
    if (cardsResult.error) throw new Error(cardsResult.error.message);
    if (linksResult.error) throw new Error(linksResult.error.message);

    return {
      wall: wallResult.data as InspirationWallRecord,
      cards: (cardsResult.data ?? []) as InspirationWallCardRecord[],
      trackLinks: (linksResult.data ?? []) as InspirationWallTrackLinkRecord[],
    };
  });

export const createInspirationWall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createWallSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "inspiration_wall");
    const supabase = context.supabase as any;
    await requireOwnedProject(supabase, data.connectedProjectId, context.userId);

    const { data: wall, error } = await supabase
      .from("inspiration_walls")
      .insert({
        owner_id: context.userId,
        title: data.title,
        description: data.description,
        selected_theme: data.selectedTheme,
        connected_project_id: data.connectedProjectId,
      })
      .select(
        "id, owner_id, title, description, selected_theme, connected_project_id, creative_direction, created_at, updated_at",
      )
      .single();
    if (error) throw new Error(error.message);
    return { wall: wall as InspirationWallRecord };
  });

export const updateInspirationWall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateWallSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "inspiration_wall");
    const supabase = context.supabase as any;
    await requireWallAccess(supabase, data.wallId, context.userId);
    if (data.connectedProjectId !== undefined) {
      await requireOwnedProject(supabase, data.connectedProjectId, context.userId);
    }

    const changes: Record<string, unknown> = {};
    if (data.title !== undefined) changes["title"] = data.title;
    if (data.description !== undefined) changes["description"] = data.description;
    if (data.selectedTheme !== undefined) changes["selected_theme"] = data.selectedTheme;
    if (data.connectedProjectId !== undefined)
      changes["connected_project_id"] = data.connectedProjectId;
    if (data.creativeDirection !== undefined)
      changes["creative_direction"] = data.creativeDirection;

    const { data: wall, error } = await supabase
      .from("inspiration_walls")
      .update(changes)
      .eq("id", data.wallId)
      .eq("owner_id", context.userId)
      .select(
        "id, owner_id, title, description, selected_theme, connected_project_id, creative_direction, created_at, updated_at",
      )
      .single();
    if (error) throw new Error(error.message);
    return { wall: wall as InspirationWallRecord };
  });

export const deleteInspirationWall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ wallId: wallIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "inspiration_wall");
    const supabase = context.supabase as any;
    await requireWallAccess(supabase, data.wallId, context.userId);
    const { error } = await supabase
      .from("inspiration_walls")
      .delete()
      .eq("id", data.wallId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createInspirationWallCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createCardSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "inspiration_wall");
    const supabase = context.supabase as any;
    await requireWallAccess(supabase, data.wallId, context.userId);
    assertOwnedImageKey(data.imageObjectKey, context.userId);

    const { data: card, error } = await supabase
      .from("inspiration_wall_cards")
      .insert({
        wall_id: data.wallId,
        type: data.type,
        title: data.title,
        body: data.body,
        color_value: data.colorValue,
        image_object_key: data.imageObjectKey,
        is_pinned: data.isPinned,
        sort_order: data.sortOrder,
        artistic_layout: data.artisticLayout,
        structured_layout: data.structuredLayout,
      })
      .select(
        "id, wall_id, type, title, body, color_value, image_object_key, is_pinned, sort_order, artistic_layout, structured_layout, created_at, updated_at",
      )
      .single();
    if (error) throw new Error(error.message);
    return { card: card as InspirationWallCardRecord };
  });

export const updateInspirationWallCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateCardSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "inspiration_wall");
    const supabase = context.supabase as any;
    assertOwnedImageKey(data.imageObjectKey, context.userId);

    const { data: existing, error: existingError } = await supabase
      .from("inspiration_wall_cards")
      .select("id, wall_id")
      .eq("id", data.cardId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing) throw new Error("Inspiration Wall card not found.");
    await requireWallAccess(supabase, existing.wall_id, context.userId);

    const changes: Record<string, unknown> = {};
    if (data.type !== undefined) changes["type"] = data.type;
    if (data.title !== undefined) changes["title"] = data.title;
    if (data.body !== undefined) changes["body"] = data.body;
    if (data.colorValue !== undefined) changes["color_value"] = data.colorValue;
    if (data.imageObjectKey !== undefined) changes["image_object_key"] = data.imageObjectKey;
    if (data.isPinned !== undefined) changes["is_pinned"] = data.isPinned;
    if (data.sortOrder !== undefined) changes["sort_order"] = data.sortOrder;
    if (data.artisticLayout !== undefined) changes["artistic_layout"] = data.artisticLayout;
    if (data.structuredLayout !== undefined) changes["structured_layout"] = data.structuredLayout;

    const { data: card, error } = await supabase
      .from("inspiration_wall_cards")
      .update(changes)
      .eq("id", data.cardId)
      .select(
        "id, wall_id, type, title, body, color_value, image_object_key, is_pinned, sort_order, artistic_layout, structured_layout, created_at, updated_at",
      )
      .single();
    if (error) throw new Error(error.message);
    return { card: card as InspirationWallCardRecord };
  });

export const deleteInspirationWallCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ cardId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "inspiration_wall");
    const supabase = context.supabase as any;
    const { data: existing, error: existingError } = await supabase
      .from("inspiration_wall_cards")
      .select("id, wall_id")
      .eq("id", data.cardId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing) throw new Error("Inspiration Wall card not found.");
    await requireWallAccess(supabase, existing.wall_id, context.userId);

    const { error } = await supabase.from("inspiration_wall_cards").delete().eq("id", data.cardId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const linkInspirationWallTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ wallId: wallIdSchema, trackId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "inspiration_wall");
    const supabase = context.supabase as any;
    await requireWallAccess(supabase, data.wallId, context.userId);

    const { data: track, error: trackError } = await supabase
      .from("tracks")
      .select("id")
      .eq("id", data.trackId)
      .eq("user_id", context.userId)
      .eq("source_type", "upload")
      .eq("moderation_status", "active")
      .maybeSingle();
    if (trackError) throw new Error(trackError.message);
    if (!track) throw new Error("Eligible track not found.");

    const { data: link, error } = await supabase
      .from("inspiration_wall_track_links")
      .upsert(
        {
          wall_id: data.wallId,
          owner_id: context.userId,
          track_id: data.trackId,
        },
        { onConflict: "wall_id,track_id" },
      )
      .select("id, wall_id, owner_id, track_id, is_primary, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { link: link as InspirationWallTrackLinkRecord };
  });

export const unlinkInspirationWallTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ wallId: wallIdSchema, trackId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "inspiration_wall");
    const supabase = context.supabase as any;
    await requireWallAccess(supabase, data.wallId, context.userId);
    const { error } = await supabase
      .from("inspiration_wall_track_links")
      .delete()
      .eq("wall_id", data.wallId)
      .eq("track_id", data.trackId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
