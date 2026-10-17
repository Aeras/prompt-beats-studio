import { GoogleGenAI } from "@google/genai";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getEffectiveModelAccess, modelCaller, resolveAiModelForUser } from "@/lib/ai-provider.server";
import { recordAiUsage, type NormalizedUsage } from "@/lib/ai-usage.server";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import { stage0DspEvidenceSchema } from "@/lib/song-analyzer-dsp.shared";
import {
  songAnalysisResultSchema,
  type SongAnalysisResult,
  type StageAEvidence,
} from "@/lib/song-analyzer.functions";

const FINAL_ANALYZER_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.1-pro-preview",
  "gpt-audio-1.5",
] as const;

const confidenceSchema = z.enum(["high", "medium", "low"]);

const researchSignalSchema = z.object({
  source: z.string().trim().min(1).max(500),
  claim: z.string().trim().min(1).max(1800),
  reliability: confidenceSchema,
});

const researchResultSchema = z.object({
  identityConfirmed: z.boolean(),
  detectedLanguage: z.string().trim().max(120).nullable(),
  targetMarketOrRegion: z.string().trim().max(160).nullable(),
  styleReferences: z.array(z.string().trim().min(1).max(1000)).max(20),
  tempoReferences: z.array(z.string().trim().min(1).max(1000)).max(12),
  productionOrArrangementNotes: z.array(z.string().trim().min(1).max(1400)).max(20),
  sourceSignals: z.array(researchSignalSchema).max(20),
  discrepancies: z.array(z.string().trim().min(1).max(1400)).max(20),
  notes: z.array(z.string().trim().min(1).max(1400)).max(20),
});

type ResearchResult = z.infer<typeof researchResultSchema> & {
  used: boolean;
  sourceTitles: string[];
  sourceUrls: string[];
  searchQueries: string[];
};

const RESEARCH_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    identityConfirmed: { type: "boolean" },
    detectedLanguage: { type: ["string", "null"] },
    targetMarketOrRegion: { type: ["string", "null"] },
    styleReferences: { type: "array", items: { type: "string" } },
    tempoReferences: { type: "array", items: { type: "string" } },
    productionOrArrangementNotes: { type: "array", items: { type: "string" } },
    sourceSignals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          claim: { type: "string" },
          reliability: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["source", "claim", "reliability"],
      },
    },
    discrepancies: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } },
  },
  required: [
    "identityConfirmed",
    "detectedLanguage",
    "targetMarketOrRegion",
    "styleReferences",
    "tempoReferences",
    "productionOrArrangementNotes",
    "sourceSignals",
    "discrepancies",
    "notes",
  ],
} as const;

const ANALYZER_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    generatorReady: {
      type: "OBJECT",
      properties: {
        musicStyle: { type: "STRING" },
        mood: { type: "STRING" },
        instruments: { type: "ARRAY", items: { type: "STRING" } },
        bpm: {
          type: "OBJECT",
          properties: {
            approximate: { type: "NUMBER", nullable: true },
            rangeMin: { type: "NUMBER", nullable: true },
            rangeMax: { type: "NUMBER", nullable: true },
            confidence: { type: "STRING", enum: ["high", "medium", "low"] },
            notes: { type: "STRING" },
          },
          required: ["approximate", "rangeMin", "rangeMax", "confidence", "notes"],
        },
        songStructure: { type: "ARRAY", items: { type: "STRING" } },
        productionStyle: { type: "STRING" },
        additionalInstructions: { type: "STRING" },
      },
      required: [
        "musicStyle",
        "mood",
        "instruments",
        "bpm",
        "songStructure",
        "productionStyle",
        "additionalInstructions",
      ],
    },
    detailedAnalysis: {
      type: "OBJECT",
      properties: {
        genreAndStyle: { type: "STRING" },
        moodAndEmotionalArc: { type: "STRING" },
        tempoAndGroove: { type: "STRING" },
        instrumentation: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              observation: { type: "STRING" },
              confidence: { type: "STRING", enum: ["high", "medium", "low"] },
            },
            required: ["observation", "confidence"],
          },
        },
        arrangement: { type: "STRING" },
        songStructure: { type: "STRING" },
        vocals: { type: "STRING" },
        productionAndMix: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              observation: { type: "STRING" },
              confidence: { type: "STRING", enum: ["high", "medium", "low"] },
            },
            required: ["observation", "confidence"],
          },
        },
        dynamicsAndEnergy: { type: "STRING" },
        notableCharacteristics: { type: "ARRAY", items: { type: "STRING" } },
        confidenceAndUncertaintyNotes: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: [
        "genreAndStyle",
        "moodAndEmotionalArc",
        "tempoAndGroove",
        "instrumentation",
        "arrangement",
        "songStructure",
        "vocals",
        "productionAndMix",
        "dynamicsAndEnergy",
        "notableCharacteristics",
        "confidenceAndUncertaintyNotes",
      ],
    },
  },
  required: ["generatorReady", "detailedAnalysis"],
};

