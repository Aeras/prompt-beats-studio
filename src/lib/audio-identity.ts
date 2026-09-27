export type AudioIdentity = {
  contentHash: string;
  fingerprint: string;
  durationSeconds: number;
};

const FINGERPRINT_BINS = 64;
const MAX_SAMPLES_PER_BIN = 4096;

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getAudioContextCtor(): typeof AudioContext {
  const win = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) throw new Error("Audio analysis is not supported by this browser.");
  return Ctor;
}

function buildEnvelopeFingerprint(buffer: AudioBuffer): string {
  const values: number[] = [];
  const totalFrames = buffer.length;
  const channels = buffer.numberOfChannels;

  for (let bin = 0; bin < FINGERPRINT_BINS; bin += 1) {
    const start = Math.floor((bin * totalFrames) / FINGERPRINT_BINS);
    const end = Math.max(start + 1, Math.floor(((bin + 1) * totalFrames) / FINGERPRINT_BINS));
    const span = end - start;
    const step = Math.max(1, Math.floor(span / MAX_SAMPLES_PER_BIN));
    let sumSquares = 0;
    let samples = 0;

    for (let frame = start; frame < end; frame += step) {
      let mono = 0;
      for (let channel = 0; channel < channels; channel += 1) {
        mono += buffer.getChannelData(channel)[frame] ?? 0;
      }
      mono /= Math.max(1, channels);
      sumSquares += mono * mono;
      samples += 1;
    }

    const rms = Math.sqrt(sumSquares / Math.max(1, samples));
    const db = Math.max(-72, Math.min(0, 20 * Math.log10(Math.max(rms, 0.000001))));
    values.push((db + 72) / 72);
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const centered = values.map((value) => value - mean);
  const maxAbs = Math.max(0.000001, ...centered.map((value) => Math.abs(value)));
  return centered
    .map((value) => Math.max(0, Math.min(255, Math.round(((value / maxAbs + 1) / 2) * 255))))
    .join(",");
}

export async function computeAudioIdentity(file: File): Promise<AudioIdentity> {
  const bytes = await file.arrayBuffer();
  const contentHash = toHex(await crypto.subtle.digest("SHA-256", bytes));
  const AudioContextCtor = getAudioContextCtor();
  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData(bytes.slice(0));
    return {
      contentHash,
      fingerprint: buildEnvelopeFingerprint(decoded),
      durationSeconds: Math.max(0, Math.round(decoded.duration)),
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}
