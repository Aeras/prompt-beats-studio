import { describe, expect, test } from "bun:test";

import {
  buildEnhancedStage0Evidence,
  enhancedCanonicalEvidenceSchema,
} from "@/lib/song-analyzer-enhanced.shared";

const canonical = enhancedCanonicalEvidenceSchema.parse({
  contract: "promptbeats.music-analysis-evidence",
  version: "1.0",
  downstream_guidance: {
    confidence: "raw confidence is not a probability",
    sections: "boundary evidence only",
    tempo: "candidates only",
    tonal: "keep alternatives",
  },
  mix_summary: {
    dynamic_complexity: 4.0547,
    loudness_db: -14.623,
    onset_rate_per_second: 4.2619,
    spectral_centroid_hz_mean: 3657.379,
  },
  section_change_evidence: {
    candidates: [
      { time_seconds: 95.763, novelty: 0.126546, edge_proximity: false },
      { time_seconds: 172.373, novelty: 0.166532, edge_proximity: false },
    ],
    strongest_candidates: [
      { time_seconds: 172.373, novelty: 0.166532, edge_proximity: false },
    ],
    interpretation: "boundary evidence only",
  },
  tempo: {
    primary_candidate_bpm: 84.983,
    alternate_candidate_bpm: 172.265,
    relationship: "half_double_time",
    rationale: "isolated drums support the felt tempo; full mix supports double time",
    sources: [
      { source: "full_mix", bpm: 172.265, raw_confidence: 2.389, beat_count: 632 },
      { source: "drums", bpm: 84.983, raw_confidence: 2.5923, beat_count: 318 },
    ],
  },
  tonal: {
    primary_candidate: {
      key: "D",
      scale: "minor",
      mean_strength: 0.8696,
      source_count: 2,
      sources: ["full_mix", "bass"],
    },
    alternatives: [
      {
        key: "A",
        scale: "minor",
        mean_strength: 0.892,
        source_count: 1,
        sources: ["other"],
      },
    ],
    disagreement_present: true,
    note: "conflicting tonal estimates are preserved",
  },
  warnings: ["tempo_ambiguity", "tonal_disagreement", "mert_noncommercial_model"],
});

describe("enhanced Song Analyzer evidence mapping", () => {
  test("maps fused tempo without pretending raw confidence is a probability", () => {
    const result = buildEnhancedStage0Evidence({
      canonicalEvidence: canonical,
      durationSeconds: 225.26,
      totalMs: 28275,
      workerEngine: "demucs+essentia+mert+fusion",
    });

    expect(result.tempo?.primaryBpm).toBe(84.983);
    expect(result.tempo?.doubleTimeCandidate).toBe(172.265);
    expect(result.tempo?.halfTimeCandidate).toBeNull();
    expect(result.tempo?.confidence).toBeNull();
    expect(result.tempo?.ambiguous).toBe(true);
  });

  test("preserves tonal disagreement and MERT boundary evidence", () => {
    const result = buildEnhancedStage0Evidence({
      canonicalEvidence: canonical,
      durationSeconds: 225.26,
      totalMs: 28275,
      workerEngine: "demucs+essentia+mert+fusion",
    });

    expect(result.tonal?.keyCandidate).toBe("D");
    expect(result.tonal?.scaleCandidate).toBe("minor");
    expect(result.tonal?.notes).toContain("A minor");
    expect(result.sectionChangeCandidates).toEqual([
      { timeSec: 95.763, strength: 0.126546 },
      { timeSec: 172.373, strength: 0.166532 },
    ]);
  });

  test("documents that browser Essentia is no longer the active Stage 0 implementation", () => {
    const result = buildEnhancedStage0Evidence({
      canonicalEvidence: canonical,
      durationSeconds: 225.26,
      totalMs: 28275,
      workerEngine: "demucs+essentia+mert+fusion",
    });

    expect(result.limitations.join(" ")).toContain("no Essentia.js/WASM analysis runs in the browser");
    expect(result.engine?.methodVersion).toBe("promptbeats-runpod-enhanced-stage0-v1");
  });
});
