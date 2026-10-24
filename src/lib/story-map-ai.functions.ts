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
  storyMapAnalysisSchema,
  storyMapDraftSchema,
  type StoryMapAnalysis,
  type StoryMapDraft,
} from "@/lib/story-map.shared";

const idSchema = z.string().guid();
const optionalModelSchema = z.string().trim().max(240).nullable().optional();

const STORY_MAP_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    progressionType: {
      type: "STRING",
      enum: ["narrative", "emotional", "relationship", "conceptual", "anthemic", "minimal"],
    },
    summary: { type: "STRING" },
    narrator: { type: "STRING" },
    pointOfView: { type: "STRING" },
    startingState: { type: "STRING" },
    centralChange: { type: "STRING" },
    turningPoint: { type: "STRING" },
    resolution: { type: "STRING" },
    beats: {
      type: "ARRAY",
      minItems: 3,
      maxItems: 10,
      items: {
        type: "OBJECT",
        properties: {
          position: { type: "INTEGER" },
          title: { type: "STRING" },
          whatHappens: { type: "STRING" },
          emotion: { type: "STRING" },
          purpose: { type: "STRING" },
          narratorState: { type: "STRING" },
          keyImage: { type: "STRING" },
          reveal: { type: "STRING" },
          changeAfterBeat: { type: "STRING" },
          lyricAnchor: { type: "STRING" },
          suggestedSections: { type: "ARRAY", items: { type: "STRING" } },
          isKeyBeat: { type: "BOOLEAN" },
        },
        required: [
          "position",
          "title",
          "whatHappens",
          "emotion",
          "purpose",
          "narratorState",
          "keyImage",
          "reveal",
          "changeAfterBeat",
          "lyricAnchor",
          "suggestedSections",
          "isKeyBeat",
        ],
      },
    },
  },
  required: [
    "progressionType",
    "summary",
    "narrator",
    "pointOfView",
    "startingState",
    "centralChange",
    "turningPoint",
    "resolution",
    "beats",
  ],
};

const ANALYSIS_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    overall: { type: "STRING" },
    observations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          category: {
            type: "STRING",
            enum: [
              "narrative_stagnation",
              "emotional_repetition",
              "missing_trigger",
              "missing_turning_point",
              "weak_escalation",
              "premature_resolution",
              "unclear_motivation",
              "unresolved_setup",
              "weak_ending_payoff",
              "chorus_disconnect",
              "section_redundancy",
              "point_of_view_drift",
              "timeline_confusion",
              "other",
            ],
          },
          evidence: { type: "STRING" },
          suggestion: { type: "STRING" },
          sectionLabel: { type: "STRING", nullable: true },
        },
        required: ["category", "evidence", "suggestion", "sectionLabel"],
      },
    },
    sectionSuggestions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          sectionKey: { type: "STRING" },
          sectionLabel: { type: "STRING" },
          storyGoal: { type: "STRING" },
          issue: { type: "STRING" },
          suggestion: { type: "STRING" },
        },
        required: ["sectionKey", "sectionLabel", "storyGoal", "issue", "suggestion"],
      },
    },
  },
  required: ["overall", "observations", "sectionSuggestions"],
};

const BUILD_SYSTEM = `You are PromptBeats Story Map, a narrative and emotional progression planner for songs.
A Story Map is NOT lyrics and NOT a Song Blueprint. It describes what changes from the beginning of the song to the end.

Rules:
- Identify whether progression is narrative, emotional, relationship, conceptual, anthemic, or minimal.
- Use only the number of beats needed, normally 3–10.
- Do not manufacture a literal plot when the concept is emotional, conceptual, anthemic, or intentionally minimal.
- Preserve the user's narrator, point of view, desired ending, ambiguity, constraints and intentional repetition.
- Avoid redundant beats, forced tragedy, forced cinematic clichés and unnecessary characters.
- Include a turning point or resolution only when appropriate. Open or unresolved endings are valid.
- Suggested song sections are advisory only. Story Map and Song Blueprint are separate and mapping is never mechanically 1:1.
- Do not write final lyrics. lyricAnchor may contain only a short optional phrase/idea, never a full verse or chorus.
- Return only schema-compliant JSON.`;

const FROM_LYRICS_SYSTEM = `${BUILD_SYSTEM}

You are extracting the Story Map from EXISTING LYRICS.
Hard rule: describe what is actually present in the supplied lyrics. Do not invent a better story and pretend it exists.
If progression, trigger, turning point, motivation, or resolution is missing, represent that honestly with concise wording rather than fabricating it.`;

