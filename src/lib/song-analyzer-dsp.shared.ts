import { z } from "zod";

const nullableMetric = z.number().finite().nullable();

export const stage0DspEvidenceSchema = z.object({
  version: z.literal("stage0-dsp-v1"),
  available: z.boolean(),
  engine: z.object({
    name: z.enum(["legacy", "essentia"]),
    engineVersion: z.string().trim().min(1).max(100),
    methodVersion: z.string().trim().min(1).max(100),
    algorithms: z.array(z.string().trim().min(1).max(120)).max(30),
  }).optional(),
  processing: z.object({
    decodeMs: z.number().nonnegative().finite().nullable(),
    dspMs: z.number().nonnegative().finite().nullable(),
    totalMs: z.number().nonnegative().finite().nullable(),
    sourceSampleRate: z.number().positive().finite().nullable(),
    analysisSampleRate: z.number().positive().finite().nullable(),
    durationSeconds: z.number().nonnegative().finite().nullable(),
    channels: z.number().int().positive().nullable(),
  }),
  tempo: z.object({
    primaryBpm: nullableMetric,
    halfTimeCandidate: nullableMetric,
    doubleTimeCandidate: nullableMetric,
    confidence: z.number().min(0).max(1).nullable(),
    stable: z.boolean().nullable(),
    stabilityScore: z.number().min(0).max(1).nullable(),
    ambiguous: z.boolean().nullable(),
    notes: z.string().max(2000),
  }).nullable(),
  rhythm: z.object({
    beatStrength: z.number().min(0).max(1).nullable(),
    onsetDensity: z.number().nonnegative().finite().nullable(),
    meterCandidate: z.string().max(50).nullable(),
    meterConfidence: z.number().min(0).max(1).nullable(),
    beatTimestamps: z.array(z.number().nonnegative().finite()).max(128),
    notes: z.string().max(2000),
  }).nullable(),
  energy: z.object({
    meanRms: nullableMetric,
    stdRms: nullableMetric,
    dynamicRangeDb: nullableMetric,
    energySegments: z.array(z.object({
      startSec: z.number().nonnegative().finite(),
      endSec: z.number().nonnegative().finite(),
      meanRms: z.number().nonnegative().finite(),
      relativeEnergy: z.number().nonnegative().finite(),
    })).max(32),
    majorChanges: z.array(z.object({
      timeSec: z.number().nonnegative().finite(),
      type: z.enum(["rise", "drop"]),
      strength: z.number().nonnegative().finite(),
    })).max(16),
  }).nullable(),
  tonal: z.object({
    keyCandidate: z.string().max(50).nullable(),
    keyConfidence: z.number().min(0).max(1).nullable(),
    chromaSummary: z.array(z.number().min(0).max(1).finite()).length(12),
    notes: z.string().max(1500),
  }).nullable(),
  spectral: z.object({
    spectralCentroidHz: nullableMetric,
    brightness: z.number().min(0).max(1).nullable(),
    lowFrequencyEnergy: z.number().min(0).max(1).nullable(),
    highFrequencyEnergy: z.number().min(0).max(1).nullable(),
  }).nullable(),
  sectionChangeCandidates: z.array(z.object({
    timeSec: z.number().nonnegative().finite(),
    strength: z.number().nonnegative().finite(),
  })).max(16),
  limitations: z.array(z.string().trim().min(1).max(1000)).max(30),
});

export type Stage0DspEvidence = z.infer<typeof stage0DspEvidenceSchema>;
