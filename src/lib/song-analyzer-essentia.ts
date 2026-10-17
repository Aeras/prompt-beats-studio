import type { Stage0DspEvidence } from "@/lib/song-analyzer-dsp.shared";

const ESSENTIA_SAMPLE_RATE = 44100;
const ESSENTIA_TIMEOUT_MS = 90_000;

type EssentiaWorkerSuccess = {
  id: number;
  ok: true;
  result: {
    engineVersion: string;
    algorithmNames: string[];
    tempo: {
      primaryBpm: number | null;
      confidence: number | null;
      stable: boolean | null;
      stabilityScore: number | null;
      ambiguous: boolean | null;
      estimates: number[];
      notes: string;
    };
    rhythm: {
      beatStrength: number | null;
      onsetDensity: number | null;
      beatTimestamps: number[];
      onsetTimestamps: number[];
    };
    tonal: {
      keyCandidate: string | null;
      scaleCandidate: string | null;
      keyConfidence: number | null;
      notes: string;
    };
    energy: {
      dynamicComplexity: number | null;
      loudnessDb: number | null;
    };
    spectral: {
      spectralCentroidHz: number | null;
    };
    processingMs: number;
  };
};

type EssentiaWorkerFailure = {
  id: number;
  ok: false;
  error: string;
  processingMs: number;
};

type EssentiaWorkerMessage = EssentiaWorkerSuccess | EssentiaWorkerFailure;

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, {
  resolve: (message: EssentiaWorkerMessage) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();

function getWorker() {
  if (worker) return worker;

  worker = new Worker(new URL("./song-analyzer-essentia.worker.ts", import.meta.url), {
    type: "module",
    name: "promptbeats-essentia-stage0",
  });
  worker.onmessage = (event: MessageEvent<EssentiaWorkerMessage>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    clearTimeout(request.timeout);
    pending.delete(event.data.id);
    request.resolve(event.data);
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Essentia worker failed.");
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  };

  return worker;
}

function mixToMono(buffer: AudioBuffer) {
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel);
    for (let i = 0; i < source.length; i += 1) {
      mono[i] += (source[i] ?? 0) / buffer.numberOfChannels;
    }
  }
  return mono;
}

function resampleLinearExact(input: Float32Array, sourceRate: number, targetRate: number) {
  if (sourceRate === targetRate) return input;
  const ratio = sourceRate / targetRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    const fraction = position - left;
    output[i] = (input[left] ?? 0) * (1 - fraction) + (input[right] ?? 0) * fraction;
  }

  return output;
}

async function decodeForEssentia(file: File) {
  const decodeStartedAt = performance.now();
  const audioContext = new AudioContext();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const mono = mixToMono(decoded);
    const samples = resampleLinearExact(mono, decoded.sampleRate, ESSENTIA_SAMPLE_RATE);
    return {
      samples,
      sourceSampleRate: decoded.sampleRate,
      durationSeconds: samples.length / ESSENTIA_SAMPLE_RATE,
      channels: decoded.numberOfChannels,
      decodeMs: performance.now() - decodeStartedAt,
    };
  } finally {
    void audioContext.close().catch(() => undefined);
  }
}

function runWorker(samples: Float32Array) {
  const id = nextRequestId++;
  const activeWorker = getWorker();

  return new Promise<EssentiaWorkerMessage>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Essentia Stage 0 timed out."));
    }, ESSENTIA_TIMEOUT_MS);

    pending.set(id, { resolve, reject, timeout });
    activeWorker.postMessage(
      { id, samples: samples.buffer, sampleRate: ESSENTIA_SAMPLE_RATE },
      [samples.buffer],
    );
  });
}

