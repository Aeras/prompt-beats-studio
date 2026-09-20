import type { Stage0DspEvidence } from "@/lib/song-analyzer-dsp.shared";

const TARGET_SAMPLE_RATE = 22050;
const RMS_FRAME = 1024;
const RMS_HOP = 512;
const FFT_SIZE = 2048;
const MAX_SPECTRAL_FRAMES = 96;
const ENERGY_SEGMENTS = 16;

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values: number[], center = mean(values)) {
  if (!values.length) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length);
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(p, 0, 1) * (sorted.length - 1);
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low] ?? 0;
  const fraction = index - low;
  return (sorted[low] ?? 0) * (1 - fraction) + (sorted[high] ?? 0) * fraction;
}

function mixToMono(buffer: AudioBuffer) {
  const output = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel);
    for (let i = 0; i < source.length; i += 1) output[i] += source[i] / buffer.numberOfChannels;
  }
  return output;
}

function resampleLinear(input: Float32Array, sourceRate: number, targetRate: number) {
  if (sourceRate <= targetRate) return { samples: input, sampleRate: sourceRate };
  const ratio = sourceRate / targetRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    const fraction = position - left;
    output[i] = (input[left] ?? 0) * (1 - fraction) + (input[right] ?? 0) * fraction;
  }
  return { samples: output, sampleRate: targetRate };
}

function rmsEnvelope(samples: Float32Array) {
  const values: number[] = [];
  for (let start = 0; start + RMS_FRAME <= samples.length; start += RMS_HOP) {
    let sumSquares = 0;
    for (let i = 0; i < RMS_FRAME; i += 1) {
      const value = samples[start + i] ?? 0;
      sumSquares += value * value;
    }
    values.push(Math.sqrt(sumSquares / RMS_FRAME));
  }
  return values;
}

function onsetEnvelope(rms: number[]) {
  if (!rms.length) return [];
  const raw = rms.map((value, index) => index === 0 ? 0 : Math.max(0, value - (rms[index - 1] ?? value)));
  const smoothed = raw.map((_, index) => {
    let sum = 0;
    let count = 0;
    for (let offset = -2; offset <= 2; offset += 1) {
      const value = raw[index + offset];
      if (value != null) {
        sum += value;
        count += 1;
      }
    }
    return count ? sum / count : 0;
  });
  const center = mean(smoothed);
  const spread = std(smoothed, center);
  return smoothed.map((value) => Math.max(0, value - center * 0.35 - spread * 0.1));
}

function autocorrelationTempo(onsets: number[], sampleRate: number) {
  if (onsets.length < 32) {
    return { bpm: null as number | null, confidence: null as number | null, candidates: [] as Array<{ bpm: number; score: number }> };
  }
  const envelopeRate = sampleRate / RMS_HOP;
  const minBpm = 45;
  const maxBpm = 210;
  const minLag = Math.max(1, Math.floor((60 * envelopeRate) / maxBpm));
  const maxLag = Math.min(onsets.length - 2, Math.ceil((60 * envelopeRate) / minBpm));
  const scores: Array<{ bpm: number; score: number }> = [];

  const energy = onsets.reduce((sum, value) => sum + value * value, 0) || 1;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let numerator = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let i = lag; i < onsets.length; i += 1) {
      const a = onsets[i] ?? 0;
      const b = onsets[i - lag] ?? 0;
      numerator += a * b;
      leftEnergy += a * a;
      rightEnergy += b * b;
    }
    const denom = Math.sqrt(leftEnergy * rightEnergy) || energy;
    const score = denom ? numerator / denom : 0;
    scores.push({ bpm: (60 * envelopeRate) / lag, score });
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  if (!best || !Number.isFinite(best.bpm)) return { bpm: null, confidence: null, candidates: [] };

  const distinct: Array<{ bpm: number; score: number }> = [];
  for (const item of scores) {
    if (distinct.every((entry) => Math.abs(entry.bpm - item.bpm) > 2.5)) distinct.push(item);
    if (distinct.length >= 4) break;
  }
  const second = distinct[1]?.score ?? 0;
  const confidence = clamp((best.score - second) * 2.5 + best.score * 0.45);

  return {
    bpm: Math.round(best.bpm * 10) / 10,
    confidence,
    candidates: distinct.map((item) => ({ bpm: Math.round(item.bpm * 10) / 10, score: clamp(item.score) })),
  };
}