const FINAL_JUDGE_SYSTEM = `You are PromptBeats Final Music Judge.

You are the LAST interpretation layer of a multi-stage music-analysis pipeline. You do not hear the original audio directly. You receive signal-derived Stage 0 evidence, Stage A audible evidence from the selected audio-analysis model, an evidence-grounded synthesis, and optionally a web-research packet for an exact user-supplied track identity.

AUTHORITY ORDER
1. Direct audio-derived and audible evidence (Stage 0 + Stage A) is primary.
2. The prior evidence-grounded synthesis is a useful interpretation but may contain classification mistakes.
3. External research is secondary context only. It may corroborate or challenge genre/style wording, tempo conventions, release context, credits, or broad production descriptions, but it cannot create an instrument, groove, arrangement event, or production technique that is absent from the audio evidence.
4. Artist identity, nationality, language, popularity, or known catalog style is NEVER sufficient evidence by itself for the analyzed track's style.

FINAL STYLE CLASSIFICATION
- Re-evaluate Music Style from the total evidence instead of copying the previous label.
- Explicitly account for rhythmic/groove family, vocal-delivery family, bass/drum language, harmonic/instrumental surface, arrangement, and production texture.
- Preserve hybrid/crossover identity when two or more families are independently supported.
- A soft, melodic or pop-accessible surface must not erase a materially supported hip-hop/R&B/electronic/rock/folk rhythmic or vocal foundation.
- A prominent guitar must not cause a Pop-Rock/Rock classification unless the broader drum, bass, guitar technique, arrangement and production evidence actually support a rock family.
- Speech-like, rap-like or sing-rap-like phrasing plus a compatible syncopated/programmed pocket and bass language must trigger an explicit evaluation of a hip-hop-derived family.
- Do NOT require overt rapping, aggressive 808s, trap hats, or a stereotypical hip-hop beat before acknowledging a broad hip-hop-derived crossover. Melodic alternative hip-hop can use intimate sung/sing-rap delivery, acoustic guitar or electric piano, restrained programmed percussion, sustained/sub bass, ambient pads, and pop-accessible choruses.
- Conversely, conversational singing plus a generic backbeat is NOT sufficient by itself. A hip-hop-derived family still requires multiple independent supporting cues from vocal rhythmic placement, programmed/syncopated drums, bass behavior, arrangement, or production.
- When those cues materially support both a singer-songwriter/pop surface and a hip-hop-derived rhythmic/vocal foundation, preserve the crossover explicitly instead of collapsing it to only indie/acoustic pop.
- Prefer a broad accurate hybrid label over a narrow speculative subgenre.

GENRE EVIDENCE QUORUM
- BPM or a fast subdivision grid is NEVER sufficient by itself to establish a genre family. A measured 170-180 BPM grid may coexist with an 85-90 BPM felt pulse and must not automatically imply drum & bass, jungle, punk, double-time hip-hop, or any other high-BPM family.
- When Stage 0 reports half/double-time ambiguity, treat both pulse interpretations as valid candidates until the musical evidence resolves the feel. Use vocal phrasing, bass phrasing, harmonic rhythm, backbeat placement, kick pattern, and arrangement to decide which pulse is musically primary.
- Before selecting a narrow rhythm-defined style or subgenre, require corroboration from at least THREE independent evidence families among: drum-pattern language, bass behavior, vocal phrasing/delivery, harmonic rhythm/instrumental texture, arrangement, and production/mix. At least one supporting family must be drums or bass, and at least one must come from vocal/harmonic/arrangement/production evidence rather than tempo alone.
- The quorum governs NARROW rhythm-defined labels; it must not be misused to erase a broader hybrid family when several independent cues support that family but no narrow subgenre is secure.
- If a narrow label is supported mainly by tempo plus one uncertain timbral interpretation, reject the narrow label and fall back to a broader accurate family/crossover description.
- If independent passes materially disagree on a genre-driving fact such as felt tempo, drum source/pattern, bass source, or guitar-vs-synth pluck identity, surface the disagreement and prefer a broader style label until the evidence converges.

INSTRUMENT SOURCE DISCIPLINE
- Preserve an ambiguous instrument hypothesis when the audio evidence supports a recurring musical role but not a secure source identity. Use labels such as rhythmic plucked layer or plucked string instrument rather than silently converting a guitar-like part into a synth, or a synth-like part into a guitar.
- A source-neutral resolver result is stronger than a speculative first-pass source label, but uncertain/mixed resolver outcomes are NOT permission to erase a plausible recurring layer.
- Instrument source uncertainty must not be used as genre evidence. For example, a clean rhythmic guitar can exist inside pop/R&B/electronic production without implying rock; a synth pluck can exist without implying EDM.
- Preserve the most specific verified playing technique separately from source identity. If guitar identity is confirmed while fingerpicking/arpeggiation is already supported, do not rewrite that technique as generic strumming/comping.
- When Stage A independently verifies Rhodes, Wurlitzer, acoustic piano or synth keys from direct timbral cues, preserve that keyboard family in the final instrumentation and generator blueprint rather than flattening it to a generic pad/keys label.

MICRO-PRODUCTION DISCIPLINE
- Preserve directly verified subtle production cues such as tape saturation, vinyl crackle, low-pass-filtered guitar or distant electric-guitar swells when Stage A reports them.
- Do not invent these cues from mood, warmth, lo-fi vocabulary or genre expectations.
- Small but defining production cues may belong in Production Style or Additional Instructions even when they are not dominant instruments.

WEB RESEARCH RULES
- Use web evidence only when exact identity was confirmed.
- Treat regional/local sources as useful context, not automatic truth.
- Prefer agreement across independent reliable sources.
- If web references conflict with the audio evidence, preserve the conflict in confidence/uncertainty notes and keep the audio evidence authoritative.

GENERATOR BLUEPRINT
The generatorReady fields must describe HOW to recreate the same broad musical identity without copying protected expression.
- Preserve groove, rhythmic feel, arrangement density, instrument roles, energy arc, vocal-delivery family and production character when supported.
- Preserve verified keyboard-family identity and subtle production texture when they materially define the sound.
- Do not reproduce lyrics, melody, hooks, exact riffs, exact chord progressions, artist names, song titles, or distinctive protected expression.
- Do not put artist or track names into generatorReady fields.
- Use Additional Instructions for defining musical DNA that does not fit cleanly in the other fields.

EVIDENCE DISCIPLINE
Every specific musical claim must be traceable to Stage A, Stage 0 where appropriate, or a clearly identified external reference that does not contradict the audio evidence.
If uncertain, say so and lower confidence rather than inventing precision.

Return only the canonical PromptBeats Analyzer JSON schema.`;

