import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import {
  auxiliaryRequestKeySchema,
  executeDurableAuxiliaryAiRequest,
} from "@/lib/ai-auxiliary-idempotency.server";
import { getEffectiveModelAccess, modelCaller } from "@/lib/ai-provider.server";
import { recordAiUsage, type AiOperation } from "@/lib/ai-usage.server";
import {
  songUniverseAnalysisSchema,
  songUniverseCreativeBibleSchema,
  type SongUniverseAnalysis,
  type SongUniverseCreativeBible,
} from "@/lib/song-universe.shared";

const idSchema = z.string().uuid();
const optionalModelSchema = z.string().trim().max(240).nullable().optional();

const CREATIVE_BIBLE_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          section: {
            type: "STRING",
            enum: [
              "core_concept",
              "emotional_palette",
              "lyrical_themes",
              "recurring_motifs",
              "musical_identity",
              "production_identity",
              "vocal_identity",
              "language_writing_identity",
              "structural_tendencies",
              "things_to_avoid",
              "allowed_deviations",
            ],
          },
          content: { type: "STRING" },
          strength: { type: "STRING", enum: ["core", "flexible", "experimental"] },
          enabled: { type: "BOOLEAN" },
          sortOrder: { type: "INTEGER" },
        },
        required: ["id", "section", "content", "strength", "enabled", "sortOrder"],
      },
    },
  },
  required: ["items"],
};

const CONTINUITY_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    strongContinuity: { type: "ARRAY", items: { type: "STRING" } },
    possibleRepetition: { type: "ARRAY", items: { type: "STRING" } },
    underusedDirections: { type: "ARRAY", items: { type: "STRING" } },
    diversityNotes: { type: "ARRAY", items: { type: "STRING" } },
    motifUsage: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          motif: { type: "STRING" },
          usage: { type: "STRING", enum: ["heavy", "moderate", "light", "unused"] },
          note: { type: "STRING" },
        },
        required: ["motif", "usage", "note"],
      },
    },
    intentionalOutliers: { type: "ARRAY", items: { type: "STRING" } },
    opportunities: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: [
    "summary",
    "strongContinuity",
    "possibleRepetition",
    "underusedDirections",
    "diversityNotes",
    "motifUsage",
    "intentionalOutliers",
    "opportunities",
  ],
};

const FIT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    strongMatches: { type: "ARRAY", items: { type: "STRING" } },
    differences: { type: "ARRAY", items: { type: "STRING" } },
    interpretation: { type: "STRING" },
  },
  required: ["strongMatches", "differences", "interpretation"],
};

const creativeBibleResultSchema = z.object({ items: songUniverseCreativeBibleSchema.shape.items });
const projectFitSchema = z.object({
  strongMatches: z.array(z.string().trim().max(1000)).max(20).default([]),
  differences: z.array(z.string().trim().max(1000)).max(20).default([]),
  interpretation: z.string().trim().max(3000).default(""),
});
type SongUniverseProjectFit = z.infer<typeof projectFitSchema>;

const CREATIVE_BIBLE_SYSTEM = `You are PromptBeats Song Universe, a multi-song creative continuity planner.
Create or refine a concise structured Creative Bible for an album, EP, song series, or creative era.
Core principle: shared identity, not identical songs.
Do not force every song to share the same BPM, instruments, structure, imagery, emotional arc, hook type, or story.
Use Core only for genuine DNA, Flexible for recurring preferences, and Experimental for optional contrast.
Include useful Things to Avoid and Allowed Deviations when supported by the user's direction.
Do not write songs or lyrics. Return only schema-compliant JSON.`;

