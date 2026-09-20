import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordAiUsage } from "@/lib/ai-usage.server";
import { modelCaller } from "@/lib/ai-provider.server";
import { stage0DspEvidenceSchema, type Stage0DspEvidence } from "@/lib/song-analyzer-dsp.shared";

export const SONG_ANALYZER_MODELS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", provider: "gemini" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", provider: "gemini" },
  { id: "voxtral-small-latest", label: "Voxtral Small", provider: "mistral" },
] as const;

type SongAnalyzerModelId = (typeof SONG_ANALYZER_MODELS)[number]["id"];
type SongAnalyzerProvider = (typeof SONG_ANALYZER_MODELS)[number]["provider"];

function analyzerProvider(model: string): SongAnalyzerProvider {
  return SONG_ANALYZER_MODELS.find((item) => item.id === model)?.provider ?? "gemini";
}

export const DEFAULT_SONG_ANALYZER_MODEL = "gemini-3.8-flash";
export const SONG_ANALYZER_MAX_FILE_BYTES = 15 * 1024 * 1024;

const supportedMimeTypes = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
] as const;

const confidenceSchema = z.enum(["high", "medium", "low"]);

const bpmSchema = z.object({
  approximate: z.number().min(20).max(300).nullable(),
  rangeMin: z.number().min(20).max(300).nullable(),
  rangeMax: z.number().min(20).max(300).nullable(),
  confidence: confidenceSchema,
  notes: z.string().trim().max(1000),
}).superRefine((value, ctx) => {
  if (value.rangeMin != null && value.rangeMax != null && value.rangeMin > value.rangeMax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid BPM range" });
  }
});

const uncertainObservationSchema = z.object({
  observation: z.string().trim().min(1).max(2000),
  confidence: confidenceSchema,
});

export const songAnalysisResultSchema = z.object({
  generatorReady: z.object({
    musicStyle: z.string().trim().min(1).max(4000),
    mood: z.string().trim().min(1).max(2000),
    instruments: z.array(z.string().trim().min(1).max(1000)).max(30),
    bpm: bpmSchema,
    songStructure: z.array(z.string().trim().min(1).max(120)).min(1).max(30),
    productionStyle: z.string().trim().min(1).max(4000),
    additionalInstructions: z.string().trim().max(4000),
  }),
  detailedAnalysis: z.object({
    genreAndStyle: z.string().trim().min(1).max(5000),
    moodAndEmotionalArc: z.string().trim().min(1).max(5000),
    tempoAndGroove: z.string().trim().min(1).max(5000),
    instrumentation: z.array(uncertainObservationSchema).max(40),
    arrangement: z.string().trim().min(1).max(6000),
    songStructure: z.string().trim().min(1).max(5000),
    vocals: z.string().trim().min(1).max(5000),
    productionAndMix: z.array(uncertainObservationSchema).max(40),
    dynamicsAndEnergy: z.string().trim().min(1).max(5000),
    notableCharacteristics: z.array(z.string().trim().min(1).max(2000)).max(30),
    confidenceAndUncertaintyNotes: z.array(z.string().trim().min(1).max(2000)).max(30),
  }),
});

export type SongAnalysisResult = z.infer<typeof songAnalysisResultSchema>;

const evidenceClaimSchema = z.object({
  claim: z.string().trim().min(1).max(1200),
  evidence: z.string().trim().min(1).max(2000),
  confidence: confidenceSchema,
});

const dominantElementSchema = z.object({
  category: z.enum(["instrument", "groove", "texture", "melodic_figure", "other"]),
  element: z.string().trim().min(1).max(500),
  role: z.string().trim().min(1).max(1000),
  technique: z.string().trim().max(500).nullable(),
  prominence: z.enum(["dominant", "major", "supporting"]),
  confidence: confidenceSchema,
  evidence: z.string().trim().min(1).max(2000),
});

const instrumentEvidenceSchema = z.object({
  instrument: z.string().trim().min(1).max(500),
  role: z.string().trim().min(1).max(1000),
  technique: z.string().trim().max(500).nullable(),
  timbre: z.string().trim().max(500).nullable(),
  prominence: z.enum(["dominant", "major", "supporting"]),
  confidence: confidenceSchema,
  evidence: z.string().trim().min(1).max(2000),
});

const stageAEvidenceSchema = z.object({
  dominantRhythmicPulse: z.object({
    observation: z.string().trim().min(1).max(1500),
    evidence: z.string().trim().min(1).max(2000),
    confidence: confidenceSchema,
  }),
  tempo: z.object({
    gridCandidates: z.array(z.number().min(20).max(300)).min(1).max(6),
    feltTempo: z.number().min(20).max(300).nullable(),
    possibleHalfTime: z.number().min(20).max(300).nullable(),
    possibleDoubleTime: z.number().min(20).max(300).nullable(),
    confidence: confidenceSchema,
    kickEvidence: z.string().trim().max(1500),
    backbeatEvidence: z.string().trim().max(1500),
    bassPhrasing: z.string().trim().max(1500),
    vocalPhrasing: z.string().trim().max(1500),
    harmonicRhythm: z.string().trim().max(1500),
    notes: z.string().trim().max(2500),
  }),
  drumPercussionEvidence: z.array(evidenceClaimSchema).max(30),
  bassEvidence: z.array(evidenceClaimSchema).max(20),
  harmonicFoundation: z.array(evidenceClaimSchema).max(20),
  dominantElements: z.array(dominantElementSchema).min(3).max(5),
  instrumentEvidence: z.array(instrumentEvidenceSchema).max(30),
  melodicElements: z.array(evidenceClaimSchema).max(20),
  vocalCharacteristics: z.array(evidenceClaimSchema).max(20),
  arrangementChanges: z.array(evidenceClaimSchema).max(30),
  songSections: z.array(z.object({
    label: z.string().trim().min(1).max(120),
    evidence: z.string().trim().min(1).max(1500),
    confidence: confidenceSchema,
  })).min(1).max(30),
  energyProgression: z.array(evidenceClaimSchema).max(20),
  productionMixEvidence: z.array(evidenceClaimSchema).max(30),
  uncertaintyNotes: z.array(z.string().trim().min(1).max(2000)).max(30),
});

