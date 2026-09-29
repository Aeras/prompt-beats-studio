import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import {
  auxiliaryRequestKeySchema,
  executeDurableAuxiliaryAiRequest,
} from "@/lib/ai-auxiliary-idempotency.server";
import { getEffectiveModelAccess, modelCaller } from "@/lib/ai-provider.server";
import { recordAiUsage } from "@/lib/ai-usage.server";
import { loadSongUniverseProjectMemory } from "@/lib/song-universe-memory.server";
import {
  SONG_UNIVERSE_PLANNER_BASE_RULES,
  contrastInstruction,
  detectNearDuplicateDirection,
  deterministicPortfolioBalanceNotes,
  getSongUniverseStrategy,
  validateNextSongBriefConsistency,
} from "@/lib/song-universe-planner";
import {
  nextSongBriefSchema,
  songUniversePlannerContrastSchema,
  songUniversePlannerEditableFieldSchema,
  type NextSongBrief,
  type SongUniverseDuplicateRisk,
} from "@/lib/song-universe-planner.shared";
import { songUniverseAnalysisSchema, songUniverseBibleItemKind } from "@/lib/song-universe.shared";

const idSchema = z.string().uuid();
const optionalModelSchema = z.string().trim().max(240).nullable().optional();
const PLANNER_SCHEMA_VERSION = "next-song-brief:v1";

const STORY_STATE_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    canonFacts: { type: "ARRAY", items: { type: "STRING" } },
    characters: { type: "ARRAY", items: { type: "STRING" } },
    relationships: { type: "ARRAY", items: { type: "STRING" } },
    locations: { type: "ARRAY", items: { type: "STRING" } },
    timeline: { type: "ARRAY", items: { type: "STRING" } },
    knownEvents: { type: "ARRAY", items: { type: "STRING" } },
    resolvedEvents: { type: "ARRAY", items: { type: "STRING" } },
    unresolvedEvents: { type: "ARRAY", items: { type: "STRING" } },
    openQuestions: { type: "ARRAY", items: { type: "STRING" } },
    discoveries: { type: "ARRAY", items: { type: "STRING" } },
    currentEmotionalState: { type: "STRING" },
    majorConflict: { type: "STRING" },
    recurringSymbols: { type: "ARRAY", items: { type: "STRING" } },
    worldRules: { type: "ARRAY", items: { type: "STRING" } },
    currentNarrativeStage: { type: "STRING" },
    possibleNextStages: { type: "ARRAY", items: { type: "STRING" } },
    desiredEnding: { type: "STRING" },
  },
  required: [
    "canonFacts",
    "characters",
    "relationships",
    "locations",
    "timeline",
    "knownEvents",
    "resolvedEvents",
    "unresolvedEvents",
    "openQuestions",
    "discoveries",
    "currentEmotionalState",
    "majorConflict",
    "recurringSymbols",
    "worldRules",
    "currentNarrativeStage",
    "possibleNextStages",
    "desiredEnding",
  ],
};