const CONTINUITY_SYSTEM = `You are PromptBeats Song Universe Continuity Analyst.
Review a Universe Creative Bible and its existing Projects.
Distinguish cohesion from diversity. Identify continuity, repetition, overused motifs, underused directions, missing contrast, and intentional outliers.
Never output a numeric quality score. Never classify a song as good/bad or belonging/not belonging.
Treat intentional outliers as deliberate creative contrast unless evidence says otherwise.
Do not rewrite lyrics, Story Maps, Projects, or the Creative Bible. Return advisory observations only, as schema-compliant JSON.`;

const FIT_SYSTEM = `You are PromptBeats Song Universe Project Fit analyst.
Compare one existing Project with the Universe Creative Bible.
Return strong matches, differences, and a neutral interpretation of whether differences can function as useful contrast.
Do not judge good/bad. Do not modify anything. Return only schema-compliant JSON.`;

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

async function resolveUniverseModel(userId: string, requestedModel?: string | null) {
  const access = await getEffectiveModelAccess(userId, "ai_tools");
  const requested = requestedModel
    ? access.modelOptions.find((option) => option.id === requestedModel)
    : null;
  const selected =
    requested ?? access.modelOptions.find((option) => option.id === access.defaultModel);
  if (!selected) throw new Error("No compatible AI model is available for Song Universe.");
  return selected;
}

function cleanJsonText(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return trimmed;
}

async function runStructured<T>(input: {
  userId: string;
  requestedModel?: string | null;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  parse: (value: unknown) => T;
  operation: AiOperation;
  markProviderStarted?: () => Promise<void>;
}) {
  const selected = await resolveUniverseModel(input.userId, input.requestedModel);
  const caller = modelCaller(selected.id, selected.provider);
  let usage: Awaited<ReturnType<typeof caller>>["usage"] = null;
  let actualProvider = selected.provider;
  let actualModel = selected.id;
  let success = false;
  try {
    await input.markProviderStarted?.();
    const result = await caller({
      system: input.system,
      prompt: input.prompt,
      schema: input.schema,
      maxTokens: 6144,
    });
    usage = result.usage;
    actualProvider = result.provider;
    actualModel = result.model;
    if (result.stopReason === "max_tokens")
      throw new Error("The Song Universe response was incomplete. Please retry.");
    const value = input.parse(JSON.parse(cleanJsonText(result.text)));
    success = true;
    return { value, model: result.model, provider: result.provider, modelLabel: selected.label };
  } finally {
    await recordAiUsage({
      userId: input.userId,
      provider: actualProvider,
      model: actualModel,
      operation: input.operation,
      usage,
      success,
    });
  }
}