function segmentTempo(onsets: number[], sampleRate: number, segments = 3) {
  const results: number[] = [];
  const size = Math.floor(onsets.length / segments);
  if (size < 24) return results;
  for (let i = 0; i < segments; i += 1) {
    const slice = onsets.slice(i * size, i === segments - 1 ? onsets.length : (i + 1) * size);
    const result = autocorrelationTempo(slice, sampleRate);
    if (result.bpm != null) results.push(result.bpm);
  }
  return results;
}

function buildEnergySegments(rms: number[], durationSec: number) {
  if (!rms.length || durationSec <= 0) return [];
  const globalMean = mean(rms) || 1;
  const items = [];
  for (let segment = 0; segment < ENERGY_SEGMENTS; segment += 1) {
    const startIndex = Math.floor((segment / ENERGY_SEGMENTS) * rms.length);
    const endIndex = Math.max(startIndex + 1, Math.floor(((segment + 1) / ENERGY_SEGMENTS) * rms.length));
    const segmentMean = mean(rms.slice(startIndex, endIndex));
    items.push({
      startSec: Number(((segment / ENERGY_SEGMENTS) * durationSec).toFixed(2)),
      endSec: Number((((segment + 1) / ENERGY_SEGMENTS) * durationSec).toFixed(2)),
      meanRms: Number(segmentMean.toFixed(6)),
      relativeEnergy: Number((segmentMean / globalMean).toFixed(4)),
    });
  }
  return items;
}

function energyChanges(segments: Array<{ startSec: number; endSec: number; relativeEnergy: number }>) {
  const diffs = [];
  for (let i = 1; i < segments.length; i += 1) {
    const delta = segments[i]!.relativeEnergy - segments[i - 1]!.relativeEnergy;
    diffs.push({ index: i, delta, magnitude: Math.abs(delta) });
  }
  const threshold = mean(diffs.map((item) => item.magnitude)) + std(diffs.map((item) => item.magnitude)) * 0.75;
  return diffs
    .filter((item) => item.magnitude >= Math.max(0.12, threshold))
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 8)
    .sort((a, b) => a.index - b.index)
    .map((item) => ({
      timeSec: segments[item.index]!.startSec,
      type: item.delta >= 0 ? "rise" as const : "drop" as const,
      strength: Number(item.magnitude.toFixed(4)),
    }));
}

function hann(index: number, size: number) {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
}

function fftMagnitudes(frame: Float32Array) {
  const n = frame.length;
  const real = new Float64Array(n);
  const imag = new Float64Array(n);

  for (let i = 0; i < n; i += 1) real[i] = (frame[i] ?? 0) * hann(i, n);

  let j = 0;
  for (let i = 1; i < n; i += 1) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      const tempReal = real[i]!;
      const tempImag = imag[i]!;
      real[i] = real[j]!;
      imag[i] = imag[j]!;
      real[j] = tempReal;
      imag[j] = tempImag;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wLenReal = Math.cos(angle);
    const wLenImag = Math.sin(angle);
    for (let start = 0; start < n; start += len) {
      let wReal = 1;
      let wImag = 0;
      for (let offset = 0; offset < len / 2; offset += 1) {
        const even = start + offset;
        const odd = even + len / 2;
        const oddReal = real[odd]! * wReal - imag[odd]! * wImag;
        const oddImag = real[odd]! * wImag + imag[odd]! * wReal;
        const evenReal = real[even]!;
        const evenImag = imag[even]!;
        real[even] = evenReal + oddReal;
        imag[even] = evenImag + oddImag;
        real[odd] = evenReal - oddReal;
        imag[odd] = evenImag - oddImag;
        const nextWReal = wReal * wLenReal - wImag * wLenImag;
        wImag = wReal * wLenImag + wImag * wLenReal;
        wReal = nextWReal;
      }
    }
  }

  const magnitudes = new Float64Array(n / 2);
  for (let i = 0; i < magnitudes.length; i += 1) {
    magnitudes[i] = Math.hypot(real[i]!, imag[i]!);
  }
  return magnitudes;
}

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    aa += (a[i] ?? 0) ** 2;
    bb += (b[i] ?? 0) ** 2;
  }
  return dot / (Math.sqrt(aa * bb) || 1);
}