const NEXT_SONG_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    identityToPreserve: { type: "ARRAY", items: { type: "STRING" } },
    mustRespect: { type: "ARRAY", items: { type: "STRING" } },
    themesToExplore: { type: "ARRAY", items: { type: "STRING" } },
    preferNotToRepeatThemes: { type: "ARRAY", items: { type: "STRING" } },
    preferNotToRepeatMotifs: { type: "ARRAY", items: { type: "STRING" } },
    mustAvoid: { type: "ARRAY", items: { type: "STRING" } },
    recommendedMood: { type: "STRING" },
    recommendedEnergy: { type: "STRING" },
    recommendedBpmDirection: { type: "STRING" },
    recommendedStructureDirection: { type: "STRING" },
    recommendedHookDirection: { type: "STRING" },
    recommendedPov: { type: "STRING" },
    recommendedSettingDirection: { type: "STRING" },
    storyState: STORY_STATE_RESPONSE_SCHEMA,
    narrativeState: { type: "STRING" },
    storyProgression: { type: "STRING" },
    eventsNotToRepeat: { type: "ARRAY", items: { type: "STRING" } },
    openStoryQuestions: { type: "ARRAY", items: { type: "STRING" } },
    nextNarrativeOpportunity: { type: "STRING" },
    intentionalContrast: { type: "ARRAY", items: { type: "STRING" } },
    continuityNotes: { type: "ARRAY", items: { type: "STRING" } },
    creativeOpportunity: { type: "ARRAY", items: { type: "STRING" } },
    portfolioBalanceNotes: { type: "ARRAY", items: { type: "STRING" } },
    evidence: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          statement: { type: "STRING" },
          sourceType: {
            type: "STRING",
            enum: [
              "deterministic_fact",
              "semantic_history",
              "story_state",
              "continuity_analysis",
              "project_summary",
              "user_instruction",
              "universe_rule",
            ],
          },
          sourceRef: { type: "STRING" },
          confidence: { type: "NUMBER" },
        },
        required: ["id", "statement", "sourceType", "sourceRef", "confidence"],
      },
    },
    reasoningSummary: { type: "STRING" },
  },
  required: [
    "identityToPreserve",
    "mustRespect",
    "themesToExplore",
    "preferNotToRepeatThemes",
    "preferNotToRepeatMotifs",
    "mustAvoid",
    "recommendedMood",
    "recommendedEnergy",
    "recommendedBpmDirection",
    "recommendedStructureDirection",
    "recommendedHookDirection",
    "recommendedPov",
    "recommendedSettingDirection",
    "storyState",
    "narrativeState",
    "storyProgression",
    "eventsNotToRepeat",
    "openStoryQuestions",
    "nextNarrativeOpportunity",
    "intentionalContrast",
    "continuityNotes",
    "creativeOpportunity",
    "portfolioBalanceNotes",
    "evidence",
    "reasoningSummary",
  ],
};

const nullableBriefFields = new Set([
  "recommendedMood",
  "recommendedEnergy",
  "recommendedBpmDirection",
  "recommendedStructureDirection",
  "recommendedHookDirection",
  "recommendedPov",
  "recommendedSettingDirection",
  "narrativeState",
  "storyProgression",
  "nextNarrativeOpportunity",
]);

const nullableStoryFields = new Set([
  "currentEmotionalState",
  "majorConflict",
  "currentNarrativeStage",
  "desiredEnding",
]);

function normalizeAiValue(value: any) {
  if (!value || typeof value !== "object") return value;
  const next = { ...value };
  for (const field of nullableBriefFields) {
    if (typeof next[field] === "string" && next[field].trim() === "") next[field] = null;
  }
  if (next.storyState && typeof next.storyState === "object") {
    next.storyState = { ...next.storyState };
    for (const field of nullableStoryFields) {
      if (typeof next.storyState[field] === "string" && next.storyState[field].trim() === "") {
        next.storyState[field] = null;
      }
    }
  }
  if (Array.isArray(next.evidence)) {
    next.evidence = next.evidence.map((item: any) => ({
      ...item,
      sourceRef:
        typeof item?.sourceRef === "string" && item.sourceRef.trim() ? item.sourceRef.trim() : null,
      confidence:
        typeof item?.confidence === "number" && Number.isFinite(item.confidence)
          ? Math.max(0, Math.min(1, item.confidence))
          : null,
    }));
  }
  return next;
}

function cleanJsonText(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return trimmed;
}

async function resolvePlannerModel(userId: string, requestedModel?: string | null) {
  const access = await getEffectiveModelAccess(userId, "ai_tools");
  const requested = requestedModel
    ? access.modelOptions.find((option) => option.id === requestedModel)
    : null;
  const selected = requested ?? access.modelOptions.find((option) => option.id === access.defaultModel);
  if (!selected) throw new Error("No compatible AI model is available for Song Universe Planner.");
  return selected;
}