function normalizedGeminiUsage(payload: any): NormalizedUsage | null {
  const usage = payload?.usageMetadata;
  if (!usage) return null;
  const inputTokens = usage.promptTokenCount ?? null;
  const outputTokens =
    usage.candidatesTokenCount == null && usage.thoughtsTokenCount == null
      ? null
      : (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  const totalTokens =
    usage.totalTokenCount ??
    (inputTokens == null && outputTokens == null ? null : (inputTokens ?? 0) + (outputTokens ?? 0));
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens: usage.cachedContentTokenCount ?? null,
    reasoningTokens: usage.thoughtsTokenCount ?? null,
  };
}

function cleanJsonText(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return trimmed;
}

function parseResearch(text: string) {
  return researchResultSchema.parse(JSON.parse(cleanJsonText(text)));
}

function preserveAudioMeasuredFields(
  finalResult: SongAnalysisResult,
  initialResult: SongAnalysisResult,
): SongAnalysisResult {
  return {
    ...finalResult,
    generatorReady: {
      ...finalResult.generatorReady,
      instruments: initialResult.generatorReady.instruments,
      bpm: initialResult.generatorReady.bpm,
      songStructure: initialResult.generatorReady.songStructure,
    },
  };
}

function buildInterpretationGuardPacket(
  stage0Evidence: z.infer<typeof stage0DspEvidenceSchema>,
  stageAEvidence: StageAEvidence,
) {
  const notes = stageAEvidence.uncertaintyNotes ?? [];
  const sourceResolverNotes = notes.filter((note) => /neutral source resolver|guitar guard|keyboard-family|micro-production|source-family|source identity/i.test(note));
  const stabilityConflicts = notes.filter((note) => /stability guard|contradicted|disagree/i.test(note));
  const stage0Tempo = stage0Evidence.tempo;
  return {
    tempoAmbiguous: Boolean(stage0Tempo?.ambiguous),
    stage0PrimaryBpm: stage0Tempo?.primaryBpm ?? null,
    stage0HalfTimeCandidate: stage0Tempo?.halfTimeCandidate ?? null,
    stage0DoubleTimeCandidate: stage0Tempo?.doubleTimeCandidate ?? null,
    stageAFeltTempo: stageAEvidence.tempo.feltTempo,
    stageATempoConfidence: stageAEvidence.tempo.confidence,
    sourceResolverNotes: sourceResolverNotes.slice(0, 10),
    stabilityConflicts: stabilityConflicts.slice(0, 8),
    instruction: "Do not let BPM alone choose a genre. Narrow rhythm-defined labels require the genre evidence quorum, but the quorum must not erase a broader hybrid family supported by multiple independent cues. Preserve verified guitar technique, keyboard-family details, micro-production cues, and unresolved source alternatives.",
  };
}