export type StageAEvidence = z.infer<typeof stageAEvidenceSchema>;

const EVIDENCE_EXTRACTION_SYSTEM_PROMPT = `
You are PromptBeats Stage A: RAW AUDIO EVIDENCE EXTRACTOR.

Your only job is to listen to the supplied audio and return structured AUDIBLE EVIDENCE.
You are NOT allowed to classify genre, subgenre, scene, era, or style family.

FORBIDDEN IN STAGE A
Do not output labels such as Dance-Pop, Pop-Rock, Slap House, Nu-Disco, Pop-Punk, R&B, EDM, Indie Pop, Club-Pop, or any other genre/style classification.
Do not complete the description from genre expectations.
Do not identify the song or artist from filename, metadata, lyrics, melody, or memory.
Do not transcribe lyrics.

EVIDENCE-FIRST RULE
Every important musical claim must be tied to something actually audible.
If uncertain, lower confidence and describe the uncertainty.

QUANTITATIVE DSP REFERENCE
A deterministic Stage 0 DSP object is supplied with the audio.
Treat Stage 0 as supporting signal-derived evidence, NOT as ground truth and never as a genre cue.
Cross-check its tempo candidate, half/double-time candidates, stability, onset activity, energy curve, tonal estimate, and spectral metrics against what you actually hear.
If auditory evidence strongly disagrees with DSP:
- do not blindly follow DSP;
- explicitly note the disagreement;
- lower confidence where appropriate;
- consider half-time/double-time ambiguity;
- prefer interpretations supported by multiple independent musical signals.
DSP disagreement is useful evidence; it is not automatically an LLM error.
Weak key/chroma evidence must not influence genre.
An energy rise must not automatically be labeled as a chorus, build, or drop.

You must observe:
1. dominant rhythmic pulse
2. tempo candidates
3. perceived/felt tempo
4. drum/percussion evidence
5. bass evidence
6. harmonic foundation
7. dominant instruments
8. instrument playing techniques
9. melodic elements
10. vocal characteristics
11. arrangement changes
12. song sections
13. energy progression
14. production/mix evidence
15. uncertainty notes

DOMINANT ELEMENTS
Return exactly 3–5 most defining audible musical elements.
These are the elements that most strongly define rhythmic, harmonic, arrangement, emotional, or sonic identity.
For each, state element, role, technique if clearly audible, prominence, confidence, and short evidence.
A clearly dominant guitar strumming pattern, piano ostinato, bass riff, drum groove, synth figure, string motif, or percussion pattern must not disappear.

TEMPO EVIDENCE
Do not return only one BPM.
Return grid candidates, felt/perceived tempo, possible half-time, possible double-time, confidence, and evidence from kick, backbeat, bass phrasing, vocal phrasing, and harmonic rhythm.
HIGH confidence is allowed only when these signals converge.

CLAIM-GROUNDING RULES
- "four-on-the-floor" only if a kick is clearly and consistently audible on all four quarter-note beats over sustained sections.
- "sidechain pumping" only if repeated audible ducking is clearly heard.
- "synth bass" only if bass timbre is clearly synthetic.
- "acoustic/electric guitar strumming" only if audible.
- "power chords" only if audible.
- "guitar solo" only if audible.
- Do not infer any of these from genre expectation.

INSTRUMENTS / VOCALS / FX
Keep musical instruments separate from vocals and production effects.
Instrument evidence must describe instrument, role, audible technique where clear, timbre where clear, prominence, confidence, and evidence.
Do not invent playing technique or instrument type.

PRODUCTION
Only report production/mix features that are directly audible.
Do not infer club-ready mix, EDM drop, sidechain, filter sweep, riser, synth hook, or similar terms from polish or modernity alone.

Return only the structured JSON requested by the schema.
`.trim();

