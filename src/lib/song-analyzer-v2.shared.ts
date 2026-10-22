import { z } from "zod";
import { stage0DspEvidenceSchema, type Stage0DspEvidence } from "./song-analyzer-dsp.shared";

export const analyzerVersionSchema = z.enum(["v1", "v2"]);
export type AnalyzerVersion = z.infer<typeof analyzerVersionSchema>;
export const analyzerAudioMimeSchema = z.enum([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
]);
export const analyzerV2ProvenanceSchema = z.object({
  version: z.literal("v2"),
  provider: z.enum(["gemini", "openai", "openrouter"]),
  model: z.string().min(1).max(240),
  label: z.string().min(1).max(300),
  essentiaEngine: z.string().min(1).max(100),
  stage0Completed: z.literal(true),
  providerCalls: z.literal(1),
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  usage: z
    .object({
      inputTokens: z.number().nonnegative().nullable(),
      outputTokens: z.number().nonnegative().nullable(),
      totalTokens: z.number().nonnegative().nullable(),
      reasoningTokens: z.number().nonnegative().nullish(),
      cachedInputTokens: z.number().nonnegative().nullish(),
    })
    .nullable(),
});
export type AnalyzerV2Provenance = z.infer<typeof analyzerV2ProvenanceSchema>;

/** Reviewed transport/output contracts, not a guess based on a model name prefix. */
export function analyzerV2Compatibility(model: { id: string; provider: string }) {
  const gemini =
    model.provider === "gemini" &&
    ["gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-4-argon"].includes(model.id);
  const openai = model.provider === "openai" && model.id === "gpt-audio-1.5";
  const openrouter =
    model.provider === "openrouter" &&
    ["openai/gpt-audio", "openai/gpt-audio-1.5"].includes(model.id);
  return {
    compatible: gemini || openai || openrouter,
    maxOutputTokens: gemini ? 32768 : 16384,
    nativeSchema: gemini,
  };
}

/** V1 wrapper merges legacy diagnostics. V2 sends only measurements actually from Essentia. */
export function essentiaOnlyEvidence(input: Stage0DspEvidence): Stage0DspEvidence {
  const e = stage0DspEvidenceSchema.parse(input);
  if (!e.available || e.engine?.name !== "essentia")
    throw new Error(
      "Analyzer V2 requires successful Essentia analysis. No legacy fallback was sent to AI.",
    );
  return {
    version: e.version,
    available: true,
    engine: e.engine,
    processing: e.processing,
    tempo: e.tempo
      ? {
          ...e.tempo,
          notes:
            "Essentia tempo estimate; consider half/double-time ambiguity and confidence. Not musical ground truth.",
        }
      : null,
    rhythm: e.rhythm
      ? {
          beatStrength: e.rhythm.beatStrength,
          onsetDensity: e.rhythm.onsetDensity,
          meterCandidate: null,
          meterConfidence: null,
          beatTimestamps: [],
          notes: "Essentia rhythm summary. Meter is not measured.",
        }
      : null,
    energy: e.energy
      ? {
          meanRms: null,
          stdRms: null,
          dynamicRangeDb: null,
          loudnessDb: e.energy.loudnessDb ?? null,
          dynamicComplexity: e.energy.dynamicComplexity ?? null,
          energySegments: [],
          majorChanges: [],
        }
      : null,
    tonal: e.tonal
      ? {
          keyCandidate: e.tonal.keyCandidate,
          scaleCandidate: e.tonal.scaleCandidate ?? null,
          keyConfidence: e.tonal.keyConfidence,
          chromaSummary: Array(12).fill(0),
          notes:
            "Essentia KeyExtractor candidate. Chroma summary is not exposed; zeros are placeholders, not measured chroma.",
        }
      : null,
    spectral: e.spectral
      ? {
          spectralCentroidHz: e.spectral.spectralCentroidHz,
          brightness: null,
          lowFrequencyEnergy: null,
          highFrequencyEnergy: null,
        }
      : null,
    sectionChangeCandidates: [],
    limitations: [
      "Essentia is supporting evidence, not musical ground truth.",
      "Legacy RMS, energy segments, chroma, meter, section candidates, reference memory and stems are excluded. Infer sections from the supplied full audio or state uncertainty.",
    ],
  };
}

export function boundedEssentiaInput(input: Stage0DspEvidence) {
  const e = essentiaOnlyEvidence(input);
  return {
    engine: e.engine,
    durationSeconds: e.processing.durationSeconds,
    tempo: e.tempo,
    rhythm: e.rhythm,
    energy: e.energy,
    tonal: e.tonal
      ? {
          keyCandidate: e.tonal.keyCandidate,
          scaleCandidate: e.tonal.scaleCandidate,
          confidence: e.tonal.keyConfidence,
        }
      : null,
    spectral: e.spectral,
    sectionMeasurements: "Unavailable from this Essentia engine; listen to actual audio.",
    limitations: e.limitations,
  };
}
