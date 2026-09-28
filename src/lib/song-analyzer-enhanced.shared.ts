import { z } from "zod";

import type { Stage0DspEvidence } from "@/lib/song-analyzer-dsp.shared";

const nullableNumber = z.number().finite().nullable();

const tempoSourceSchema = z
  .object({
    source: z.string().trim().min(1).max(80),
    bpm: nullableNumber,
    raw_confidence: nullableNumber.optional(),
    beat_count: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const tonalCandidateSchema = z
  .object({
    key: z.string().trim().min(1).max(40),
    scale: z.string().trim().min(1).max(40),
    mean_strength: z.number().finite().nullable(),
    source_count: z.number().int().nonnegative(),
    sources: z.array(z.string().trim().min(1).max(80)).max(12),
  })
  .passthrough();

const sectionCandidateSchema = z
  .object({
    time_seconds: z.number().nonnegative().finite(),
    novelty: z.number().nonnegative().finite(),
    cosine_similarity_to_previous: z.number().finite().optional(),
    edge_proximity: z.boolean().optional(),
  })
  .passthrough();

export const enhancedCanonicalEvidenceSchema = z
  .object({
    contract: z.literal("promptbeats.music-analysis-evidence"),
    version: z.string().trim().min(1).max(40),
    tempo: z.object({
      primary_candidate_bpm: nullableNumber,
      alternate_candidate_bpm: nullableNumber,
      relationship: z.string().trim().max(80).nullable(),
      rationale: z.string().trim().max(5000),
      sources: z.array(tempoSourceSchema).max(12),
    }),
    tonal: z.object({
      primary_candidate: tonalCandidateSchema.nullable(),
      alternatives: z.array(tonalCandidateSchema).max(12),
      disagreement_present: z.boolean(),
      note: z.string().trim().max(5000),
    }),
    section_change_evidence: z.object({
      candidates: z.array(sectionCandidateSchema).max(24),
      strongest_candidates: z.array(sectionCandidateSchema).max(12),
      interpretation: z.string().trim().max(5000),
    }),
    mix_summary: z.object({
      dynamic_complexity: nullableNumber,
      loudness_db: nullableNumber,
      onset_rate_per_second: nullableNumber,
      spectral_centroid_hz_mean: nullableNumber,
    }),
    warnings: z.array(z.string().trim().min(1).max(200)).max(30),
    downstream_guidance: z.object({
      confidence: z.string().trim().max(2000),
      sections: z.string().trim().max(2000),
      tempo: z.string().trim().max(2000),
      tonal: z.string().trim().max(2000),
    }),
  })
  .passthrough();

export type EnhancedCanonicalEvidence = z.infer<typeof enhancedCanonicalEvidenceSchema>;

function rounded(value: number | null | undefined, digits = 4) {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function alternateTempoFields(primary: number | null, alternate: number | null) {
  if (primary == null || alternate == null) {
    return { halfTimeCandidate: null, doubleTimeCandidate: null };
  }

  if (alternate < primary) {
    return { halfTimeCandidate: rounded(alternate, 3), doubleTimeCandidate: null };
  }
  if (alternate > primary) {
    return { halfTimeCandidate: null, doubleTimeCandidate: rounded(alternate, 3) };
  }
  return { halfTimeCandidate: null, doubleTimeCandidate: null };
}

export function buildEnhancedStage0Evidence(args: {
  canonicalEvidence: EnhancedCanonicalEvidence;
  durationSeconds: number | null;
  totalMs: number | null;
  workerEngine?: string | null;
  sourceStemPreview?: Stage0DspEvidence["sourceStemPreview"];
}): Stage0DspEvidence {
  const evidence = args.canonicalEvidence;
  const primaryBpm = rounded(evidence.tempo.primary_candidate_bpm, 3);
  const alternateBpm = rounded(evidence.tempo.alternate_candidate_bpm, 3);
  const alternateFields = alternateTempoFields(primaryBpm, alternateBpm);
  const tonal = evidence.tonal.primary_candidate;
  const alternatives = evidence.tonal.alternatives
    .map((item) => `${item.key} ${item.scale} (${item.sources.join("+") || "unknown source"})`)
    .join(", ");

  const limitations = [
    "Enhanced Stage 0 is computed by the external PromptBeats GPU worker; no Essentia.js/WASM analysis runs in the browser.",
    "The external worker combines Demucs stem separation, Essentia DSP/MIR, MERT representation evidence, and deterministic evidence fusion.",
    "Tempo candidates are supporting evidence, not ground truth. Essentia raw confidence is intentionally not converted into a fake 0..1 probability.",
    "MERT change candidates are representation-boundary evidence only and must not be named Verse/Chorus/Bridge without audible support.",
    "Tonal disagreement is preserved instead of forcibly reconciled.",
    ...evidence.warnings.map((warning) => `Worker warning: ${warning}.`),
  ];

  return {
    version: "stage0-dsp-v1",
    available: true,
    engine: {
      // Keep the existing Stage0 contract discriminator for backward compatibility.
      // methodVersion/algorithms identify that the actual computation is the external enhanced worker.
      name: "essentia",
      engineVersion: args.workerEngine || "demucs+essentia+mert+fusion",
      methodVersion: "promptbeats-runpod-enhanced-stage0-v1",
      algorithms: [
        "Demucs htdemucs stem separation",
        "Essentia RhythmExtractor2013",
        "Essentia KeyExtractor",
        "Essentia OnsetRate",
        "Essentia DynamicComplexity",
        "Essentia spectral centroid",
        "MERT-v1-95M representation windows",
        "PromptBeats canonical evidence fusion v1",
      ],
    },
    processing: {
      decodeMs: null,
      dspMs: rounded(args.totalMs, 2),
      totalMs: rounded(args.totalMs, 2),
      sourceSampleRate: null,
      analysisSampleRate: 44100,
      durationSeconds: rounded(args.durationSeconds, 3),
      channels: null,
    },
    tempo: {
      primaryBpm,
      halfTimeCandidate: alternateFields.halfTimeCandidate,
      doubleTimeCandidate: alternateFields.doubleTimeCandidate,
      confidence: null,
      stable: null,
      stabilityScore: null,
      ambiguous: evidence.warnings.includes("tempo_ambiguity"),
      notes: [
        evidence.tempo.rationale,
        evidence.tempo.relationship ? `Relationship: ${evidence.tempo.relationship}.` : "",
        "Worker raw beat confidence is algorithm-native and is not exposed as a normalized probability.",
      ]
        .filter(Boolean)
        .join(" "),
    },
    rhythm: {
      beatStrength: null,
      onsetDensity: rounded(evidence.mix_summary.onset_rate_per_second, 4),
      meterCandidate: null,
      meterConfidence: null,
      beatTimestamps: [],
      notes:
        "Onset density is from the full mix. Tempo is fused from full-mix and isolated-drum evidence where available.",
    },
    energy: {
      meanRms: null,
      stdRms: null,
      dynamicRangeDb: null,
      loudnessDb: rounded(evidence.mix_summary.loudness_db, 3),
      dynamicComplexity: rounded(evidence.mix_summary.dynamic_complexity, 4),
      energySegments: [],
      majorChanges: [],
    },
    tonal: {
      keyCandidate: tonal?.key ?? null,
      scaleCandidate: tonal?.scale ?? null,
      keyConfidence: rounded(tonal?.mean_strength, 4),
      chromaSummary: Array(12).fill(0),
      notes: [
        evidence.tonal.note,
        alternatives ? `Alternative tonal evidence: ${alternatives}.` : "",
        "Key strength is an algorithmic tonal-strength measure, not a calibrated probability.",
      ]
        .filter(Boolean)
        .join(" "),
    },
    spectral: {
      spectralCentroidHz: rounded(evidence.mix_summary.spectral_centroid_hz_mean, 3),
      brightness: null,
      lowFrequencyEnergy: null,
      highFrequencyEnergy: null,
    },
    sectionChangeCandidates: evidence.section_change_evidence.candidates.slice(0, 16).map((item) => ({
      timeSec: rounded(item.time_seconds, 3) ?? 0,
      strength: rounded(item.novelty, 6) ?? 0,
    })),
    sourceStemPreview: args.sourceStemPreview,
    limitations,
  };
}