const ANALYZER_SYSTEM_PROMPT = `
You are PromptBeats Stage B: MUSICAL INTERPRETATION / GENERATOR-READY SYNTHESIS.

You do NOT receive the source audio.
You receive only structured Stage A audio evidence.

STRICT AUTHORITY RULE
Stage A evidence is the complete musical evidence boundary.
You MUST NOT introduce any specific musical claim that is absent from Stage A.

You may interpret and summarize evidence, but you may NOT invent:
- a new instrument
- a new playing technique
- a new drum pattern
- a new production effect
- a new groove claim
- a new tempo interpretation
- a new arrangement event

If Stage A does not mention sidechain, Stage B cannot mention sidechain.
If Stage A does not mention synth bass, Stage B cannot mention synth bass.
If Stage A marks acoustic guitar strumming as dominant, Stage B must preserve it prominently.

GENRE / STYLE
Classify only after considering the total Stage A evidence:
- groove
- felt tempo
- drum/percussion evidence
- bass evidence
- harmonic foundation
- dominant instruments
- playing techniques
- vocals
- arrangement
- production evidence

If evidence does not support a narrow genre, use a broader accurate label.
Broad accuracy is better than narrow speculation.
A polished or electronic element does not automatically justify Dance-Pop, EDM, Club-Pop, Slap House, Nu-Disco, or another club-oriented label.

GENERATOR-READY INSTRUMENTS
Generator-ready Instruments must be derived directly from Stage A instrument evidence.
Do not include vocals, FX, risers, sweeps, reverb, delay, sidechain, white noise, compression, or transition effects.
Preserve dominant instruments and defining playing techniques.

BPM
Choose ONE generator-ready BPM value.
Prefer Stage A felt/perceived tempo when it is musically representative.
If grid and felt tempo differ, keep the ambiguity in notes.
BPM confidence cannot exceed Stage A tempo confidence.
If meaningful half/double-time ambiguity exists, confidence cannot be HIGH.

PRODUCTION CLAIMS
Production Style may use only production/mix claims present in Stage A evidence.
Do not add stereotypical club/EDM language.

FINAL CONSISTENCY GATE
Before returning:
1. Compare every Generator-ready field against Stage A evidence.
2. Remove any unsupported claim.
3. Restore any missing dominant element.
4. Broaden Music Style if it requires evidence not present in Stage A.
5. Lower BPM confidence if it exceeds Stage A evidence.
6. Ensure the result belongs to the same broad musical family implied by the evidence.

Do not reproduce lyrics, melodies, hooks, or protected expression.
Return only the existing canonical Analyzer JSON schema.
`.trim();

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
      required: ["musicStyle", "mood", "instruments", "bpm", "songStructure", "productionStyle", "additionalInstructions"],
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

const EVIDENCE_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    dominantRhythmicPulse: {
      type: "OBJECT",
      properties: {
        observation: { type: "STRING" },
        evidence: { type: "STRING" },
        confidence: { type: "STRING", enum: ["high", "medium", "low"] },
      },
      required: ["observation", "evidence", "confidence"],
    },
    tempo: {
      type: "OBJECT",
      properties: {
        gridCandidates: { type: "ARRAY", items: { type: "NUMBER" } },
        feltTempo: { type: "NUMBER", nullable: true },
        possibleHalfTime: { type: "NUMBER", nullable: true },
        possibleDoubleTime: { type: "NUMBER", nullable: true },
        confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        kickEvidence: { type: "STRING" },
        backbeatEvidence: { type: "STRING" },
        bassPhrasing: { type: "STRING" },
        vocalPhrasing: { type: "STRING" },
        harmonicRhythm: { type: "STRING" },
        notes: { type: "STRING" },
      },
      required: ["gridCandidates","feltTempo","possibleHalfTime","possibleDoubleTime","confidence","kickEvidence","backbeatEvidence","bassPhrasing","vocalPhrasing","harmonicRhythm","notes"],
    },
    drumPercussionEvidence: { type: "ARRAY", items: { type: "OBJECT", properties: { claim: { type: "STRING" }, evidence: { type: "STRING" }, confidence: { type: "STRING", enum: ["high","medium","low"] } }, required: ["claim","evidence","confidence"] } },
    bassEvidence: { type: "ARRAY", items: { type: "OBJECT", properties: { claim: { type: "STRING" }, evidence: { type: "STRING" }, confidence: { type: "STRING", enum: ["high","medium","low"] } }, required: ["claim","evidence","confidence"] } },
    harmonicFoundation: { type: "ARRAY", items: { type: "OBJECT", properties: { claim: { type: "STRING" }, evidence: { type: "STRING" }, confidence: { type: "STRING", enum: ["high","medium","low"] } }, required: ["claim","evidence","confidence"] } },
    dominantElements: { type: "ARRAY", items: { type: "OBJECT", properties: {
      category: { type: "STRING", enum: ["instrument","groove","texture","melodic_figure","other"] },
      element: { type: "STRING" }, role: { type: "STRING" }, technique: { type: "STRING", nullable: true },
      prominence: { type: "STRING", enum: ["dominant","major","supporting"] },
      confidence: { type: "STRING", enum: ["high","medium","low"] }, evidence: { type: "STRING" }
    }, required: ["category","element","role","technique","prominence","confidence","evidence"] } },
    instrumentEvidence: { type: "ARRAY", items: { type: "OBJECT", properties: {
      instrument: { type: "STRING" }, role: { type: "STRING" }, technique: { type: "STRING", nullable: true },
      timbre: { type: "STRING", nullable: true }, prominence: { type: "STRING", enum: ["dominant","major","supporting"] },
      confidence: { type: "STRING", enum: ["high","medium","low"] }, evidence: { type: "STRING" }
    }, required: ["instrument","role","technique","timbre","prominence","confidence","evidence"] } },
    melodicElements: { type: "ARRAY", items: { type: "OBJECT", properties: { claim: { type: "STRING" }, evidence: { type: "STRING" }, confidence: { type: "STRING", enum: ["high","medium","low"] } }, required: ["claim","evidence","confidence"] } },
    vocalCharacteristics: { type: "ARRAY", items: { type: "OBJECT", properties: { claim: { type: "STRING" }, evidence: { type: "STRING" }, confidence: { type: "STRING", enum: ["high","medium","low"] } }, required: ["claim","evidence","confidence"] } },
    arrangementChanges: { type: "ARRAY", items: { type: "OBJECT", properties: { claim: { type: "STRING" }, evidence: { type: "STRING" }, confidence: { type: "STRING", enum: ["high","medium","low"] } }, required: ["claim","evidence","confidence"] } },
    songSections: { type: "ARRAY", items: { type: "OBJECT", properties: { label: { type: "STRING" }, evidence: { type: "STRING" }, confidence: { type: "STRING", enum: ["high","medium","low"] } }, required: ["label","evidence","confidence"] } },
    energyProgression: { type: "ARRAY", items: { type: "OBJECT", properties: { claim: { type: "STRING" }, evidence: { type: "STRING" }, confidence: { type: "STRING", enum: ["high","medium","low"] } }, required: ["claim","evidence","confidence"] } },
    productionMixEvidence: { type: "ARRAY", items: { type: "OBJECT", properties: { claim: { type: "STRING" }, evidence: { type: "STRING" }, confidence: { type: "STRING", enum: ["high","medium","low"] } }, required: ["claim","evidence","confidence"] } },
    uncertaintyNotes: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["dominantRhythmicPulse","tempo","drumPercussionEvidence","bassEvidence","harmonicFoundation","dominantElements","instrumentEvidence","melodicElements","vocalCharacteristics","arrangementChanges","songSections","energyProgression","productionMixEvidence","uncertaintyNotes"],
};