function rotatedProfile(profile: number[], root: number) {
  return Array.from({ length: 12 }, (_, pitchClass) => profile[(pitchClass - root + 12) % 12] ?? 0);
}

function inferKey(chroma: number[]) {
  const candidates: Array<{ name: string; score: number }> = [];
  for (let root = 0; root < 12; root += 1) {
    candidates.push({ name: `${NOTE_NAMES[root]} major`, score: cosineSimilarity(chroma, rotatedProfile(MAJOR_PROFILE, root)) });
    candidates.push({ name: `${NOTE_NAMES[root]} minor`, score: cosineSimilarity(chroma, rotatedProfile(MINOR_PROFILE, root)) });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const second = candidates[1];
  if (!best) return { key: null as string | null, confidence: null as number | null };
  const margin = Math.max(0, best.score - (second?.score ?? 0));
  const confidence = clamp(margin * 6 + Math.max(0, best.score - 0.65) * 0.8);
  return { key: confidence >= 0.18 ? best.name : null, confidence };
}

function spectralSummary(samples: Float32Array, sampleRate: number) {
  if (samples.length < FFT_SIZE) {
    return {
      centroidHz: null as number | null,
      brightness: null as number | null,
      lowEnergy: null as number | null,
      highEnergy: null as number | null,
      chroma: Array(12).fill(0) as number[],
    };
  }

  const frameCount = Math.min(MAX_SPECTRAL_FRAMES, Math.floor(samples.length / FFT_SIZE));
  const step = Math.max(FFT_SIZE, Math.floor((samples.length - FFT_SIZE) / Math.max(1, frameCount - 1)));
  const chroma = Array(12).fill(0) as number[];
  let centroidTotal = 0;
  let lowTotal = 0;
  let highTotal = 0;
  let allTotal = 0;
  let analyzed = 0;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const start = Math.min(samples.length - FFT_SIZE, frameIndex * step);
    const frame = samples.slice(start, start + FFT_SIZE);
    const magnitudes = fftMagnitudes(frame);
    let weighted = 0;
    let magnitudeSum = 0;
    let low = 0;
    let high = 0;

    for (let bin = 1; bin < magnitudes.length; bin += 1) {
      const magnitude = magnitudes[bin] ?? 0;
      const frequency = (bin * sampleRate) / FFT_SIZE;
      weighted += frequency * magnitude;
      magnitudeSum += magnitude;
      if (frequency <= 250) low += magnitude;
      if (frequency >= 4000) high += magnitude;
      if (frequency >= 65 && frequency <= 5000 && magnitude > 0) {
        const midi = 69 + 12 * Math.log2(frequency / 440);
        const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
        chroma[pitchClass] += magnitude;
      }
    }

    if (magnitudeSum > 0) {
      centroidTotal += weighted / magnitudeSum;
      lowTotal += low;
      highTotal += high;
      allTotal += magnitudeSum;
      analyzed += 1;
    }
  }

  const maxChroma = Math.max(...chroma, 1e-9);
  return {
    centroidHz: analyzed ? centroidTotal / analyzed : null,
    brightness: allTotal ? highTotal / allTotal : null,
    lowEnergy: allTotal ? lowTotal / allTotal : null,
    highEnergy: allTotal ? highTotal / allTotal : null,
    chroma: chroma.map((value) => value / maxChroma),
  };
}

function sectionCandidates(
  energySegments: Array<{ startSec: number; relativeEnergy: number }>,
) {
  if (energySegments.length < 3) return [];
  const changes = energySegments.slice(1).map((segment, index) => ({
    timeSec: segment.startSec,
    strength: Math.abs(segment.relativeEnergy - energySegments[index]!.relativeEnergy),
  }));
  const threshold = mean(changes.map((item) => item.strength)) + std(changes.map((item) => item.strength)) * 0.7;
  return changes
    .filter((item) => item.strength >= Math.max(0.1, threshold))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 8)
    .sort((a, b) => a.timeSec - b.timeSec)
    .map((item) => ({ timeSec: Number(item.timeSec.toFixed(2)), strength: Number(item.strength.toFixed(4)) }));
}

