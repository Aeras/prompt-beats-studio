import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import {
  storyMapBeatSchema,
  storyMapProgressionTypeSchema,
  type StoryMapBeat,
  type StoryMapRecord,
} from "@/lib/story-map.shared";

const idSchema = z.string().uuid();
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const createSchema = z.object({
  title: z.string().trim().min(1).max(160),
  concept: z.string().trim().min(3).max(3000),
  theme: optionalText(500).default(null),
  emotionalDirection: optionalText(700).default(null),
  narrator: optionalText(700).default(null),
  pointOfView: optionalText(400).default(null),
  desiredEnding: optionalText(700).default(null),
  projectId: z.string().uuid().nullable().optional().default(null),
});

const updateSchema = z
  .object({
    storyMapId: idSchema,
    title: z.string().trim().min(1).max(160).optional(),
    concept: z.string().trim().min(3).max(3000).optional(),
    theme: optionalText(500),
    emotionalDirection: optionalText(700),
    narrator: optionalText(700),
    pointOfView: optionalText(400),
    desiredEnding: optionalText(700),
    progressionType: storyMapProgressionTypeSchema.nullable().optional(),
    summary: optionalText(1500),
    startingState: optionalText(700),
    centralChange: optionalText(700),
    turningPoint: optionalText(700),
    resolution: optionalText(700),
    projectId: z.string().uuid().nullable().optional(),
    sourceProjectVersionId: z.string().uuid().nullable().optional(),
    sourceLyricsUpdatedAt: z.string().datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "storyMapId"), "No changes supplied.");

const beatInputSchema = storyMapBeatSchema.omit({ id: true }).extend({
  storyMapId: idSchema,
});

const beatUpdateSchema = storyMapBeatSchema.partial().omit({ id: true }).extend({
  beatId: idSchema,
});

const reorderSchema = z.object({
  storyMapId: idSchema,
  beatIds: z.array(idSchema).min(1).max(10),
});

type StoryMapRow = Record<string, any>;
type BeatRow = Record<string, any>;

function mapBeat(row: BeatRow): StoryMapBeat {
  return {
    id: row.id,
    position: row.position,
    title: row.title,
    whatHappens: row.what_happens ?? "",
    emotion: row.emotion ?? "",
    purpose: row.purpose ?? "",
    narratorState: row.narrator_state ?? "",
    keyImage: row.key_image ?? "",
    reveal: row.reveal ?? "",
    changeAfterBeat: row.change_after_beat ?? "",
    lyricAnchor: row.lyric_anchor ?? "",
    suggestedSections: Array.isArray(row.suggested_sections) ? row.suggested_sections : [],
    isKeyBeat: row.is_key_beat === true,
  };
}

function mapStoryMap(row: StoryMapRow, beats: BeatRow[] = []): StoryMapRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    concept: row.concept,
    theme: row.theme ?? null,
    emotionalDirection: row.emotional_direction ?? null,
    narrator: row.narrator ?? null,
    pointOfView: row.point_of_view ?? null,
    desiredEnding: row.desired_ending ?? null,
    progressionType: row.progression_type ?? null,
    summary: row.summary ?? null,
    startingState: row.starting_state ?? null,
    centralChange: row.central_change ?? null,
    turningPoint: row.turning_point ?? null,
    resolution: row.resolution ?? null,
    projectId: row.project_id ?? null,
    sourceProjectVersionId: row.source_project_version_id ?? null,
    sourceLyricsUpdatedAt: row.source_lyrics_updated_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    beats: beats.map(mapBeat).sort((a, b) => a.position - b.position),
  };
}

async function requireOwnedStoryMap(supabase: any, storyMapId: string, userId: string) {
  const { data, error } = await supabase
    .from("story_maps")
    .select("*")
    .eq("id", storyMapId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Story Map not found.");
  return data as StoryMapRow;
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

async function requireOwnedBeat(supabase: any, beatId: string, userId: string) {
  const { data, error } = await supabase
    .from("story_map_beats")
    .select("*, story_maps!inner(user_id)")
    .eq("id", beatId)
    .eq("story_maps.user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Story Beat not found.");
  return data as BeatRow;
}

export const listStoryMaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    const { data, error } = await (context.supabase as any)
      .from("story_maps")
      .select("*")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { storyMaps: (data ?? []).map((row: StoryMapRow) => mapStoryMap(row)) };
  });

export const getStoryMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ storyMapId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    const supabase = context.supabase as any;
    const row = await requireOwnedStoryMap(supabase, data.storyMapId, context.userId);
    const { data: beats, error } = await supabase
      .from("story_map_beats")
      .select("*")
      .eq("story_map_id", data.storyMapId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return { storyMap: mapStoryMap(row, beats ?? []) };
  });

export const createStoryMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    const supabase = context.supabase as any;
    await requireOwnedProject(supabase, data.projectId, context.userId);
    const { data: row, error } = await supabase
      .from("story_maps")
      .insert({
        user_id: context.userId,
        title: data.title,
        concept: data.concept,
        theme: data.theme,
        emotional_direction: data.emotionalDirection,
        narrator: data.narrator,
        point_of_view: data.pointOfView,
        desired_ending: data.desiredEnding,
        project_id: data.projectId,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505" && data.projectId) {
        throw new Error("This Project already has a Story Map.");
      }
      throw new Error(error.message);
    }
    return { storyMap: mapStoryMap(row) };
  });