const externalValidationSchema = z.object({
  identityConfirmed: z.boolean(),
  styleAgreement: z.enum(["strong", "partial", "weak", "conflicting"]),
  tempoAgreement: z.enum(["strong", "partial", "weak", "conflicting"]),
  referenceStyles: z.array(z.string().trim().min(1).max(500)).max(12),
  referenceTempos: z.array(z.string().trim().min(1).max(300)).max(12),
  instrumentationCredits: z.array(z.string().trim().min(1).max(1000)).max(20),
  keyOrChordReferences: z.array(z.string().trim().min(1).max(1000)).max(20),
  productionOrArrangementNotes: z.array(z.string().trim().min(1).max(1000)).max(20),
  releaseContext: z.array(z.string().trim().min(1).max(1000)).max(20),
  discrepancies: z.array(z.string().trim().min(1).max(1500)).max(20),
  notes: z.array(z.string().trim().min(1).max(1500)).max(20),
});

type ExternalValidation = z.infer<typeof externalValidationSchema> & {
  used: boolean;
  supportingSourcesCount: number;
  sourceTitles: string[];
};

const EXTERNAL_VALIDATION_RESPONSE_FORMAT = {
  type: "object",
  properties: {
    identityConfirmed: { type: "boolean" },
    styleAgreement: { type: "string", enum: ["strong", "partial", "weak", "conflicting"] },
    tempoAgreement: { type: "string", enum: ["strong", "partial", "weak", "conflicting"] },
    referenceStyles: { type: "array", items: { type: "string" } },
    referenceTempos: { type: "array", items: { type: "string" } },
    instrumentationCredits: { type: "array", items: { type: "string" } },
    keyOrChordReferences: { type: "array", items: { type: "string" } },
    productionOrArrangementNotes: { type: "array", items: { type: "string" } },
    releaseContext: { type: "array", items: { type: "string" } },
    discrepancies: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["identityConfirmed","styleAgreement","tempoAgreement","referenceStyles","referenceTempos","instrumentationCredits","keyOrChordReferences","productionOrArrangementNotes","releaseContext","discrepancies","notes"],
} as const;

async function requireAdmin(context: { supabase: any }) {
  const { data: isAdmin, error } = await context.supabase.rpc("current_user_has_role", { _role: "admin" });
  if (error || isAdmin !== true) throw new Error("Not allowed");
}

function normalizedUsage(payload: any) {
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

function logStage(model: string, stage: string, event: string, details?: unknown) {
  console.info("[song-analyzer]", { provider: analyzerProvider(model), model, stage, event, details });
}

function parseStructured<T>(text: string, schema: z.ZodType<T>, model: string, stage: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    logStage(model, stage, "json_parse_failure", error instanceof Error ? error.message : String(error));
    throw new Error(`Analyzer ${stage} returned invalid JSON`);
  }

  const checked = schema.safeParse(parsed);
  if (!checked.success) {
    logStage(model, stage, "schema_validation_failure", checked.error.flatten());
    throw new Error(`Analyzer ${stage} returned schema-invalid JSON`);
  }
  return checked.data;
}

async function generateAudioEvidence(args: {
  apiKey?: string;
  provider: SongAnalyzerProvider;
  model: SongAnalyzerModelId;
  audioBase64: string;
  mimeType: string;
  stage0Evidence: Stage0DspEvidence;
  onUsage: (usage: ReturnType<typeof normalizedUsage>) => void;
}) {
  const stage = "evidence_extraction";
  const prompt = [
    "Extract raw musical evidence only. Do not classify genre or style. Return only schema-compliant JSON.",
    "",
    "QUANTITATIVE DSP REFERENCE",
    "The following values were computed directly from the same audio signal by deterministic DSP analysis.",
    "Treat them as SUPPORTING EVIDENCE, not unquestionable truth.",
    "If your auditory interpretation strongly disagrees:",
    "- do not blindly follow the DSP;",
    "- explicitly note the disagreement;",
    "- lower confidence where appropriate;",
    "- consider half-time/double-time ambiguity;",
    "- prefer the interpretation supported by multiple independent signals.",
    "DSP values must never generate genre assumptions.",
    "Energy changes are supporting evidence only and must not be mapped automatically to section labels.",
    "Weak key/chroma evidence must not influence genre classification.",
    "",
    JSON.stringify(args.stage0Evidence),
  ].join("\n");

  if (args.provider === "mistral") {
    let modelResult;
    try {
      modelResult = await modelCaller(args.model, "mistral")({
        system: EVIDENCE_EXTRACTION_SYSTEM_PROMPT,
        prompt,
        maxTokens: 8192,
        schema: EVIDENCE_RESPONSE_SCHEMA,
        inputAudio: { base64: args.audioBase64, mimeType: args.mimeType },
      });
    } catch (error) {
      logStage(args.model, stage, "provider_request_failure", error instanceof Error ? error.message : String(error));
      throw error;
    }
    args.onUsage(modelResult.usage);
    if (modelResult.stopReason && modelResult.stopReason !== "end_turn") {
      logStage(args.model, stage, "non_success_stop_reason", modelResult.stopReason);
      throw new Error(`Mistral evidence extraction stopped before completion: ${modelResult.stopReason}`);
    }
    const text = modelResult.text.trim();
    if (!text) {
      logStage(args.model, stage, "missing_json");
      throw new Error("Mistral evidence extraction returned no JSON");
    }
    const evidence = parseStructured(text, stageAEvidenceSchema, args.model, stage);
    logStage(args.model, stage, "success", { dominantElements: evidence.dominantElements.length, instruments: evidence.instrumentEvidence.length });
    return evidence;
  }

  if (!args.apiKey) throw new Error("Gemini API is not configured");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": args.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: EVIDENCE_EXTRACTION_SYSTEM_PROMPT }] },
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: args.mimeType, data: args.audioBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: EVIDENCE_RESPONSE_SCHEMA,
          maxOutputTokens: 8192,
          temperature: 0.1,
        },
      }),
    },
  );

  const payload = await response.json() as any;
  args.onUsage(normalizedUsage(payload));

  if (!response.ok) {
    logStage(args.model, stage, "provider_error", payload?.error?.message ?? response.status);
    throw new Error(payload?.error?.message || `Gemini evidence extraction failed (${response.status})`);
  }

  const candidate = payload?.candidates?.[0];
  const finishReason = candidate?.finishReason ?? null;
  if (finishReason && finishReason !== "STOP") {
    logStage(args.model, stage, "non_success_stop_reason", finishReason);
    throw new Error(`Gemini evidence extraction stopped before completion: ${finishReason}`);
  }

  const text = (candidate?.content?.parts ?? []).map((part: any) => typeof part?.text === "string" ? part.text : "").join("").trim();
  if (!text) {
    logStage(args.model, stage, "missing_json");
    throw new Error("Gemini evidence extraction returned no JSON");
  }

  const evidence = parseStructured(text, stageAEvidenceSchema, args.model, stage);
  logStage(args.model, stage, "success", { dominantElements: evidence.dominantElements.length, instruments: evidence.instrumentEvidence.length });
  return evidence;
}