function roughBeatTimestamps(primaryBpm: number | null, onsets: number[], sampleRate: number, durationSec: number) {
  if (!primaryBpm || !onsets.length) return [];
  const threshold = percentile(onsets, 0.9);
  let strongestIndex = 0;
  let strongest = -1;
  for (let i = 0; i < Math.min(onsets.length, Math.ceil((sampleRate / RMS_HOP) * 20)); i += 1) {
    const value = onsets[i] ?? 0;
    if (value >= threshold && value > strongest) {
      strongest = value;
      strongestIndex = i;
    }
  }
  const offset = (strongestIndex * RMS_HOP) / sampleRate;
  const interval = 60 / primaryBpm;
  const beats: number[] = [];
  let time = offset;
  while (time > interval) time -= interval;
  while (time < durationSec && beats.length < 128) {
    if (time >= 0) beats.push(Number(time.toFixed(3)));
    time += interval;
  }
  return beats;
}

export async function analyzeStage0Dsp(file: File): Promise<Stage0DspEvidence> {
  const totalStart = nowMs();
  const limitations = [
    "Stage 0 is deterministic signal-derived supporting evidence, not musical ground truth.",
    "Tempo tracking can confuse half-time/double-time, syncopated grooves, sparse percussion, and weak onsets.",
    "Key estimation is chroma/profile-based and intentionally suppressed when confidence is weak.",
    "Section-change candidates are signal-change hints only; they are not automatic song-section labels.",
    "Meter/downbeat classification is not reported in this first DSP experiment because confidence is not reliable enough.",
  ];

  let context: AudioContext | null = null;
  let decodeMs: number | null = null;
  try {
    const decodeStart = nowMs();
    const arrayBuffer = await file.arrayBuffer();
    context = new AudioContext();
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    decodeMs = nowMs() - decodeStart;

    const mono = mixToMono(decoded);
    const { samples, sampleRate } = resampleLinear(mono, decoded.sampleRate, TARGET_SAMPLE_RATE);
    const dspStart = nowMs();

    const durationSec = samples.length / sampleRate;
    const rms = rmsEnvelope(samples);
    const onsets = onsetEnvelope(rms);
    const tempo = autocorrelationTempo(onsets, sampleRate);
    const localTempos = segmentTempo(onsets, sampleRate, 3);
    const localMean = mean(localTempos);
    const localSpread = std(localTempos, localMean);
    const stabilityScore = localTempos.length >= 2 && localMean > 0 ? clamp(1 - localSpread / Math.max(1, localMean * 0.08)) : null;
    const stable = stabilityScore == null ? null : stabilityScore >= 0.65;

    const primaryBpm = tempo.bpm;
    const halfTime = primaryBpm && primaryBpm / 2 >= 20 ? Number((primaryBpm / 2).toFixed(1)) : null;
    const doubleTime = primaryBpm && primaryBpm * 2 <= 300 ? Number((primaryBpm * 2).toFixed(1)) : null;
    const secondCandidate = tempo.candidates[1];
    const ambiguous = tempo.confidence == null
      ? null
      : tempo.confidence < 0.58 || Boolean(secondCandidate && Math.abs(secondCandidate.score - (tempo.candidates[0]?.score ?? 0)) < 0.08);

    const onsetThreshold = mean(onsets) + std(onsets) * 0.75;
    const onsetCount = onsets.filter((value) => value > onsetThreshold).length;
    const onsetDensity = durationSec > 0 ? onsetCount / durationSec : 0;

    const rmsMean = mean(rms);
    const rmsStd = std(rms, rmsMean);
    const p10 = percentile(rms, 0.1);
    const p90 = percentile(rms, 0.9);
    const dynamicRangeDb = p10 > 1e-7 && p90 > 0 ? 20 * Math.log10(p90 / p10) : null;
    const energySegments = buildEnergySegments(rms, durationSec);
    const majorChanges = energyChanges(energySegments);

    const spectral = spectralSummary(samples, sampleRate);
    const key = inferKey(spectral.chroma);
    const chromaSummary = spectral.chroma.map((value) => Number(clamp(value).toFixed(4)));
    const sectionChangeCandidates = sectionCandidates(energySegments);
    const beatTimestamps = roughBeatTimestamps(primaryBpm, onsets, sampleRate, durationSec);

    if (primaryBpm == null) limitations.push("No reliable primary BPM candidate could be extracted.");
    if (ambiguous) limitations.push("Tempo evidence is ambiguous; half-time/double-time interpretation requires musical cross-check in Stage A.");
    if (key.key == null) limitations.push("Tonal key candidate suppressed because chroma-profile confidence is weak.");

    const dspMs = nowMs() - dspStart;
    const result: Stage0DspEvidence = {
      version: "stage0-dsp-v1",
      available: true,
      processing: {
        decodeMs: Number(decodeMs.toFixed(2)),
        dspMs: Number(dspMs.toFixed(2)),
        totalMs: Number((nowMs() - totalStart).toFixed(2)),
        sourceSampleRate: decoded.sampleRate,
        analysisSampleRate: sampleRate,
        durationSeconds: Number(durationSec.toFixed(3)),
        channels: decoded.numberOfChannels,
      },
      tempo: {
        primaryBpm,
        halfTimeCandidate: halfTime,
        doubleTimeCandidate: doubleTime,
        confidence: tempo.confidence == null ? null : Number(tempo.confidence.toFixed(4)),
        stable,
        stabilityScore: stabilityScore == null ? null : Number(stabilityScore.toFixed(4)),
        ambiguous,
        notes: [
          primaryBpm != null ? `Autocorrelation onset-envelope primary grid estimate: ${primaryBpm} BPM.` : "No stable primary grid estimate.",
          tempo.candidates.length > 1 ? `Alternate autocorrelation candidates: ${tempo.candidates.slice(1).map((item) => `${item.bpm} BPM`).join(", ")}.` : "",
          localTempos.length ? `Segment tempo estimates: ${localTempos.map((value) => value.toFixed(1)).join(", ")} BPM.` : "",
          "Use half/double candidates as ambiguity checks, not as automatic alternatives.",
        ].filter(Boolean).join(" "),
      },
      rhythm: {
        beatStrength: tempo.confidence == null ? null : Number(tempo.confidence.toFixed(4)),
        onsetDensity: Number(onsetDensity.toFixed(4)),
        meterCandidate: null,
        meterConfidence: null,
        beatTimestamps,
        notes: "Onset density is derived from positive RMS-energy changes. Beat timestamps are a rough grid anchored to a strong early onset and are not downbeat labels.",
      },
      energy: {
        meanRms: Number(rmsMean.toFixed(6)),
        stdRms: Number(rmsStd.toFixed(6)),
        dynamicRangeDb: dynamicRangeDb == null ? null : Number(dynamicRangeDb.toFixed(3)),
        energySegments,
        majorChanges,
      },
      tonal: {
        keyCandidate: key.key,
        keyConfidence: key.confidence == null ? null : Number(key.confidence.toFixed(4)),
        chromaSummary,
        notes: key.key ? "Key is a tentative chroma-profile candidate and must not influence genre classification." : "Key uncertain; chroma profile did not separate one tonal center strongly enough.",
      },
      spectral: {
        spectralCentroidHz: spectral.centroidHz == null ? null : Number(spectral.centroidHz.toFixed(2)),
        brightness: spectral.brightness == null ? null : Number(clamp(spectral.brightness).toFixed(4)),
        lowFrequencyEnergy: spectral.lowEnergy == null ? null : Number(clamp(spectral.lowEnergy).toFixed(4)),
        highFrequencyEnergy: spectral.highEnergy == null ? null : Number(clamp(spectral.highEnergy).toFixed(4)),
      },
      sectionChangeCandidates,
      limitations,
    };

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      version: "stage0-dsp-v1",
      available: false,
      processing: {
        decodeMs: decodeMs == null ? null : Number(decodeMs.toFixed(2)),
        dspMs: null,
        totalMs: Number((nowMs() - totalStart).toFixed(2)),
        sourceSampleRate: null,
        analysisSampleRate: null,
        durationSeconds: null,
        channels: null,
      },
      tempo: null,
      rhythm: null,
      energy: null,
      tonal: null,
      spectral: null,
      sectionChangeCandidates: [],
      limitations: [
        "Stage 0 DSP unavailable; Analyzer should continue with Stage A/B audio analysis.",
        `DSP/decode failure: ${message.slice(0, 500)}`,
      ],
    };
  } finally {
    if (context) void context.close().catch(() => undefined);
  }
}