async function loadUniverseProjectContext(supabase: any, universeId: string, userId: string) {
  const { data: memberships, error } = await supabase
    .from("song_universe_projects")
    .select(
      "id,project_id,position,universe_role,project_status,intentional_outlier,prompt_projects!inner(id,name,user_id)",
    )
    .eq("universe_id", universeId)
    .eq("prompt_projects.user_id", userId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  const projectIds = (memberships ?? []).map((row: any) => row.project_id);
  if (projectIds.length === 0) return [];

  const { data: versions, error: versionsError } = await supabase
    .from("saved_prompts")
    .select(
      "id,project_id,title,theme,genre,mood,language,tags,lyrics,note,version_number,updated_at",
    )
    .eq("user_id", userId)
    .in("project_id", projectIds)
    .order("version_number", { ascending: false, nullsFirst: false });
  if (versionsError) throw new Error(versionsError.message);

  const latestByProject = new Map<string, any>();
  for (const version of versions ?? []) {
    if (version.project_id && !latestByProject.has(version.project_id))
      latestByProject.set(version.project_id, version);
  }

  const { data: storyMaps, error: storyError } = await supabase
    .from("story_maps")
    .select(
      "project_id,summary,progression_type,starting_state,central_change,turning_point,resolution",
    )
    .eq("owner_id", userId)
    .in("project_id", projectIds);
  if (storyError) throw new Error(storyError.message);
  const storyByProject = new Map<string, any>();
  for (const story of storyMaps ?? []) {
    if (story.project_id) storyByProject.set(story.project_id, story);
  }

  return (memberships ?? []).map((membership: any) => {
    const version = latestByProject.get(membership.project_id) ?? null;
    const story = storyByProject.get(membership.project_id) ?? null;
    const project = membership.prompt_projects;
    return {
      membershipId: membership.id,
      projectId: membership.project_id,
      projectName: Array.isArray(project) ? project[0]?.name : project?.name,
      universeRole: membership.universe_role,
      projectStatus: membership.project_status,
      intentionalOutlier: membership.intentional_outlier,
      latestVersion: version
        ? {
            title: version.title,
            theme: version.theme,
            genre: version.genre,
            mood: version.mood,
            language: version.language,
            tags: version.tags,
            lyrics: version.lyrics,
            note: version.note,
          }
        : null,
      storyMap: story
        ? {
            summary: story.summary,
            progressionType: story.progression_type,
            startingState: story.starting_state,
            centralChange: story.central_change,
            turningPoint: story.turning_point,
            resolution: story.resolution,
          }
        : null,
    };
  });
}

const creativeBibleInput = z.object({
  universeId: idSchema,
  model: optionalModelSchema,
  requestKey: auxiliaryRequestKeySchema,
});

export const generateSongUniverseCreativeBible = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => creativeBibleInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    return executeDurableAuxiliaryAiRequest({
      supabase: context.supabase,
      userId: context.userId,
      operation: "song_universe",
      requestKey: data.requestKey,
      execute: async (markProviderStarted) => {
        const universe = await requireOwnedUniverse(
          context.supabase,
          data.universeId,
          context.userId,
        );
        const result = await runStructured<SongUniverseCreativeBible>({
          userId: context.userId,
          requestedModel: data.model ?? null,
          system: CREATIVE_BIBLE_SYSTEM,
          prompt: `Universe title: ${universe.title}\nType: ${universe.universe_type}\nDescription: ${universe.description ?? ""}\nInitial direction: ${universe.initial_direction ?? ""}\nCreate a useful Creative Bible with 6-14 concise items.`,
          schema: CREATIVE_BIBLE_RESPONSE_SCHEMA,
          parse: (value) => creativeBibleResultSchema.parse(value) as SongUniverseCreativeBible,
          operation: "universe_continuity_analysis",
          markProviderStarted,
        });
        return {
          creativeBible: result.value,
          model: result.model,
          provider: result.provider,
          modelLabel: result.modelLabel,
        };
      },
    });
  });

const refineBibleInput = z.object({
  universeId: idSchema,
  creativeBible: songUniverseCreativeBibleSchema,
  instruction: z.string().trim().min(3).max(3000),
  model: optionalModelSchema,
  requestKey: auxiliaryRequestKeySchema,
});

export const refineSongUniverseCreativeBible = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => refineBibleInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    return executeDurableAuxiliaryAiRequest({
      supabase: context.supabase,
      userId: context.userId,
      operation: "song_universe",
      requestKey: data.requestKey,
      execute: async (markProviderStarted) => {
        await requireOwnedUniverse(context.supabase, data.universeId, context.userId);
        const result = await runStructured<SongUniverseCreativeBible>({
          userId: context.userId,
          requestedModel: data.model ?? null,
          system: CREATIVE_BIBLE_SYSTEM,
          prompt: `Current Creative Bible:\n${JSON.stringify(data.creativeBible)}\n\nUser refinement instruction:\n${data.instruction}\n\nReturn the full revised Creative Bible. Preserve useful existing identity unless the instruction changes it.`,
          schema: CREATIVE_BIBLE_RESPONSE_SCHEMA,
          parse: (value) => creativeBibleResultSchema.parse(value) as SongUniverseCreativeBible,
          operation: "universe_continuity_analysis",
          markProviderStarted,
        });
        return {
          creativeBible: result.value,
          model: result.model,
          provider: result.provider,
          modelLabel: result.modelLabel,
        };
      },
    });
  });