function evidenceDerivedInstruments(evidence: StageAEvidence) {
  const forbidden = /\b(vocals?|singer|backing vocals?|vocal chops?|risers?|sweeps?|impacts?|transition(?:al)? fx|sound effects?|sfx|reverb|delay|white noise|compression|sidechain)\b/i;
  const values = evidence.instrumentEvidence
    .filter((item) => !forbidden.test(item.instrument))
    .map((item) => {
      const details = [item.timbre, item.technique, item.role].filter(Boolean).join("; ");
      return details ? `${item.instrument} — ${details}` : item.instrument;
    });
  return [...new Set(values)].slice(0, 30);
}

function clampConfidence(finalConfidence: "high" | "medium" | "low", evidenceConfidence: "high" | "medium" | "low") {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  return rank[finalConfidence] <= rank[evidenceConfidence] ? finalConfidence : evidenceConfidence;
}

function applyEvidenceGate(result: SongAnalysisResult, evidence: StageAEvidence): SongAnalysisResult {
  const instruments = evidenceDerivedInstruments(evidence);
  const felt = evidence.tempo.feltTempo;
  const fallback = result.generatorReady.bpm.approximate ?? evidence.tempo.gridCandidates[0] ?? null;
  const chosenBpm = felt ?? fallback;

  return {
    ...result,
    generatorReady: {
      ...result.generatorReady,
      instruments: instruments.length ? instruments : result.generatorReady.instruments,
      bpm: {
        ...result.generatorReady.bpm,
        approximate: chosenBpm == null ? null : Math.round(chosenBpm),
        rangeMin: null,
        rangeMax: null,
        confidence: clampConfidence(result.generatorReady.bpm.confidence, evidence.tempo.confidence),
        notes: [
          result.generatorReady.bpm.notes,
          evidence.tempo.notes,
          evidence.tempo.possibleHalfTime != null ? `Possible half-time: ${evidence.tempo.possibleHalfTime} BPM.` : "",
          evidence.tempo.possibleDoubleTime != null ? `Possible double-time: ${evidence.tempo.possibleDoubleTime} BPM.` : "",
        ].filter(Boolean).join(" "),
      },
    },
  };
}

