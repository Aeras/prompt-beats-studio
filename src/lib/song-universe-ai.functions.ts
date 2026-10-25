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
import { loadSongUniverseProjectMemory } from "@/lib/song-universe-memory.server";
import { getSongUniverseStrategy } from "@/lib/song-universe-planner";
import {
  songUniverseAnalysisSchema,
  songUniverseCreativeBibleSchema,
  type SongUniverseAnalysis,
  type SongUniverseCreativeBible,
} from "@/lib/song-universe.shared";

const idSchema = z.string().guid();
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
          recurrence: {
            type: "STRING",
            enum: ["always", "frequent", "occasional", "rare", "one_off"],
          },
          enabled: { type: "BOOLEAN" },
          sortOrder: { type: "INTEGER" },
        },
        required: ["id", "section", "content", "strength", "recurrence", "enabled", "sortOrder"],
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

const CREATIVE_BIBLE_SYSTEM = `You are PromptBeats Song Universe, a multi-song creative planning system.
Core principle: shared artist identity does not mean repeated song content.
Create or refine a concise structured Creative Bible for an album, EP, song series, creative era, or other multi-song project.

Treat musical_identity, production_identity, vocal_identity and language_writing_identity primarily as Identity DNA.
Treat lyrical_themes, emotional_palette, recurring_motifs and structural_tendencies primarily as a creative Palette: options that can recur selectively, not requirements for every song.
A recurring motif is not an every-song motif.
Use Core only for genuine DNA, Flexible for preferences, and Experimental for optional contrast.
Use recurrence=always only for truly canonical traits that should apply every time; otherwise prefer frequent/occasional/rare/one_off as appropriate.
Do not force every song to share the same BPM, instruments, structure, imagery, emotional arc, hook type, theme, setting or story.
Include useful Things to Avoid and Allowed Deviations when supported by the user's direction.
Do not write songs or lyrics. Return only schema-compliant JSON.`;

const CONTINUITY_SYSTEM = `You are PromptBeats Song Universe Continuity Analyst.
Review the current Universe DNA and normalized Project Memory.
Distinguish cohesion from diversity. Identify continuity, repetition, overused motifs, underused directions, portfolio imbalance, missing contrast, narrative stagnation and intentional outliers.
Respect the Universe type: Album seeks artist continuity + song diversity; EP explores facets of a tighter period; Song Series must advance the story; Creative Era preserves identity with broad exploration.
Never output a numeric quality score. Never classify a song as good/bad or belonging/not belonging.
Treat intentional outliers as deliberate creative contrast with reduced representative weight unless evidence says otherwise.
Do not rewrite lyrics, Story Maps, Projects, roles, order, or the Creative Bible. Return advisory observations only, as schema-compliant JSON.`;

