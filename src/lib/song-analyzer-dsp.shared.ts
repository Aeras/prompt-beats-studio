import { z } from "zod";

const nullableMetric = z.number().finite().nullable();

const referenceMemoryMatchSchema = z.object({
  id: z.union([z.string(), z.number()]).nullable(),
  score: z.number().finite().nullable(),
  sourceTrackId: z.number().int().nullable(),
  title: z.string().trim().max(300).nullable(),
  artist: z.string().trim().max(300).nullable(),
  genreTop: z.string().trim().max(120).nullable(),
  genres: z.array(z.string().trim().max(120)).max(20),
  tags: z.array(z.string().trim().max(120)).max(20),
});

const referenceMemoryGenreConsensusSchema = z.object({
  label: z.string().trim().min(1).max(120),
  count: z.number().int().nonnegative(),
  share: z.number().min(0).max(1).finite(),
});

export const stage0DspEvidenceSchema = z.object({
  version: z.literal("stage0-dsp-v1"),
  available: z.boolean(),
  engine: z
    .object({
      name: z.enum(["legacy", "essentia"]),
      engineVersion: z.string().trim().min(1).max(100),
      methodVersion: z.string().trim().min(1).max(100),
      algorithms: z.array(z.string().trim().min(1).max(120)).max(30),
    })
    .optional(),
  processing: z.object({
    decodeMs: z.number().nonnegative().finite().nullable(),
    dspMs: z.number().nonnegative().finite().nullable(),
    totalMs: z.number().nonnegative().finite().nullable(),
    sourceSampleRate: z.number().positive().finite().nullable(),
    analysisSampleRate: z.number().positive().finite().nullable(),
    durationSeconds: z.number().nonnegative().finite().nullable(),
    channels: z.number().int().positive().nullable(),
  }),
  tempo: z
    .object({
      primaryBpm: nullableMetric,
      halfTimeCandidate: nullableMetric,
      doubleTimeCandidate: nullableMetric,
      confidence: z.number().min(0).max(1).nullable(),
      stable: z.boolean().nullable(),
      stabilityScore: z.number().min(0).max(1).nullable(),
      ambiguous: z.boolean().nullable(),
      notes: z.string().max(2000),
    })
    .nullable(),
  rhythm: z
    .object({
      beatStrength: z.number().min(0).max(1).nullable(),
      onsetDensity: z.number().nonnegative().finite().nullable(),
      meterCandidate: z.string().max(50).nullable(),
      meterConfidence: z.number().min(0).max(1).nullable(),
      beatTimestamps: z.array(z.number().nonnegative().finite()).max(128),
      notes: z.string().max(2000),
    })
    .nullable(),
  energy: z
    .object({
      meanRms: nullableMetric,
      stdRms: nullableMetric,
      dynamicRangeDb: nullableMetric,
      loudnessDb: nullableMetric.optional(),
      dynamicComplexity: nullableMetric.optional(),
      energySegments: z
        .array(
          z.object({
            startSec: z.number().nonnegative().finite(),
            endSec: z.number().nonnegative().finite(),
            meanRms: z.number().nonnegative().finite(),
            relativeEnergy: z.number().nonnegative().finite(),
          }),
        )
        .max(32),
      majorChanges: z
        .array(
          z.object({
            timeSec: z.number().nonnegative().finite(),
            type: z.enum(["rise", "drop"]),
            strength: z.number().nonnegative().finite(),
          }),
        )
        .max(16),
    })
    .nullable(),
  tonal: z
    .object({
      keyCandidate: z.string().max(50).nullable(),
      scaleCandidate: z.string().max(30).nullable().optional(),
      keyConfidence: z.number().min(0).max(1).nullable(),
      chromaSummary: z.array(z.number().min(0).max(1).finite()).length(12),
      notes: z.string().max(1500),
    })
    .nullable(),
  spectral: z
    .object({
      spectralCentroidHz: nullableMetric,
      brightness: z.number().min(0).max(1).nullable(),
      lowFrequencyEnergy: z.number().min(0).max(1).nullable(),
      highFrequencyEnergy: z.number().min(0).max(1).nullable(),
    })
    .nullable(),
  sectionChangeCandidates: z
    .array(
      z.object({
        timeSec: z.number().nonnegative().finite(),
        strength: z.number().nonnegative().finite(),
      }),
    )
    .max(16),
  referenceMemory: z
    .object({
      used: z.boolean(),
      embeddingContract: z.literal("promptbeats-mert95-similarity-v1"),
      candidateCount: z.number().int().nonnegative().optional(),
      metadataEligibleCount: z.number().int().nonnegative().optional(),
      deduplicatedCount: z.number().int().nonnegative().optional(),
      matchCount: z.number().int().nonnegative(),
      uniqueArtistCount: z.number().int().nonnegative().optional(),
      consensusStrength: z.enum(["insufficient", "weak", "moderate", "strong"]).optional(),
      genreConsensus: z.array(referenceMemoryGenreConsensusSchema).max(10).optional(),
      matches: z.array(referenceMemoryMatchSchema).max(20),
      interpretationGuidance: z.string().trim().min(1).max(3000),
    })
    .optional(),
  limitations: z.array(z.string().trim().min(1).max(1000)).max(30),
});

export type Stage0DspEvidence = z.infer<typeof stage0DspEvidenceSchema>;