async function generateFinalFromEvidence(args: {
  apiKey?: string;
  provider: SongAnalyzerProvider;
  model: SongAnalyzerModelId;
  evidence: StageAEvidence;
  stage0Evidence: Stage0DspEvidence;
  initialResult?: SongAnalysisResult;
  externalValidation?: ExternalValidation | null;
  onUsage: (usage: ReturnType<typeof normalizedUsage>) => void;
}) {
  const stage = args.externalValidation ? "external_reconciliation" : "final_synthesis";
  const context = [
    "STAGE A EVIDENCE:",
    JSON.stringify(args.evidence),
    "\nSTAGE 0 QUANTITATIVE DSP SUPPORTING EVIDENCE:",
    JSON.stringify(args.stage0Evidence),
    "\nStage 0 is supporting evidence only. It cannot authorize any new instrument, groove, production, or genre claim absent from Stage A. Use it only to cross-check tempo, energy/dynamics, tonal uncertainty, and confidence.",
    args.initialResult ? "\nPREVIOUS STAGE B RESULT TO RECHECK:\n" + JSON.stringify(args.initialResult) : "",
    args.externalValidation ? "\nOPTIONAL EXTERNAL VALIDATION (secondary context only; cannot introduce new musical claims):\n" + JSON.stringify(args.externalValidation) : "",
    "\nProduce the final canonical Analyzer JSON. Every specific musical claim must be grounded in Stage A evidence.",
  ].filter(Boolean).join("\n");

  if (args.provider === "mistral") {
    let modelResult;
    try {
      modelResult = await modelCaller(args.model, "mistral")({
        system: ANALYZER_SYSTEM_PROMPT,
        prompt: context,
        maxTokens: 8192,
        schema: ANALYZER_RESPONSE_SCHEMA,
      });
    } catch (error) {
      logStage(args.model, stage, "provider_request_failure", error instanceof Error ? error.message : String(error));
      throw error;
    }
    args.onUsage(modelResult.usage);
    if (modelResult.stopReason && modelResult.stopReason !== "end_turn") {
      logStage(args.model, stage, "non_success_stop_reason", modelResult.stopReason);
      throw new Error(`Mistral final synthesis stopped before completion: ${modelResult.stopReason}`);
    }
    const text = modelResult.text.trim();
    if (!text) {
      logStage(args.model, stage, "missing_json");
      throw new Error("Mistral final synthesis returned no JSON");
    }
    const final = parseStructured(text, songAnalysisResultSchema, args.model, stage);
    const gated = applyEvidenceGate(final, args.evidence);
    logStage(args.model, stage, "success");
    return gated;
  }

  if (!args.apiKey) throw new Error("Gemini API is not configured");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": args.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: ANALYZER_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: context }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: ANALYZER_RESPONSE_SCHEMA,
          maxOutputTokens: 8192,
          temperature: 0.1,
        },
      }),
    },
  );

  const payload = await response.json() as any;
  args.onUsage(normalizedUsage(payload));

  if (!response.ok) {
    logStage(args.model, stage, "provider_error", payload?.error?.message ?? response.status);
    throw new Error(payload?.error?.message || `Gemini final synthesis failed (${response.status})`);
  }

  const candidate = payload?.candidates?.[0];
  const finishReason = candidate?.finishReason ?? null;
  if (finishReason && finishReason !== "STOP") {
    logStage(args.model, stage, "non_success_stop_reason", finishReason);
    throw new Error(`Gemini final synthesis stopped before completion: ${finishReason}`);
  }

  const text = (candidate?.content?.parts ?? []).map((part: any) => typeof part?.text === "string" ? part.text : "").join("").trim();
  if (!text) {
    logStage(args.model, stage, "missing_json");
    throw new Error("Gemini final synthesis returned no JSON");
  }

  const final = parseStructured(text, songAnalysisResultSchema, args.model, stage);
  const gated = applyEvidenceGate(final, args.evidence);
  logStage(args.model, stage, "success");
  return gated;
}