async function runRegionalResearch(args: {
  userId: string;
  model: (typeof FINAL_ANALYZER_MODELS)[number];
  trackTitle: string;
  artist: string;
  initialResult: SongAnalysisResult;
  stageAEvidence: StageAEvidence;
}): Promise<ResearchResult> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("Gemini API is not configured");

  const prompt = `You are the PromptBeats regional music research router.

EXACT USER-SUPPLIED IDENTITY
Track Title: ${args.trackTitle}
Artist: ${args.artist}

PREVIOUS AUDIO ANALYSIS
${JSON.stringify(args.initialResult)}

STAGE A VOCAL / MUSICAL EVIDENCE
${JSON.stringify({
  vocalCharacteristics: args.stageAEvidence.vocalCharacteristics,
  dominantRhythmicPulse: args.stageAEvidence.dominantRhythmicPulse,
  tempo: args.stageAEvidence.tempo,
  dominantElements: args.stageAEvidence.dominantElements,
})}

GOAL
Research the exact artist + track only. Determine whether the identity is confidently confirmed and gather external reference signals that can help a later Final Music Judge cross-check broad style, tempo conventions, production/arrangement descriptions, credits and release context.

REGIONAL SEARCH ROUTING
- Detect likely language/script/market from the exact title, artist and supplied vocal evidence. Do not infer nationality from sound alone.
- Search in the ORIGINAL script/language as well as internationally when useful.
- For Russian/Cyrillic or clearly Russian-language/market material, deliberately include at least one exact-identity query constrained to site:dzen.ru, plus broader Russian-language exact-identity queries and at least one independent non-Dzen cross-check. Dzen is regional context, never the sole authority.
- For Greek material, use Greek-script queries and relevant Greek sources plus an international cross-check where available.
- For other markets, prefer useful local-language/regional sources in the original script plus reliable international/official references.
- Prefer official artist/label pages, reputable music databases, streaming/release metadata, credits, interviews and credible music journalism.
- Treat SEO pages, autogenerated BPM/chord pages, reposts and unsourced claims as weak evidence.
- Never assume the artist's usual genre is the genre of this exact track.
- If exact identity is ambiguous or cannot be confirmed, set identityConfirmed=false and keep claims cautious.

Return only the requested structured JSON.`;

  const ai = new GoogleGenAI({ apiKey });
  let usage: NormalizedUsage | null = null;
  let success = false;
  try {
    const response = await ai.models.generateContent({
      model: args.model,
      contents: prompt,
      config: {
        abortSignal: AbortSignal.timeout(5 * 60 * 1000),
        httpOptions: { timeout: 5 * 60 * 1000 },
        tools: [{ googleSearch: {} }],
        responseFormat: {
          text: { mimeType: "application/json", schema: RESEARCH_RESPONSE_SCHEMA },
        },
        temperature: 0.1,
      } as any,
    });

    usage = normalizedGeminiUsage(response as any);
    const text = String((response as any).text ?? "").trim();
    if (!text) throw new Error("Regional research returned no structured result");
    const parsed = parseResearch(text);

    const metadata = (response as any)?.candidates?.[0]?.groundingMetadata ?? {};
    const chunks = (metadata?.groundingChunks ?? []) as any[];
    const sources = new Map<string, string>();
    for (const chunk of chunks) {
      const uri = chunk?.web?.uri;
      const title = chunk?.web?.title;
      if (typeof uri === "string" && uri) {
        sources.set(uri, typeof title === "string" && title ? title : uri);
      }
    }
    const searchQueries = Array.isArray(metadata?.webSearchQueries)
      ? metadata.webSearchQueries.filter((value: unknown): value is string => typeof value === "string")
      : [];

    success = true;
    return {
      ...parsed,
      used: parsed.identityConfirmed && sources.size > 0,
      sourceTitles: [...sources.values()].slice(0, 20),
      sourceUrls: [...sources.keys()].slice(0, 20),
      searchQueries: searchQueries.slice(0, 20),
    };
  } finally {
    await recordAiUsage({
      userId: args.userId,
      provider: "gemini",
      model: args.model,
      operation: "song_analysis",
      usage,
      success,
    });
  }
}