const ANALYZE_SYSTEM = `You are PromptBeats Story Map Narrative Diagnostic.
Compare the supplied current lyrics with the supplied Story Map and song-section labels.
Diagnose, suggest, and preserve user agency. Do NOT rewrite the song and do NOT mutate the Story Map.
Suggestions must be specific, section-aware and actionable. Protect intentional repetition and ambiguity.
Use evidence from the actual lyrics. Do not invent events or meanings that are not supported.
No numeric quality score. Return only schema-compliant JSON.`;

async function requireOwnedMap(supabase: any, storyMapId: string, userId: string) {
  const { data: map, error } = await supabase
    .from("story_maps")
    .select("*")
    .eq("id", storyMapId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!map) throw new Error("Story Map not found.");
  const { data: beats, error: beatsError } = await supabase
    .from("story_map_beats")
    .select("*")
    .eq("story_map_id", storyMapId)
    .order("position", { ascending: true });
  if (beatsError) throw new Error(beatsError.message);
  return { map, beats: beats ?? [] };
}

async function resolveStoryMapModel(userId: string, requestedModel?: string | null) {
  // Story Map is registry-backed now. The dedicated AI Tools default is added in
  // the agreed model-architecture step; until then this resolves through the
  // existing generator-compatible registry without hard-coding a provider/model.
  const access = await getEffectiveModelAccess(userId, "ai_tools");
  const requested = requestedModel
    ? access.modelOptions.find((option) => option.id === requestedModel)
    : null;
  const selected =
    requested ?? access.modelOptions.find((option) => option.id === access.defaultModel);
  if (!selected) throw new Error("No compatible AI model is available for Story Map.");
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
  const selected = await resolveStoryMapModel(input.userId, input.requestedModel);
  const caller = modelCaller(selected.id, selected.provider, {
    userId: input.userId,
    operation: input.operation,
  });
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
    if (result.stopReason === "max_tokens") {
      throw new Error("The Story Map response was incomplete. Please retry.");
    }
    const parsed = input.parse(JSON.parse(cleanJsonText(result.text)));
    success = true;
    return {
      value: parsed,
      model: result.model,
      provider: result.provider,
      modelLabel: selected.label,
    };
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

export const buildStoryMapWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        storyMapId: idSchema,
        model: optionalModelSchema,
        requestKey: auxiliaryRequestKeySchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    return executeDurableAuxiliaryAiRequest({
      supabase: context.supabase,
      userId: context.userId,
      operation: "story_map",
      requestKey: data.requestKey,
      execute: async (markProviderStarted) => {
        const { map } = await requireOwnedMap(
          context.supabase as any,
          data.storyMapId,
          context.userId,
        );
        const prompt = [
          `TITLE: ${map.title}`,
          `CORE IDEA: ${map.concept}`,
          map.theme ? `THEME: ${map.theme}` : "",
          map.emotional_direction ? `EMOTIONAL DIRECTION: ${map.emotional_direction}` : "",
          map.narrator ? `NARRATOR: ${map.narrator}` : "",
          map.point_of_view ? `POINT OF VIEW: ${map.point_of_view}` : "",
          map.desired_ending ? `DESIRED ENDING: ${map.desired_ending}` : "",
          "Build the Story Map. Do not write final lyrics.",
        ]
          .filter(Boolean)
          .join("\n");
        const result = await runStructured<StoryMapDraft>({
          userId: context.userId,
          requestedModel: data.model ?? null,
          system: BUILD_SYSTEM,
          prompt,
          schema: STORY_MAP_RESPONSE_SCHEMA,
          parse: (value) => storyMapDraftSchema.parse(value),
          operation: "story_map_generate",
          markProviderStarted,
        });
        return {
          draft: result.value,
          model: result.model,
          provider: result.provider,
          modelLabel: result.modelLabel,
        };
      },
    });
  });