async function runExternalReferenceValidation(args: {
  apiKey: string;
  model: string;
  trackTitle: string;
  artist: string;
  initialAnalysis: SongAnalysisResult;
}) {
  const stage = "external_validation";
  const ai = new GoogleGenAI({ apiKey: args.apiKey });
  const prompt = `
You are performing SECONDARY external-reference validation for an AI music-analysis system.

IMPORTANT ORDER OF AUTHORITY
- Raw audio evidence was extracted independently before this lookup.
- The final musical analysis was synthesized from that evidence before this lookup.
- External references may support, challenge, or contextualize the analysis, but must never create new musical claims.
- Do not infer instrumentation or production stereotypes from genre metadata.
- Only validate the exact track identity and collect cautious reference signals.

USER-PROVIDED TRACK IDENTITY
Track Title: ${args.trackTitle}
Artist: ${args.artist}

EVIDENCE-GROUNDED ANALYSIS TO CROSS-CHECK
${JSON.stringify(args.initialAnalysis)}

SEARCH / SOURCE RULES
- Search only for the exact artist + track combination.
- Prefer official artist/label pages, reputable music databases, official streaming metadata, liner-note/credit sources, and reliable music-reference sites.
- Treat low-quality SEO pages, autogenerated metadata pages, and generic BPM/chord pages as weak evidence.
- If identity is ambiguous, multiple songs share the title, or the artist/title combination cannot be confidently confirmed, set identityConfirmed=false.
- Do not guess.
- Broad style validation matters more than forcing a narrow subgenre.
- Public BPM references are validation signals only; half/double-time mismatches are common.
- Key/chord references, instrumentation credits, production/arrangement notes, album/release context, and official credits may be collected only when supported by a reliable source.
- External references cannot authorize an instrument, effect, groove, or arrangement claim that is absent from Stage A audio evidence.

Return only the requested structured JSON.
`.trim();

  try {
    const response = await ai.models.generateContent({
      model: args.model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseFormat: {
          text: { mimeType: "application/json", schema: EXTERNAL_VALIDATION_RESPONSE_FORMAT },
        },
        temperature: 0.1,
      } as any,
    });

    const usage = normalizedUsage(response as any);
    const text = String((response as any).text ?? "").trim();
    if (!text) {
      logStage(args.model, stage, "missing_json");
      throw new Error("External validation returned no structured result");
    }

    const validated = parseStructured(text, externalValidationSchema, args.model, stage);
    const chunks = ((response as any)?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) as any[];
    const uniqueSources = new Map<string, string>();
    for (const chunk of chunks) {
      const uri = chunk?.web?.uri;
      const title = chunk?.web?.title;
      if (typeof uri === "string" && uri) uniqueSources.set(uri, typeof title === "string" ? title : uri);
    }

    const supportingSourcesCount = uniqueSources.size;
    const used = validated.identityConfirmed && supportingSourcesCount > 0;
    logStage(args.model, stage, "success", { identityConfirmed: validated.identityConfirmed, supportingSourcesCount });

    return {
      validation: {
        ...validated,
        used,
        supportingSourcesCount,
        sourceTitles: [...uniqueSources.values()].slice(0, 12),
      } satisfies ExternalValidation,
      usage,
    };
  } catch (error) {
    logStage(args.model, stage, "failure", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

const analyzeInput = z.object({
  audioBase64: z.string().min(1).max(21_500_000),
  mimeType: z.enum(supportedMimeTypes),
  model: z.enum(["gemini-3.8-flash", "gemini-3.1-pro-preview", "voxtral-small-latest"]).default(DEFAULT_SONG_ANALYZER_MODEL),
  trackTitle: z.string().trim().min(1).max(200).optional(),
  artist: z.string().trim().min(1).max(200).optional(),
  stage0Evidence: stage0DspEvidenceSchema,
});

export const getSongAnalyzerAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    return {
      allowed: true as const,
      models: SONG_ANALYZER_MODELS,
      defaultModel: DEFAULT_SONG_ANALYZER_MODEL,
      maxFileBytes: SONG_ANALYZER_MAX_FILE_BYTES,
      supportedMimeTypes,
    };
  });

async function recordStageUsage(args: {
  userId: string;
  provider: SongAnalyzerProvider;
  model: string;
  stage: "evidence_extraction" | "final_synthesis" | "external_validation" | "external_reconciliation";
  usage: ReturnType<typeof normalizedUsage>;
  success: boolean;
}) {
  logStage(args.model, args.stage, args.success ? "usage_success" : "usage_failure", args.usage);
  await recordAiUsage({
    userId: args.userId,
    provider: args.provider,
    model: args.model,
    operation: "song_analysis",
    usage: args.usage,
    success: args.success,
  });
}

