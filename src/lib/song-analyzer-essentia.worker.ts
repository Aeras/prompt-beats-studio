/* eslint-disable @typescript-eslint/no-explicit-any */
import Essentia from "essentia.js/dist/essentia.js-core.es.js";
import { EssentiaWASM } from "essentia.js/dist/essentia-wasm.es.js";

const ESSENTIA_VERSION = "0.1.3";

let essentia: any | null = null;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function std(values: number[], center = mean(values)) {
  return values.length
    ? Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length)
    : 0;
}

function toArray(value: any): number[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(Number);
  try {
    return essentia.vectorToArray(value).map(Number) as number[];
  } catch {
    const out: number[] = [];
    if (typeof value.size === "function" && typeof value.get === "function") {
      for (let i = 0; i < value.size(); i += 1) out.push(Number(value.get(i)));
    }
    return out;
  }
}

function compactTicks(values: number[], max = 128) {
  if (values.length <= max) return values;
  const out: number[] = [];
  for (let i = 0; i < max; i += 1) {
    out.push(values[Math.min(values.length - 1, Math.round((i / (max - 1)) * (values.length - 1)))]!);
  }
  return out;
}

function ensureEssentia() {
  if (essentia) return essentia;
  essentia = new Essentia(EssentiaWASM);
  return essentia;
}

self.onmessage = (event: MessageEvent<{ id: number; samples: ArrayBuffer; sampleRate: number }>) => {
  const { id, samples, sampleRate } = event.data;
  const startedAt = performance.now();

  try {
    if (sampleRate !== 44100) throw new Error("Essentia Stage 0 requires 44100 Hz PCM.");
    const es = ensureEssentia();
    const pcm = new Float32Array(samples);
    const signal = es.arrayToVector(pcm);

    const rhythm = es.RhythmExtractor2013(signal, 208, "multifeature", 40);
    const ticks = compactTicks(toArray(rhythm.ticks)).map((value) => Number(value.toFixed(4)));
    const estimates = toArray(rhythm.estimates).filter((value) => Number.isFinite(value) && value > 0);
    const intervals = toArray(rhythm.bpmIntervals).filter((value) => Number.isFinite(value) && value > 0);
    const localBpms = intervals.map((interval) => 60 / interval).filter((value) => value >= 20 && value <= 300);
    const localMean = mean(localBpms);
    const localStd = std(localBpms, localMean);
    const stabilityScore = localBpms.length >= 2 && localMean > 0
      ? clamp(1 - localStd / Math.max(1, localMean * 0.08))
      : null;

    const rawConfidence = Number(rhythm.confidence);
    const confidence = Number.isFinite(rawConfidence) ? clamp(rawConfidence / 5.32) : null;
    const primaryBpm = Number.isFinite(Number(rhythm.bpm)) ? Number(Number(rhythm.bpm).toFixed(2)) : null;

    const onset = es.OnsetRate(signal);
    const onsetTimes = compactTicks(toArray(onset.onsets)).map((value) => Number(value.toFixed(4)));
    const onsetRate = Number.isFinite(Number(onset.onsetRate)) ? Number(Number(onset.onsetRate).toFixed(4)) : null;

    const key = es.KeyExtractor(signal);
    const keyStrength = Number.isFinite(Number(key.strength)) ? clamp(Number(key.strength)) : null;
    const keyCandidate = keyStrength != null && keyStrength >= 0.18
      ? `${String(key.key)} ${String(key.scale)}`
      : null;

    const dynamics = es.DynamicComplexity(signal, 0.2, 44100);
    const spectral = es.SpectralCentroidTime(signal, 44100);

    const result = {
      engineVersion: String(es.version ?? ESSENTIA_VERSION),
      algorithmNames: [
        "RhythmExtractor2013(multifeature)",
        "OnsetRate",
        "KeyExtractor",
        "DynamicComplexity",
        "SpectralCentroidTime",
      ],
      tempo: {
        primaryBpm,
        confidence,
        stable: stabilityScore == null ? null : stabilityScore >= 0.65,
        stabilityScore: stabilityScore == null ? null : Number(stabilityScore.toFixed(4)),
        ambiguous: confidence == null ? null : confidence < 0.58 || (stabilityScore != null && stabilityScore < 0.65),
        estimates: estimates.slice(0, 24).map((value) => Number(value.toFixed(2))),
        notes: [
          primaryBpm != null ? `Essentia RhythmExtractor2013 primary estimate: ${primaryBpm} BPM.` : "No Essentia primary BPM estimate.",
          localBpms.length ? `Beat-interval tempo mean: ${localMean.toFixed(2)} BPM; std: ${localStd.toFixed(2)}.` : "",
          "Confidence is normalized from Essentia multifeature beat-tracker confidence and remains supporting evidence only.",
        ].filter(Boolean).join(" "),
      },
      rhythm: {
        beatStrength: confidence == null ? null : Number(confidence.toFixed(4)),
        onsetDensity: onsetRate,
        beatTimestamps: ticks,
        onsetTimestamps: onsetTimes,
      },
      tonal: {
        keyCandidate,
        scaleCandidate: keyCandidate ? String(key.scale) : null,
        keyConfidence: keyStrength == null ? null : Number(keyStrength.toFixed(4)),
        notes: keyCandidate
          ? `Essentia KeyExtractor candidate using its internal HPCP pipeline. Strength: ${keyStrength?.toFixed(3)}.`
          : "Essentia tonal estimate is weak; key remains uncertain.",
      },
      energy: {
        dynamicComplexity: Number.isFinite(Number(dynamics.dynamicComplexity)) ? Number(Number(dynamics.dynamicComplexity).toFixed(4)) : null,
        loudnessDb: Number.isFinite(Number(dynamics.loudness)) ? Number(Number(dynamics.loudness).toFixed(3)) : null,
      },
      spectral: {
        spectralCentroidHz: Number.isFinite(Number(spectral.centroid)) ? Number(Number(spectral.centroid).toFixed(2)) : null,
      },
      processingMs: Number((performance.now() - startedAt).toFixed(2)),
    };

    try { signal.delete?.(); } catch {}
    (self as any).postMessage({ id, ok: true, result });
  } catch (error) {
    (self as any).postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      processingMs: Number((performance.now() - startedAt).toFixed(2)),
    });
  }
};