function round(value: number | null, digits = 4) {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export async function analyzeStage0Essentia(
  file: File,
  legacy: Stage0DspEvidence,
): Promise<Stage0DspEvidence> {
  const totalStartedAt = performance.now();

  try {
    const decoded = await decodeForEssentia(file);
    const workerResult = await runWorker(decoded.samples);
    if (!workerResult.ok) throw new Error(workerResult.error);

    const es = workerResult.result;
    const primaryBpm = es.tempo.primaryBpm;
    const halfTimeCandidate =
      primaryBpm != null && primaryBpm / 2 >= 20 ? round(primaryBpm / 2, 2) : null;
    const doubleTimeCandidate =
      primaryBpm != null && primaryBpm * 2 <= 300 ? round(primaryBpm * 2, 2) : null;

    const limitations = [
      ...legacy.limitations.filter((item) => !item.startsWith("Stage 0 is deterministic")),
      "Essentia.js/WASM Stage 0 is supporting MIR evidence, not musical ground truth.",
      "Tempo confidence is normalized from Essentia multifeature beat-tracker confidence.",
      "Half-time and double-time candidates remain interpretation checks rather than automatic corrections.",
      "KeyExtractor uses an internal HPCP pipeline; the exposed chroma summary remains the legacy diagnostic summary in this experiment.",
      "Energy segments, spectral band ratios, and section-change candidates are retained from the legacy DSP for side-by-side validation during the experiment.",
    ];

    return {
      ...legacy,
      version: "stage0-dsp-v1",
      available: true,
      engine: {
        name: "essentia",
        engineVersion: es.engineVersion || "0.1.3",
        methodVersion: "promptbeats-essentia-stage0-v1",
        algorithms: es.algorithmNames,
      },
      processing: {
        ...legacy.processing,
        decodeMs: round(decoded.decodeMs, 2),
        dspMs: round(es.processingMs, 2),
        totalMs: round(performance.now() - totalStartedAt, 2),
        sourceSampleRate: decoded.sourceSampleRate,
        analysisSampleRate: ESSENTIA_SAMPLE_RATE,
        durationSeconds: round(decoded.durationSeconds, 3),
        channels: decoded.channels,
      },
      tempo: {
        primaryBpm,
        halfTimeCandidate,
        doubleTimeCandidate,
        confidence: es.tempo.confidence,
        stable: es.tempo.stable,
        stabilityScore: es.tempo.stabilityScore,
        ambiguous: es.tempo.ambiguous,
        notes: [
          es.tempo.notes,
          es.tempo.estimates.length
            ? `Essentia BPM distribution samples: ${es.tempo.estimates.join(", ")}.`
            : "",
          legacy.tempo?.primaryBpm != null
            ? `Legacy comparison BPM: ${legacy.tempo.primaryBpm}.`
            : "",
        ].filter(Boolean).join(" "),
      },
      rhythm: {
        beatStrength: es.rhythm.beatStrength,
        onsetDensity: es.rhythm.onsetDensity,
        meterCandidate: legacy.rhythm?.meterCandidate ?? null,
        meterConfidence: legacy.rhythm?.meterConfidence ?? null,
        beatTimestamps: es.rhythm.beatTimestamps,
        notes: [
          "Beat timestamps and onset density are produced by Essentia RhythmExtractor2013/OnsetRate.",
          es.rhythm.onsetTimestamps.length
            ? `Detected onset count in retained diagnostic sample: ${es.rhythm.onsetTimestamps.length}.`
            : "",
          "Meter remains unreported unless a separate reliable meter detector is introduced.",
        ].filter(Boolean).join(" "),
      },
      energy: legacy.energy
        ? {
            ...legacy.energy,
            loudnessDb: es.energy.loudnessDb,
            dynamicComplexity: es.energy.dynamicComplexity,
          }
        : null,
      tonal: legacy.tonal
        ? {
            ...legacy.tonal,
            keyCandidate: es.tonal.keyCandidate,
            scaleCandidate: es.tonal.scaleCandidate,
            keyConfidence: es.tonal.keyConfidence,
            notes: [
              es.tonal.notes,
              "Weak tonal evidence must not influence genre classification.",
            ].join(" "),
          }
        : {
            keyCandidate: es.tonal.keyCandidate,
            scaleCandidate: es.tonal.scaleCandidate,
            keyConfidence: es.tonal.keyConfidence,
            chromaSummary: Array(12).fill(0),
            notes: es.tonal.notes,
          },
      spectral: legacy.spectral
        ? {
            ...legacy.spectral,
            spectralCentroidHz: es.spectral.spectralCentroidHz,
          }
        : {
            spectralCentroidHz: es.spectral.spectralCentroidHz,
            brightness: null,
            lowFrequencyEnergy: null,
            highFrequencyEnergy: null,
          },
      limitations,
    };
  } catch (error) {
    return {
      ...legacy,
      engine: legacy.engine ?? {
        name: "legacy",
        engineVersion: "promptbeats-legacy-v1",
        methodVersion: "stage0-dsp-v1",
        algorithms: [],
      },
      processing: {
        ...legacy.processing,
        totalMs: round(performance.now() - totalStartedAt, 2),
      },
      limitations: [
        ...legacy.limitations,
        "Essentia.js/WASM Stage 0 unavailable; legacy DSP fallback used.",
        `Essentia failure: ${(error instanceof Error ? error.message : String(error)).slice(0, 500)}`,
      ],
    };
  }
}