export const analyzeSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => analyzeInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);

    const bytes = Buffer.from(data.audioBase64, "base64");
    if (!bytes.length || bytes.byteLength > SONG_ANALYZER_MAX_FILE_BYTES) {
      throw new Error("Audio file exceeds the 15 MB Analyzer limit.");
    }

    const provider = analyzerProvider(data.model);
    const apiKey = provider === "gemini" ? process.env["GEMINI_API_KEY"] : undefined;
    if (provider === "gemini" && !apiKey) throw new Error("Gemini API is not configured");
    if (provider === "mistral" && !process.env["MISTRAL_API_KEY"]) throw new Error("Mistral API is not configured");

    const totalStartedAt = Date.now();
    const stage0Evidence = data.stage0Evidence;
    logStage(data.model, "stage0_dsp", stage0Evidence.available ? "available" : "unavailable", {
      processing: stage0Evidence.processing,
      tempo: stage0Evidence.tempo,
      limitations: stage0Evidence.limitations,
    });

    let evidenceUsage: ReturnType<typeof normalizedUsage> = null;
    let evidence: StageAEvidence;
    const stageAStartedAt = Date.now();
    try {
      evidence = await generateAudioEvidence({
        apiKey,
        provider,
        model: data.model,
        audioBase64: data.audioBase64,
        mimeType: data.mimeType,
        stage0Evidence,
        onUsage: (usage) => { evidenceUsage = usage; },
      });
      await recordStageUsage({ userId: context.userId, provider, model: data.model, stage: "evidence_extraction", usage: evidenceUsage, success: true });
      logStage(data.model, "evidence_extraction", "timing", { durationMs: Date.now() - stageAStartedAt });
    } catch (error) {
      await recordStageUsage({ userId: context.userId, provider, model: data.model, stage: "evidence_extraction", usage: evidenceUsage, success: false });
      throw error;
    }

    let synthesisUsage: ReturnType<typeof normalizedUsage> = null;
    let result: SongAnalysisResult;
    const stageBStartedAt = Date.now();
    try {
      result = await generateFinalFromEvidence({
        apiKey,
        model: data.model,
        evidence,
        stage0Evidence,
        onUsage: (usage) => { synthesisUsage = usage; },
      });
      await recordStageUsage({ userId: context.userId, provider, model: data.model, stage: "final_synthesis", usage: synthesisUsage, success: true });
      logStage(data.model, "final_synthesis", "timing", { durationMs: Date.now() - stageBStartedAt });
    } catch (error) {
      await recordStageUsage({ userId: context.userId, provider, model: data.model, stage: "final_synthesis", usage: synthesisUsage, success: false });
      throw error;
    }

    const trackTitle = data.trackTitle?.trim();
    const artist = data.artist?.trim();

    if (provider === "mistral" && trackTitle && artist) {
      logStage(data.model, "external_validation", "skipped", "Optional Google-grounded external validation is Gemini-specific; Voxtral result remains audio/DSP evidence only.");
    }

    if (!trackTitle || !artist || provider !== "gemini") {
      logStage(data.model, "analysis_total", "timing", { durationMs: Date.now() - totalStartedAt });
      return { result, model: data.model, stage0Evidence, stageAEvidence: evidence };
    }

    let externalUsage: ReturnType<typeof normalizedUsage> = null;
    let external: ExternalValidation | null = null;
    try {
      const validationResult = await runExternalReferenceValidation({
        apiKey,
        model: data.model,
        trackTitle,
        artist,
        initialAnalysis: result,
      });
      external = validationResult.validation;
      externalUsage = validationResult.usage;
      await recordStageUsage({ userId: context.userId, provider: "gemini", model: data.model, stage: "external_validation", usage: externalUsage, success: true });
    } catch (error) {
      await recordStageUsage({ userId: context.userId, provider: "gemini", model: data.model, stage: "external_validation", usage: externalUsage, success: false });
      logStage(data.model, "analysis_total", "timing", { durationMs: Date.now() - totalStartedAt });
      return { result, model: data.model, stage0Evidence, stageAEvidence: evidence };
    }

    if (!external.used || !external.identityConfirmed) {
      logStage(data.model, "analysis_total", "timing", { durationMs: Date.now() - totalStartedAt });
      return { result, model: data.model, stage0Evidence, stageAEvidence: evidence };
    }

    let reconciliationUsage: ReturnType<typeof normalizedUsage> = null;
    try {
      const reconciled = await generateFinalFromEvidence({
        apiKey,
        provider,
        model: data.model,
        evidence,
        stage0Evidence,
        initialResult: result,
        externalValidation: external,
        onUsage: (usage) => { reconciliationUsage = usage; },
      });
      await recordStageUsage({ userId: context.userId, provider: "gemini", model: data.model, stage: "external_reconciliation", usage: reconciliationUsage, success: true });
      logStage(data.model, "analysis_total", "timing", { durationMs: Date.now() - totalStartedAt });
      return { result: reconciled, model: data.model, stage0Evidence, stageAEvidence: evidence };
    } catch (error) {
      await recordStageUsage({ userId: context.userId, provider: "gemini", model: data.model, stage: "external_reconciliation", usage: reconciliationUsage, success: false });
      logStage(data.model, "analysis_total", "timing", { durationMs: Date.now() - totalStartedAt });
      return { result, model: data.model, stage0Evidence, stageAEvidence: evidence };
    }
  });

const saveAnalysisInput = z.object({
  name: z.string().trim().min(1).max(200),
  projectId: z.string().uuid().nullable().optional(),
  model: z.enum(["gemini-3.8-flash", "gemini-3.1-pro-preview", "voxtral-small-latest"]),
  result: songAnalysisResultSchema,
});

async function assertOwnedProject(supabase: any, userId: string, projectId: string | null | undefined) {
  if (!projectId) return;
  const { data: project, error } = await supabase
    .from("prompt_projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !project) throw new Error("Project not found");
}

export const saveSongAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveAnalysisInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const supabase = context.supabase as any;
    await assertOwnedProject(supabase, context.userId, data.projectId);

    const { data: saved, error } = await supabase
      .from("song_analyses")
      .insert({
        user_id: context.userId,
        name: data.name,
        project_id: data.projectId ?? null,
        model: data.model,
        generator_ready: data.result.generatorReady,
        detailed_analysis: data.result.detailedAnalysis,
      })
      .select("id, name, project_id, model, generator_ready, detailed_analysis, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { analysis: saved };
  });

/** Backward-compatible export for callers created by the first Analyzer release. */
export const saveSongAnalysisToProject = saveSongAnalysis;

export const listSongAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { data, error } = await supabase
      .from("song_analyses")
      .select("id, name, project_id, model, generator_ready, detailed_analysis, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { analyses: data ?? [] };
  });

const updateAnalysisInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  projectId: z.string().uuid().nullable().optional(),
});

export const updateSongAnalysisOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateAnalysisInput.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    if (data.projectId !== undefined) {
      await assertOwnedProject(supabase, context.userId, data.projectId);
    }
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.projectId !== undefined) patch.project_id = data.projectId;
    if (Object.keys(patch).length === 0) return { ok: true as const };
    const { error } = await supabase
      .from("song_analyses")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteSongAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { error } = await supabase.from("song_analyses").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