export const planStoryDrivenGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        theme: z.string().trim().min(3).max(500),
        genre: z.string().trim().min(1).max(600),
        mood: z.string().trim().min(1).max(200),
        language: z.string().trim().min(1).max(80),
        structure: z.string().trim().max(600).default(""),
        production: z.string().trim().max(2000).default(""),
        instructions: z.string().trim().max(2000).default(""),
        model: optionalModelSchema,
        requestKey: auxiliaryRequestKeySchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "ai_generator");
    await requireFeatureAccess(context.supabase, "story_map");
    return executeDurableAuxiliaryAiRequest({
      supabase: context.supabase,
      userId: context.userId,
      operation: "story_map",
      requestKey: data.requestKey,
      execute: async (markProviderStarted) => {
        const prompt = [
          `CORE IDEA: ${data.theme}`,
          `MUSIC STYLE: ${data.genre}`,
          `MOOD: ${data.mood}`,
          `LYRICS LANGUAGE: ${data.language}`,
          data.structure
            ? `SONG BLUEPRINT / STRUCTURE (authoritative for section structure): ${data.structure}`
            : "",
          data.production ? `PRODUCTION DIRECTION: ${data.production}` : "",
          data.instructions ? `ADDITIONAL USER INSTRUCTIONS: ${data.instructions}` : "",
          "Create a compact internal Story Map that gives the eventual lyrics meaningful progression while preserving every explicit Generator instruction. Do not write the lyrics yet.",
        ]
          .filter(Boolean)
          .join("\n\n");
        const result = await runStructured<StoryMapDraft>({
          userId: context.userId,
          requestedModel: data.model ?? null,
          system: BUILD_SYSTEM,
          prompt,
          schema: STORY_MAP_RESPONSE_SCHEMA,
          parse: (value) => storyMapDraftSchema.parse(value),
          operation: "story_driven_plan",
          markProviderStarted,
        });
        return {
          draft: result.value,
          model: result.model,
          provider: result.provider,
          modelLabel: result.modelLabel,
        };
      },
    });
  });

export const createStoryMapFromLyrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        lyrics: z.string().trim().min(20).max(30000),
        songTitle: z.string().trim().max(200).optional().default(""),
        structure: z.string().trim().max(4000).optional().default(""),
        model: optionalModelSchema,
        requestKey: auxiliaryRequestKeySchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    return executeDurableAuxiliaryAiRequest({
      supabase: context.supabase,
      userId: context.userId,
      operation: "story_map",
      requestKey: data.requestKey,
      execute: async (markProviderStarted) => {
        const prompt = [
          data.songTitle ? `SONG TITLE: ${data.songTitle}` : "",
          data.structure ? `KNOWN SONG STRUCTURE:\n${data.structure}` : "",
          `CURRENT LYRICS — analyze only what is actually present:\n${data.lyrics}`,
        ]
          .filter(Boolean)
          .join("\n\n");
        const result = await runStructured<StoryMapDraft>({
          userId: context.userId,
          requestedModel: data.model ?? null,
          system: FROM_LYRICS_SYSTEM,
          prompt,
          schema: STORY_MAP_RESPONSE_SCHEMA,
          parse: (value) => storyMapDraftSchema.parse(value),
          operation: "story_map_from_lyrics",
          markProviderStarted,
        });
        return {
          draft: result.value,
          model: result.model,
          provider: result.provider,
          modelLabel: result.modelLabel,
        };
      },
    });
  });

export const analyzeLyricsWithStoryMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        storyMapId: idSchema,
        lyrics: z.string().trim().min(20).max(30000),
        structure: z.string().trim().max(4000).optional().default(""),
        model: optionalModelSchema,
        requestKey: auxiliaryRequestKeySchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    return executeDurableAuxiliaryAiRequest({
      supabase: context.supabase,
      userId: context.userId,
      operation: "story_map",
      requestKey: data.requestKey,
      execute: async (markProviderStarted) => {
        const { map, beats } = await requireOwnedMap(
          context.supabase as any,
          data.storyMapId,
          context.userId,
        );
        const mapContext = {
          concept: map.concept,
          progressionType: map.progression_type,
          summary: map.summary,
          startingState: map.starting_state,
          centralChange: map.central_change,
          turningPoint: map.turning_point,
          resolution: map.resolution,
          beats: beats.map((beat: any) => ({
            position: beat.position,
            title: beat.title,
            whatHappens: beat.what_happens,
            emotion: beat.emotion,
            purpose: beat.purpose,
            reveal: beat.reveal,
            changeAfterBeat: beat.change_after_beat,
            suggestedSections: beat.suggested_sections,
          })),
        };
        const prompt = [
          `STORY MAP:\n${JSON.stringify(mapContext)}`,
          data.structure ? `SONG STRUCTURE:\n${data.structure}` : "",
          `CURRENT LYRICS:\n${data.lyrics}`,
          "Return diagnosis and section-specific suggestions only. Do not return rewritten lyrics.",
        ]
          .filter(Boolean)
          .join("\n\n");
        const result = await runStructured<StoryMapAnalysis>({
          userId: context.userId,
          requestedModel: data.model ?? null,
          system: ANALYZE_SYSTEM,
          prompt,
          schema: ANALYSIS_RESPONSE_SCHEMA,
          parse: (value) => storyMapAnalysisSchema.parse(value),
          operation: "story_map_analyze_lyrics",
          markProviderStarted,
        });
        return {
          analysis: result.value,
          model: result.model,
          provider: result.provider,
          modelLabel: result.modelLabel,
        };
      },
    });
  });