export const updateStoryMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    const supabase = context.supabase as any;
    await requireOwnedStoryMap(supabase, data.storyMapId, context.userId);
    if (data.projectId !== undefined) await requireOwnedProject(supabase, data.projectId, context.userId);
    const changes: Record<string, unknown> = {};
    const pairs: Array<[keyof typeof data, string]> = [
      ["title", "title"], ["concept", "concept"], ["theme", "theme"],
      ["emotionalDirection", "emotional_direction"], ["narrator", "narrator"],
      ["pointOfView", "point_of_view"], ["desiredEnding", "desired_ending"],
      ["progressionType", "progression_type"], ["summary", "summary"],
      ["startingState", "starting_state"], ["centralChange", "central_change"],
      ["turningPoint", "turning_point"], ["resolution", "resolution"],
      ["projectId", "project_id"], ["sourceProjectVersionId", "source_project_version_id"],
      ["sourceLyricsUpdatedAt", "source_lyrics_updated_at"],
    ];
    for (const [inputKey, dbKey] of pairs) {
      if (data[inputKey] !== undefined) changes[dbKey] = data[inputKey];
    }
    const { data: row, error } = await supabase
      .from("story_maps")
      .update(changes)
      .eq("id", data.storyMapId)
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505" && data.projectId) throw new Error("This Project already has a Story Map.");
      throw new Error(error.message);
    }
    const { data: beats, error: beatError } = await supabase
      .from("story_map_beats").select("*").eq("story_map_id", data.storyMapId).order("position");
    if (beatError) throw new Error(beatError.message);
    return { storyMap: mapStoryMap(row, beats ?? []) };
  });

export const deleteStoryMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ storyMapId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    const supabase = context.supabase as any;
    await requireOwnedStoryMap(supabase, data.storyMapId, context.userId);
    const { error } = await supabase.from("story_maps").delete().eq("id", data.storyMapId).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createStoryBeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => beatInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    const supabase = context.supabase as any;
    await requireOwnedStoryMap(supabase, data.storyMapId, context.userId);
    const { storyMapId, ...beat } = data;
    const { data: row, error } = await supabase.from("story_map_beats").insert({
      story_map_id: storyMapId,
      position: beat.position,
      title: beat.title,
      what_happens: beat.whatHappens,
      emotion: beat.emotion,
      purpose: beat.purpose,
      narrator_state: beat.narratorState,
      key_image: beat.keyImage,
      reveal: beat.reveal,
      change_after_beat: beat.changeAfterBeat,
      lyric_anchor: beat.lyricAnchor,
      suggested_sections: beat.suggestedSections,
      is_key_beat: beat.isKeyBeat,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return { beat: mapBeat(row) };
  });

export const updateStoryBeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => beatUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    const supabase = context.supabase as any;
    await requireOwnedBeat(supabase, data.beatId, context.userId);
    const changes: Record<string, unknown> = {};
    const keyMap: Record<string, string> = {
      position: "position", title: "title", whatHappens: "what_happens", emotion: "emotion",
      purpose: "purpose", narratorState: "narrator_state", keyImage: "key_image", reveal: "reveal",
      changeAfterBeat: "change_after_beat", lyricAnchor: "lyric_anchor",
      suggestedSections: "suggested_sections", isKeyBeat: "is_key_beat",
    };
    for (const [key, dbKey] of Object.entries(keyMap)) {
      if ((data as any)[key] !== undefined) changes[dbKey] = (data as any)[key];
    }
    const { data: row, error } = await supabase.from("story_map_beats").update(changes).eq("id", data.beatId).select("*").single();
    if (error) throw new Error(error.message);
    return { beat: mapBeat(row) };
  });

export const deleteStoryBeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ beatId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    const supabase = context.supabase as any;
    await requireOwnedBeat(supabase, data.beatId, context.userId);
    const { error } = await supabase.from("story_map_beats").delete().eq("id", data.beatId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderStoryBeats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reorderSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    const supabase = context.supabase as any;
    await requireOwnedStoryMap(supabase, data.storyMapId, context.userId);
    const { data: rows, error } = await supabase.from("story_map_beats").select("id").eq("story_map_id", data.storyMapId);
    if (error) throw new Error(error.message);
    const actualIds = new Set((rows ?? []).map((row: { id: string }) => row.id));
    if (actualIds.size !== data.beatIds.length || data.beatIds.some((id) => !actualIds.has(id))) {
      throw new Error("Invalid Story Beat order.");
    }
    // Temporary negative positions avoid the unique (story_map_id, position) constraint while reordering.
    for (let index = 0; index < data.beatIds.length; index += 1) {
      const { error: tempError } = await supabase.from("story_map_beats").update({ position: -(index + 1) }).eq("id", data.beatIds[index]);
      if (tempError) throw new Error(tempError.message);
    }
    for (let index = 0; index < data.beatIds.length; index += 1) {
      const { error: finalError } = await supabase.from("story_map_beats").update({ position: index }).eq("id", data.beatIds[index]);
      if (finalError) throw new Error(finalError.message);
    }
    return { ok: true };
  });