async function resolveFinalModel(userId: string, requestedModel?: string | null) {
  const access = await getEffectiveModelAccess(userId, "ai_tools");
  const selectedId = requestedModel?.trim() || access.defaultModel;
  const option = access.modelOptions.find((candidate) => candidate.id === selectedId);
  if (!option) throw new Error("That final-analysis model is not available for this account.");
  const resolved = await resolveAiModelForUser(userId, "ai_tools", selectedId);
  return { ...resolved, label: option.label };
}

async function runFinalJudge(args: {
  userId: string;
  requestedModel?: string | null;
  initialResult: SongAnalysisResult;
  stage0Evidence: z.infer<typeof stage0DspEvidenceSchema>;
  stageAEvidence: StageAEvidence;
  research: ResearchResult | null;
  trackTitle?: string;
  artist?: string;
}) {
  const selected = await resolveFinalModel(args.userId, args.requestedModel);
  const caller = modelCaller(selected.model, selected.provider);
  const interpretationGuardPacket = buildInterpretationGuardPacket(args.stage0Evidence, args.stageAEvidence);
  const prompt = [
    "STAGE 0 SIGNAL-DERIVED EVIDENCE:",
    JSON.stringify(args.stage0Evidence),
    "\nSTAGE A AUDIBLE EVIDENCE:",
    JSON.stringify(args.stageAEvidence),
    "\nDETERMINISTIC INTERPRETATION GUARD PACKET:",
    JSON.stringify(interpretationGuardPacket),
    "\nEVIDENCE-GROUNDED SYNTHESIS TO RE-EVALUATE:",
    JSON.stringify(args.initialResult),
    args.trackTitle && args.artist
      ? `\nUSER-SUPPLIED IDENTITY (context only):\nTrack Title: ${args.trackTitle}\nArtist: ${args.artist}`
      : "",
    args.research
      ? "\nREGIONAL / WEB RESEARCH PACKET (secondary context only):\n" + JSON.stringify(args.research)
      : "\nNO EXTERNAL RESEARCH PACKET WAS AVAILABLE.",
    "\nProduce the final canonical PromptBeats Analyzer JSON. Re-evaluate the style classification instead of merely paraphrasing the prior synthesis. Apply the genre evidence quorum before selecting a narrow rhythm-defined label, preserve a broader hybrid family when independently supported, and retain verified keyboard/production details.",
  ]
    .filter(Boolean)
    .join("\n");

  let usage: NormalizedUsage | null = null;
  let actualProvider = selected.provider;
  let actualModel = selected.model;
  let success = false;
  try {
    const response = await caller({
      system: FINAL_JUDGE_SYSTEM,
      prompt,
      schema: ANALYZER_RESPONSE_SCHEMA,
      maxTokens: 8192,
      ...(selected.reasoningEffort ? { reasoningEffort: selected.reasoningEffort } : {}),
    });
    usage = response.usage;
    actualProvider = response.provider;
    actualModel = response.model;
    if (response.stopReason === "max_tokens") {
      throw new Error("The final Analyzer response was incomplete. Please retry.");
    }
    const parsed = songAnalysisResultSchema.parse(JSON.parse(cleanJsonText(response.text)));
    success = true;
    return {
      result: preserveAudioMeasuredFields(parsed, args.initialResult),
      model: response.model,
      provider: response.provider,
      modelLabel: selected.label,
    };
  } finally {
    await recordAiUsage({
      userId: args.userId,
      provider: actualProvider,
      model: actualModel,
      operation: "song_analysis",
      usage,
      success,
    });
  }
}