async function callPlannerModel(input: {
  userId: string;
  requestedModel?: string | null;
  system: string;
  prompt: string;
  markProviderStarted?: () => Promise<void>;
}) {
  const selected = await resolvePlannerModel(input.userId, input.requestedModel);
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
      schema: NEXT_SONG_RESPONSE_SCHEMA,
      maxTokens: 6144,
    });
    usage = result.usage;
    actualProvider = result.provider;
    actualModel = result.model;
    if (result.stopReason === "max_tokens") {
      throw new Error("The Song Universe Planner response was incomplete. Please retry.");
    }
    const value = normalizeAiValue(JSON.parse(cleanJsonText(result.text)));
    success = true;
    return {
      value,
      model: result.model,
      provider: result.provider,
      modelLabel: selected.label,
    };
  } finally {
    await recordAiUsage({
      userId: input.userId,
      provider: actualProvider,
      model: actualModel,
      operation: "universe_next_song_plan",
      usage,
      success,
    });
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function buildHardConstraints(memory: Awaited<ReturnType<typeof loadSongUniverseProjectMemory>>) {
  const identityToPreserve = memory.universe.creativeBible.items
    .filter(
      (item) =>
        item.enabled &&
        (songUniverseBibleItemKind(item.section) === "identity" || item.strength === "core"),
    )
    .map((item) => item.content);
  const always = memory.universe.creativeBible.items
    .filter((item) => item.enabled && item.recurrence === "always")
    .map((item) => item.content);
  const mustAvoid = memory.universe.creativeBible.items
    .filter((item) => item.enabled && item.section === "things_to_avoid")
    .map((item) => item.content);
  const story = memory.universe.storyBible;
  return {
    identityToPreserve: uniqueStrings(identityToPreserve),
    mustRespect: uniqueStrings([
      ...always,
      ...story.canonFacts,
      ...story.worldRules,
      story.desiredEnding ? `Desired ending: ${story.desiredEnding}` : null,
    ]),
    mustAvoid: uniqueStrings(mustAvoid),
  };
}

function buildFallbackBrief(
  memory: Awaited<ReturnType<typeof loadSongUniverseProjectMemory>>,
  input: {
    targetRole: string | null;
    targetPosition: number;
    contrastLevel: "low" | "balanced" | "high";
    currentSongIntent: string | null;
  },
): NextSongBrief {
  const strategy = getSongUniverseStrategy(memory.universe.universeType);
  const hard = buildHardConstraints(memory);
  const heavyBpm = memory.usageProfile.bpmRanges
    .filter((item) => item.level === "heavy" || item.level === "saturated")
    .map((item) => item.key);
  const heavyMood = memory.usageProfile.moods
    .filter((item) => item.level === "heavy" || item.level === "saturated")
    .map((item) => item.key);
  const latest = memory.summaries.at(-1) ?? null;
  const story = memory.universe.storyBible;
  const evidence = [
    ...memory.usageProfile.bpmRanges
      .filter((item) => item.level === "heavy" || item.level === "saturated")
      .slice(0, 2)
      .map((item, index) => ({
        id: `fallback-bpm-${index}`,
        statement: `${item.count} of ${item.totalComparable} comparable tracks use ${item.key}.`,
        sourceType: "deterministic_fact" as const,
        sourceRef: "usage:bpm",
        confidence: 1,
      })),
    ...memory.usageProfile.moods
      .filter((item) => item.level === "heavy" || item.level === "saturated")
      .slice(0, 2)
      .map((item, index) => ({
        id: `fallback-mood-${index}`,
        statement: `${item.key} is heavily represented in the existing project memory.`,
        sourceType: "deterministic_fact" as const,
        sourceRef: "usage:mood",
        confidence: 1,
      })),
  ];

  return nextSongBriefSchema.parse({
    strategyVersion: strategy.version,
    universeType: memory.universe.universeType,
    targetRole: input.targetRole,
    contrastLevel: input.contrastLevel,
    identityToPreserve: hard.identityToPreserve,
    mustRespect: hard.mustRespect,
    themesToExplore:
      memory.summaries.length === 0
        ? ["Establish the Universe identity without exhausting its full lyrical palette."]
        : [strategy.plannerQuestion],
    preferNotToRepeatThemes: heavyMood.map((item) => `Another track dominated by ${item}`),
    preferNotToRepeatMotifs: [],
    mustAvoid: hard.mustAvoid,
    recommendedMood: null,
    recommendedEnergy: null,
    recommendedBpmDirection:
      heavyBpm.length > 0
        ? `If it serves the song, explore outside the heavily used ${heavyBpm.join(", ")} range.`
        : null,
    recommendedStructureDirection: null,
    recommendedHookDirection: null,
    recommendedPov: null,
    recommendedSettingDirection: null,
    storyState:
      memory.universe.universeType === "song_series"
        ? {
            canonFacts: story.canonFacts,
            characters: story.characters,
            relationships: story.relationships,
            locations: story.locations,
            timeline: [],
            knownEvents: uniqueStrings(
              memory.summaries.flatMap((summary) => [summary.centralChange, summary.turningPoint]),
            ),
            resolvedEvents: uniqueStrings(memory.summaries.map((summary) => summary.resolution)),
            unresolvedEvents: [],
            openQuestions: uniqueStrings(
              memory.summaries.flatMap((summary) => summary.unresolvedQuestions),
            ),
            discoveries: [],
            currentEmotionalState: null,
            majorConflict: latest?.centralChange ?? null,
            recurringSymbols: story.recurringSymbols,
            worldRules: story.worldRules,
            currentNarrativeStage: latest?.resolution ?? latest?.turningPoint ?? null,
            possibleNextStages: [],
            desiredEnding: story.desiredEnding,
          }
        : null,
    narrativeState: latest?.narrativeSummary ?? latest?.storyMapSummary ?? null,
    storyProgression:
      memory.universe.universeType === "song_series"
        ? "Advance beyond the latest completed event. Do not make an already completed event the new central event."
        : null,
    eventsNotToRepeat: uniqueStrings(memory.summaries.map((summary) => summary.resolution)),
    openStoryQuestions: uniqueStrings(
      memory.summaries.flatMap((summary) => summary.unresolvedQuestions),
    ),
    nextNarrativeOpportunity:
      memory.universe.universeType === "song_series"
        ? "Move the story into a genuinely new event or stage while respecting Story Canon."
        : null,
    intentionalContrast: [contrastInstruction(input.contrastLevel)],
    continuityNotes: input.currentSongIntent
      ? [`Current song intent has priority: ${input.currentSongIntent}`]
      : [],
    creativeOpportunity: [strategy.plannerQuestion],
    portfolioBalanceNotes: deterministicPortfolioBalanceNotes(memory.usageProfile),
    evidence,
    reasoningSummary:
      "Reduced Planner fallback based on Universe DNA and deterministic Project Memory. No unsupported semantic claims were added.",
  });
}

async function loadLatestContinuity(
  supabase: any,
  universeId: string,
  userId: string,
  historyFingerprint: string,
  historyUpdatedAt: string,
) {
  const { data, error } = await supabase
    .from("song_universe_ai_analyses")
    .select("result,model,created_at,source_revision")
    .eq("universe_id", universeId)
    .eq("owner_id", userId)
    .eq("analysis_type", "continuity")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const parsed = songUniverseAnalysisSchema.safeParse(data.result);
  if (!parsed.success) return null;
  const fresh =
    data.source_revision === historyFingerprint ||
    (typeof data.created_at === "string" && Date.parse(data.created_at) >= Date.parse(historyUpdatedAt));
  return {
    analysis: parsed.data,
    model: typeof data.model === "string" ? data.model : null,
    createdAt: data.created_at,
    sourceRevision: data.source_revision,
    fresh,
  };
}

function plannerSystem(type: string) {
  return `You are PromptBeats Next Song Planner, a multi-song creative planning system.
You act as Creative Director + Project Memory + Diversity Planner + Narrative Continuity Engine.

Core rules:
${SONG_UNIVERSE_PLANNER_BASE_RULES.map((rule) => `- ${rule}`).join("\n")}

Canonical precedence:
1. Explicit current-song instruction.
2. mustRespect / Story Canon.
3. Universe DNA Core constraints.
4. Approved/pinned prior brief fields during regeneration.
5. Soft Planner recommendations.
6. Diversity/saturation suggestions.

For soft repetition, use preferNotToRepeat*. Reserve mustAvoid only for true Universe Things to Avoid, Story Canon implications, or explicit user constraints.
Every meaningful recommendation should be backed by evidence when the supplied context supports it. Never invent counts or facts.
Treat Project Memory as history, not as a template to copy.
For Album, preserve artist identity while actively seeking song-level diversity and portfolio balance.
For Song Series, preserve canon and advance the story to a new event/stage; do not rewrite the same scene or conflict.
For first songs, establish identity without exhausting the entire palette or prematurely resolving a series.
Before returning, compare the proposed direction against existing Projects. If it is essentially the same premise, choose another valid direction.
Return only schema-compliant JSON. Universe type: ${type}.`;
}

function buildPlannerPrompt(input: {
  memory: Awaited<ReturnType<typeof loadSongUniverseProjectMemory>>;
  currentSongIntent: string | null;
  targetRole: string | null;
  targetPosition: number;
  contrastLevel: "low" | "balanced" | "high";
  continuity: Awaited<ReturnType<typeof loadLatestContinuity>>;
  previousBrief: NextSongBrief | null;
  pinnedFields: string[];
  retryReason?: string | null;
}) {
  const strategy = getSongUniverseStrategy(input.memory.universe.universeType);
  const continuity = input.continuity
    ? {
        fresh: input.continuity.fresh,
        note: input.continuity.fresh
          ? "Current continuity analysis; may be used as evidence."
          : "Stale continuity analysis; supplementary only and never authoritative over current Project Memory.",
        analysis: input.continuity.analysis,
      }
    : null;
  return `STRATEGY\n${JSON.stringify({
    version: strategy.version,
    headline: strategy.headline,
    priority: strategy.priority,
    preserve: strategy.preserve,
    diversify: strategy.diversify,
    plannerQuestion: strategy.plannerQuestion,
    narrativeProgressionRequired: strategy.narrativeProgressionRequired,
  })}

CURRENT PLANNING REQUEST\n${JSON.stringify({
    currentSongIntent: input.currentSongIntent,
    targetRole: input.targetRole,
    targetPosition: input.targetPosition,
    currentTrackCount: input.memory.summaries.length,
    plannedTrackCount: input.memory.universe.plannedTrackCount,
    remainingTracks:
      input.memory.universe.plannedTrackCount == null
        ? null
        : Math.max(0, input.memory.universe.plannedTrackCount - input.targetPosition),
    contrastLevel: input.contrastLevel,
    contrastInstruction: contrastInstruction(input.contrastLevel),
    arcDirection: input.memory.universe.arcDirection,
  })}

UNIVERSE DNA\n${JSON.stringify({
    title: input.memory.universe.title,
    description: input.memory.universe.description,
    initialDirection: input.memory.universe.initialDirection,
    creativeBible: input.memory.universe.creativeBible,
    storyBible: input.memory.universe.storyBible,
  })}

PROJECT MEMORY — CANONICAL SUMMARIES\n${JSON.stringify(input.memory.summaries)}

DETERMINISTIC USAGE FACTS\n${JSON.stringify(input.memory.usageProfile)}

DETERMINISTIC PORTFOLIO BALANCE NOTES\n${JSON.stringify(
    deterministicPortfolioBalanceNotes(input.memory.usageProfile),
  )}

SOURCE COMPLETENESS\n${JSON.stringify({
    overall: input.memory.overallCompleteness,
    rule: "Do not make confident claims about dimensions whose source data is missing or sparse.",
  })}

CONTINUITY ANALYSIS\n${JSON.stringify(continuity)}

REGENERATION CONTEXT\n${JSON.stringify({
    previousBrief: input.previousBrief,
    pinnedFields: input.pinnedFields,
    rule:
      input.previousBrief && input.pinnedFields.length
        ? "Copy pinned fields exactly from previousBrief and create a materially alternative valid direction for the remaining fields."
        : input.previousBrief
          ? "Create a materially alternative valid direction; do not merely paraphrase previousBrief."
          : null,
  })}

${input.retryReason ? `DUPLICATE/CONSISTENCY RETRY\n${input.retryReason}\n` : ""}
Produce the most useful next-song direction. Facts must remain facts; recommendations must remain recommendations.`;
}

function applyPinnedFields(
  next: NextSongBrief,
  previous: NextSongBrief | null,
  pinnedFields: string[],
) {
  if (!previous || pinnedFields.length === 0) return next;
  const record = { ...next } as Record<string, unknown>;
  const previousRecord = previous as unknown as Record<string, unknown>;
  for (const field of pinnedFields) {
    if (field in previousRecord) record[field] = previousRecord[field];
  }
  return nextSongBriefSchema.parse(record);
}

function applyCanonicalConstraints(
  brief: NextSongBrief,
  memory: Awaited<ReturnType<typeof loadSongUniverseProjectMemory>>,
) {
  const hard = buildHardConstraints(memory);
  return nextSongBriefSchema.parse({
    ...brief,
    identityToPreserve: uniqueStrings([...hard.identityToPreserve, ...brief.identityToPreserve]),
    mustRespect: uniqueStrings([...hard.mustRespect, ...brief.mustRespect]),
    mustAvoid: uniqueStrings([...hard.mustAvoid, ...brief.mustAvoid]),
    portfolioBalanceNotes: uniqueStrings([
      ...deterministicPortfolioBalanceNotes(memory.usageProfile),
      ...brief.portfolioBalanceNotes,
    ]),
  });
}

function parsePlannerResult(
  value: unknown,
  input: {
    universeType: Awaited<ReturnType<typeof loadSongUniverseProjectMemory>>["universe"]["universeType"];
    strategyVersion: string;
    targetRole: string | null;
    contrastLevel: "low" | "balanced" | "high";
  },
) {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return nextSongBriefSchema.parse({
    ...raw,
    strategyVersion: input.strategyVersion,
    universeType: input.universeType,
    targetRole: input.targetRole,
    contrastLevel: input.contrastLevel,
  });
}

const planInputSchema = z.object({
  universeId: idSchema,
  currentSongIntent: z.string().trim().max(3000).nullable().optional().default(null),
  targetRole: z.string().trim().max(200).nullable().optional().default(null),
  targetPosition: z.number().int().min(0).max(199).nullable().optional().default(null),
  contrastLevel: songUniversePlannerContrastSchema.optional().default("balanced"),
  previousBrief: nextSongBriefSchema.nullable().optional().default(null),
  pinnedFields: z.array(songUniversePlannerEditableFieldSchema).max(20).optional().default([]),
  model: optionalModelSchema,
  requestKey: auxiliaryRequestKeySchema,
});

export const planNextSongUniverseDirection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => planInputSchema.parse(input))
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
        const targetPosition = data.targetPosition ?? memory.summaries.length;
        const contrastLevel = data.contrastLevel ?? memory.universe.plannerContrast;
        const continuity = await loadLatestContinuity(
          context.supabase,
          data.universeId,
          context.userId,
          memory.historyFingerprint,
          memory.historyUpdatedAt,
        );

        let fallback = false;
        let model: string | null = null;
        let provider: string | null = null;
        let modelLabel: string | null = null;
        let brief: NextSongBrief;
        let duplicateRisk: SongUniverseDuplicateRisk = {
          level: "none",
          projectId: null,
          projectTitle: null,
          similarity: null,
          reason: "",
        };

        try {
          const first = await callPlannerModel({
            userId: context.userId,
            requestedModel: data.model ?? null,
            system: plannerSystem(memory.universe.universeType),
            prompt: buildPlannerPrompt({
              memory,
              currentSongIntent: data.currentSongIntent,
              targetRole: data.targetRole,
              targetPosition,
              contrastLevel,
              continuity,
              previousBrief: data.previousBrief,
              pinnedFields: data.pinnedFields,
            }),
            markProviderStarted,
          });
          model = first.model;
          provider = first.provider;
          modelLabel = first.modelLabel;
          brief = parsePlannerResult(first.value, {
            universeType: memory.universe.universeType,
            strategyVersion: strategy.version,
            targetRole: data.targetRole,
            contrastLevel,
          });
          brief = applyPinnedFields(brief, data.previousBrief, data.pinnedFields);
          brief = applyCanonicalConstraints(brief, memory);
          duplicateRisk = detectNearDuplicateDirection(brief, memory.summaries);
          const consistency = validateNextSongBriefConsistency(brief);

          if (duplicateRisk.level === "high" || !consistency.valid) {
            const retryReason = [
              duplicateRisk.level === "high"
                ? `The first direction was too close to ${duplicateRisk.projectTitle ?? "an existing project"}. Create a materially different central premise while preserving identity.`
                : null,
              !consistency.valid
                ? `The first direction had internal conflicts: ${[
                    ...consistency.conflicts,
                    ...consistency.repeatedHardEvent,
                  ].join("; ")}. Resolve them.`
                : null,
            ]
              .filter(Boolean)
              .join(" ");
            const second = await callPlannerModel({
              userId: context.userId,
              requestedModel: data.model ?? null,
              system: plannerSystem(memory.universe.universeType),
              prompt: buildPlannerPrompt({
                memory,
                currentSongIntent: data.currentSongIntent,
                targetRole: data.targetRole,
                targetPosition,
                contrastLevel,
                continuity,
                previousBrief: data.previousBrief,
                pinnedFields: data.pinnedFields,
                retryReason,
              }),
            });
            model = second.model;
            provider = second.provider;
            modelLabel = second.modelLabel;
            brief = parsePlannerResult(second.value, {
              universeType: memory.universe.universeType,
              strategyVersion: strategy.version,
              targetRole: data.targetRole,
              contrastLevel,
            });
            brief = applyPinnedFields(brief, data.previousBrief, data.pinnedFields);
            brief = applyCanonicalConstraints(brief, memory);
            duplicateRisk = detectNearDuplicateDirection(brief, memory.summaries);
            const secondConsistency = validateNextSongBriefConsistency(brief);
            if (!secondConsistency.valid) {
              throw new Error("Planner returned a contradictory direction after retry.");
            }
          }
        } catch (cause) {
          console.error("[song-universe-planner] reduced fallback used", cause);
          fallback = true;
          brief = buildFallbackBrief(memory, {
            targetRole: data.targetRole,
            targetPosition,
            contrastLevel,
            currentSongIntent: data.currentSongIntent,
          });
          duplicateRisk = detectNearDuplicateDirection(brief, memory.summaries);
        }

        const { data: planRow, error: planError } = await (context.supabase as any)
          .from("song_universe_planner_briefs")
          .insert({
            universe_id: data.universeId,
            owner_id: context.userId,
            status: "proposed",
            history_fingerprint: memory.historyFingerprint,
            strategy_version: strategy.version,
            planner_schema_version: PLANNER_SCHEMA_VERSION,
            universe_type: memory.universe.universeType,
            model,
            provider,
            current_song_intent: data.currentSongIntent,
            target_role: data.targetRole,
            target_position: targetPosition,
            planned_track_count: memory.universe.plannedTrackCount,
            contrast_level: contrastLevel,
            source_completeness: memory.overallCompleteness,
            brief,
          })
          .select("id")
          .single();
        if (planError) throw new Error(planError.message);

        return {
          planId: planRow.id as string,
          brief,
          duplicateRisk,
          fallback,
          model,
          provider,
          modelLabel,
          historyFingerprint: memory.historyFingerprint,
          historyUpdatedAt: memory.historyUpdatedAt,
          trackCount: memory.summaries.length,
          plannedTrackCount: memory.universe.plannedTrackCount,
          overallCompleteness: memory.overallCompleteness,
          continuityFresh: continuity?.fresh ?? null,
          plannerSchemaVersion: PLANNER_SCHEMA_VERSION,
        };
      },
    });
  });

const approveInputSchema = z.object({
  universeId: idSchema,
  planId: idSchema,
  brief: nextSongBriefSchema,
});

export const approveSongUniverseNextSongDirection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => approveInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_universe");
    const { data: row, error: rowError } = await (context.supabase as any)
      .from("song_universe_planner_briefs")
      .select("id,universe_id,owner_id,history_fingerprint,strategy_version,planner_schema_version")
      .eq("id", data.planId)
      .eq("universe_id", data.universeId)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    if (!row) throw new Error("Song Universe plan not found.");

    const { error } = await (context.supabase as any)
      .from("song_universe_planner_briefs")
      .update({
        status: "approved",
        brief: data.brief,
        approved_at: new Date().toISOString(),
      })
      .eq("id", data.planId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);

    return {
      ok: true,
      planId: row.id as string,
      historyFingerprint: row.history_fingerprint as string,
      strategyVersion: row.strategy_version as string,
      plannerSchemaVersion: row.planner_schema_version as string,
    };
  });