const FIT_SYSTEM = `You are PromptBeats Song Universe Project Fit analyst.
Compare one existing Project with the Universe Creative Bible and type strategy.
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
  markProviderStarted?: (model: string) => Promise<void>;
}) {
  const selected = await resolveUniverseModel(input.userId, input.requestedModel);
  const caller = modelCaller(selected.id, selected.provider, {
    userId: input.userId,
    operation: input.operation,
  });
  let usage: Awaited<ReturnType<typeof caller>>["usage"] = null;
  let actualProvider = selected.provider;
  let actualModel = selected.id;
  let success = false;
  try {
    await input.markProviderStarted?.(selected.id);
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
      executionId: caller.executionId,
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
  const memory = await loadSongUniverseProjectMemory(supabase, universeId, userId);
  return memory.summaries.map((summary) => ({
    projectId: summary.projectId,
    projectName: summary.projectTitle,
    position: summary.position,
    universeRole: summary.universeRole,
    projectStatus: summary.projectStatus,
    intentionalOutlier: summary.intentionalOutlier,
    outlierPurpose: summary.outlierPurpose,
    title: summary.songTitle,
    theme: summary.theme,
    genre: summary.genre,
    style: summary.style,
    mood: summary.mood,
    bpm: summary.bpm,
    instruments: summary.instruments,
    productionStyle: summary.productionStyle,
    structure: summary.structure,
    lyricsSummary: summary.lyricsSummary,
    lyricsExcerpt: summary.lyricsExcerpt,
    narrativeSummary: summary.narrativeSummary,
    narratorPov: summary.narratorPov,
    majorImagery: summary.majorImagery,
    recurringMotifs: summary.recurringMotifs,
    storyMapSummary: summary.storyMapSummary,
    progressionType: summary.progressionType,
    startingState: summary.startingState,
    centralChange: summary.centralChange,
    turningPoint: summary.turningPoint,
    resolution: summary.resolution,
    sourceCompleteness: summary.sourceCompleteness,
  }));
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
        const strategy = getSongUniverseStrategy(universe.universe_type);
        const result = await runStructured<SongUniverseCreativeBible>({
          userId: context.userId,
          requestedModel: data.model ?? null,
          system: CREATIVE_BIBLE_SYSTEM,
          prompt: `Universe title: ${universe.title}\nType: ${universe.universe_type}\nType strategy: ${strategy.headline}\nDescription: ${universe.description ?? ""}\nInitial direction: ${universe.initial_direction ?? ""}\nCreate a useful Creative Bible with 6-14 concise items. Preserve enough identity to bind the project together without consuming the whole lyrical/theme palette in every song.`,
          schema: CREATIVE_BIBLE_RESPONSE_SCHEMA,
          parse: (value) => creativeBibleResultSchema.parse(value) as SongUniverseCreativeBible,
          operation: "universe_creative_bible_generate",
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
        const universe = await requireOwnedUniverse(
          context.supabase,
          data.universeId,
          context.userId,
        );
        const current = songUniverseCreativeBibleSchema.parse(
          universe.creative_bible ?? { items: [] },
        );
        const result = await runStructured<SongUniverseCreativeBible>({
          userId: context.userId,
          requestedModel: data.model ?? null,
          system: CREATIVE_BIBLE_SYSTEM,
          prompt: `Current Creative Bible:\n${JSON.stringify(current)}\n\nUser refinement instruction:\n${data.instruction}\n\nReturn the full revised Creative Bible. Preserve useful existing identity unless the instruction changes it. Keep Palette traits selective rather than turning them into requirements for every song.`,
          schema: CREATIVE_BIBLE_RESPONSE_SCHEMA,
          parse: (value) => creativeBibleResultSchema.parse(value) as SongUniverseCreativeBible,
          operation: "universe_creative_bible_refine",
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
        const memory = await loadSongUniverseProjectMemory(
          context.supabase,
          data.universeId,
          context.userId,
        );
        const strategy = getSongUniverseStrategy(memory.universe.universeType);
        const result = await runStructured<SongUniverseAnalysis>({
          userId: context.userId,
          requestedModel: data.model ?? null,
          system: CONTINUITY_SYSTEM,
          prompt: `Universe type: ${memory.universe.universeType}\nStrategy: ${strategy.headline}\n\nCreative Bible:\n${JSON.stringify(memory.universe.creativeBible)}\n\nStory Bible:\n${JSON.stringify(memory.universe.storyBible)}\n\nProject Memory:\n${JSON.stringify(memory.summaries)}\n\nDeterministic usage facts:\n${JSON.stringify(memory.usageProfile)}\n\nAnalyze continuity and diversity. Explicitly account for intentional outliers and source completeness. Do not treat Palette traits as requirements for every song.`,
          schema: CONTINUITY_RESPONSE_SCHEMA,
          parse: (value) => songUniverseAnalysisSchema.parse(value) as SongUniverseAnalysis,
          operation: "universe_continuity_analysis",
          markProviderStarted,
        });
        const { error: insertError } = await (context.supabase as any)
          .from("song_universe_ai_analyses")
          .insert({
            universe_id: data.universeId,
            owner_id: context.userId,
            analysis_type: "continuity",
            result: result.value,
            model: result.model,
            source_revision: memory.historyFingerprint,
          } as never);
        if (insertError) throw new Error(insertError.message);
        return {
          analysis: result.value,
          model: result.model,
          provider: result.provider,
          modelLabel: result.modelLabel,
          historyFingerprint: memory.historyFingerprint,
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
        const memory = await loadSongUniverseProjectMemory(
          context.supabase,
          data.universeId,
          context.userId,
        );
        const project = memory.summaries.find((item) => item.projectId === data.projectId);
        if (!project) throw new Error("Project is not connected to this Song Universe.");
        const strategy = getSongUniverseStrategy(memory.universe.universeType);
        const result = await runStructured<SongUniverseProjectFit>({
          userId: context.userId,
          requestedModel: data.model ?? null,
          system: FIT_SYSTEM,
          prompt: `Universe type: ${memory.universe.universeType}\nStrategy: ${strategy.headline}\n\nCreative Bible:\n${JSON.stringify(memory.universe.creativeBible)}\n\nProject:\n${JSON.stringify(project)}\n\nReturn neutral matches, differences and an interpretation of useful contrast. Respect source completeness and do not interpret difference itself as a flaw.`,
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
    const memory = await loadSongUniverseProjectMemory(
      context.supabase,
      data.universeId,
      context.userId,
    );
    const { data: row, error } = await (context.supabase as any)
      .from("song_universe_ai_analyses")
      .select("id,result,model,created_at,source_revision")
      .eq("universe_id", data.universeId)
      .eq("owner_id", context.userId)
      .eq("analysis_type", "continuity")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row)
      return {
        analysis: null,
        model: null,
        createdAt: null,
        sourceRevision: null,
        fresh: null,
      };
    const createdAt = typeof row.created_at === "string" ? row.created_at : null;
    const sourceRevision = typeof row.source_revision === "string" ? row.source_revision : null;
    const fresh =
      sourceRevision === memory.historyFingerprint ||
      (createdAt != null && Date.parse(createdAt) >= Date.parse(memory.historyUpdatedAt));
    return {
      analysis: songUniverseAnalysisSchema.parse(row.result),
      model: typeof row.model === "string" ? row.model : null,
      createdAt,
      sourceRevision,
      fresh,
    };
  });