const finalizeInput = z.object({
  initialResult: songAnalysisResultSchema,
  stage0Evidence: stage0DspEvidenceSchema,
  stageAEvidence: z.unknown(),
  audioAnalysisModel: z.enum(FINAL_ANALYZER_MODELS),
  finalModel: z.string().trim().min(1).max(240).optional(),
  trackTitle: z.string().trim().min(1).max(200).optional(),
  artist: z.string().trim().min(1).max(200).optional(),
});

export const getSongAnalyzerFinalModelAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFeatureAccess(context.supabase, "song_analyzer");
    const access = await getEffectiveModelAccess(context.userId, "ai_tools");
    return {
      defaultModel: access.defaultModel,
      modelOptions: access.modelOptions,
    };
  });

export const finalizeSongAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => finalizeInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_analyzer");

    const serializedStageA = JSON.stringify(data.stageAEvidence);
    if (serializedStageA.length > 160_000) throw new Error("Analyzer evidence payload is too large.");
    const stageAEvidence = data.stageAEvidence as StageAEvidence;

    const trackTitle = data.trackTitle?.trim();
    const artist = data.artist?.trim();
    let research: ResearchResult | null = null;

    if (trackTitle && artist) {
      try {
        const researchModel =
          data.audioAnalysisModel === "gpt-audio-1.5"
            ? "gemini-3.8-flash"
            : data.audioAnalysisModel;
        research = await runRegionalResearch({
          userId: context.userId,
          model: researchModel,
          trackTitle,
          artist,
          initialResult: data.initialResult,
          stageAEvidence,
        });
      } catch (error) {
        console.warn("[song-analyzer-final] regional research failed; continuing without it", {
          model: data.audioAnalysisModel,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const final = await runFinalJudge({
      userId: context.userId,
      requestedModel: data.finalModel ?? null,
      initialResult: data.initialResult,
      stage0Evidence: data.stage0Evidence,
      stageAEvidence,
      research,
      trackTitle: trackTitle ?? "",
      artist: artist ?? "",
    });

    return {
      result: final.result,
      finalModel: final.model,
      finalProvider: final.provider,
      finalModelLabel: final.modelLabel,
      research,
    };
  });