const continuityInput = z.object({
  universeId: idSchema,
  model: optionalModelSchema,
  requestKey: auxiliaryRequestKeySchema,
});

export const analyzeSongUniverseContinuity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => continuityInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    return executeDurableAuxiliaryAiRequest({
      supabase: context.supabase,
      userId: context.userId,
      operation: "song_universe",
      requestKey: data.requestKey,
      execute: async (markProviderStarted) => {
        const universe = await requireOwnedUniverse(
          context.supabase,
          data.universeId,
          context.userId,
        );
        const projects = await loadUniverseProjectContext(
          context.supabase,
          data.universeId,
          context.userId,
        );
        const result = await runStructured<SongUniverseAnalysis>({
          userId: context.userId,
          requestedModel: data.model ?? null,
          system: CONTINUITY_SYSTEM,
          prompt: `Creative Bible:\n${JSON.stringify(universe.creative_bible)}\n\nProjects:\n${JSON.stringify(projects)}\n\nAnalyze continuity and diversity. Explicitly account for intentionalOutlier=true.`,
          schema: CONTINUITY_RESPONSE_SCHEMA,
          parse: (value) => songUniverseAnalysisSchema.parse(value) as SongUniverseAnalysis,
          operation: "universe_continuity_analysis",
          markProviderStarted,
        });
        await (context.supabase as any).from("song_universe_ai_analyses").insert({
          universe_id: data.universeId,
          owner_id: context.userId,
          analysis_type: "continuity",
          result: result.value,
          model: result.model,
        } as never);
        return {
          analysis: result.value,
          model: result.model,
          provider: result.provider,
          modelLabel: result.modelLabel,
        };
      },
    });
  });

const projectFitInput = z.object({
  universeId: idSchema,
  projectId: idSchema,
  model: optionalModelSchema,
  requestKey: auxiliaryRequestKeySchema,
});

export const analyzeSongUniverseProjectFit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => projectFitInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    return executeDurableAuxiliaryAiRequest({
      supabase: context.supabase,
      userId: context.userId,
      operation: "song_universe",
      requestKey: data.requestKey,
      execute: async (markProviderStarted) => {
        const universe = await requireOwnedUniverse(
          context.supabase,
          data.universeId,
          context.userId,
        );
        const projects = await loadUniverseProjectContext(
          context.supabase,
          data.universeId,
          context.userId,
        );
        const project = projects.find((item: any) => item.projectId === data.projectId);
        if (!project) throw new Error("Project is not connected to this Song Universe.");
        const result = await runStructured<SongUniverseProjectFit>({
          userId: context.userId,
          requestedModel: data.model ?? null,
          system: FIT_SYSTEM,
          prompt: `Creative Bible:\n${JSON.stringify(universe.creative_bible)}\n\nProject:\n${JSON.stringify(project)}\n\nReturn neutral matches, differences and an interpretation of useful contrast.`,
          schema: FIT_RESPONSE_SCHEMA,
          parse: (value) => projectFitSchema.parse(value),
          operation: "universe_project_fit",
          markProviderStarted,
        });
        return {
          fit: result.value,
          model: result.model,
          provider: result.provider,
          modelLabel: result.modelLabel,
        };
      },
    });
  });

export const getLatestSongUniverseContinuity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ universeId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    await requireOwnedUniverse(context.supabase, data.universeId, context.userId);
    const { data: row, error } = await (context.supabase as any)
      .from("song_universe_ai_analyses")
      .select("id,result,model,created_at")
      .eq("universe_id", data.universeId)
      .eq("owner_id", context.userId)
      .eq("analysis_type", "continuity")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { analysis: null, model: null, createdAt: null };
    return {
      analysis: songUniverseAnalysisSchema.parse(row.result),
      model: typeof row.model === "string" ? row.model : null,
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
    };
  });
