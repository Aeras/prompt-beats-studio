import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordAiUsage } from "@/lib/ai-usage.server";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import { stage0DspEvidenceSchema } from "@/lib/song-analyzer-dsp.shared";
import {
  songAnalysisResultSchema,
  type SongAnalysisResult,
  type StageAEvidence,
} from "@/lib/song-analyzer.functions";

const confidenceSchema = z.enum(["high", "medium", "low"]);
const analyzerModelSchema = z.enum(["gemini-3.8-flash", "gemini-3.1-pro-preview"]);
const supportedMimeTypes = z.enum([
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

const evidenceItemSchema = z
  .object({
    instrument: z.string().trim().min(1).max(500),
    role: z.string().trim().max(1000),
    technique: z.string().trim().max(500).nullable(),
    timbre: z.string().trim().max(500).nullable(),
    prominence: z.enum(["dominant", "major", "supporting"]),
    confidence: confidenceSchema,
    evidence: z.string().trim().max(2000),
  })
  .passthrough();

const dominantItemSchema = z
  .object({
    category: z.enum(["instrument", "groove", "texture", "melodic_figure", "other"]),
    element: z.string().trim().min(1).max(500),
    role: z.string().trim().max(1000),
    technique: z.string().trim().max(500).nullable(),
    prominence: z.enum(["dominant", "major", "supporting"]),
    confidence: confidenceSchema,
    evidence: z.string().trim().max(2000),
  })
  .passthrough();

const claimSchema = z
  .object({
    claim: z.string().trim().min(1).max(1200),
    evidence: z.string().trim().max(2000),
    confidence: confidenceSchema,
  })
  .passthrough();

const sectionSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    startSeconds: z.number().nonnegative().finite().nullable(),
    endSeconds: z.number().nonnegative().finite().nullable(),
    evidence: z.string().trim().max(1500),
    confidence: confidenceSchema,
  })
  .passthrough();

const stageAGuardSchema = z
  .object({
    tempo: z
      .object({
        gridCandidates: z.array(z.number().min(20).max(300)).min(1).max(6),
        feltTempo: z.number().min(20).max(300).nullable(),
        possibleHalfTime: z.number().min(20).max(300).nullable(),
        possibleDoubleTime: z.number().min(20).max(300).nullable(),
        confidence: confidenceSchema,
        notes: z.string().trim().max(2500),
      })
      .passthrough(),
    drumPercussionEvidence: z.array(claimSchema).max(30),
    bassEvidence: z.array(claimSchema).max(20),
    harmonicFoundation: z.array(claimSchema).max(20),
    dominantElements: z.array(dominantItemSchema).min(3).max(5),
    instrumentEvidence: z.array(evidenceItemSchema).max(30),
    songSections: z.array(sectionSchema).min(1).max(30),
    uncertaintyNotes: z.array(z.string().trim().min(1).max(2000)).max(30),
  })
  .passthrough();

const guardInputSchema = z.object({
  audioBase64: z.string().min(1).max(21_500_000),
  mimeType: supportedMimeTypes,
  model: analyzerModelSchema,
  stage0Evidence: stage0DspEvidenceSchema,
  stageAEvidence: stageAGuardSchema,
  initialResult: songAnalysisResultSchema,
});

const rhythmicLayerValueSchema = z.enum([
  "guitar",
  "processed_guitar",
  "synth_pluck",
  "other_plucked_string",
  "mixed",
  "uncertain",
]);

const verifierSchema = z.object({
  drumSource: z.object({
    value: z.enum(["acoustic", "programmed", "hybrid", "uncertain"]),
    confidence: confidenceSchema,
    evidence: z.string().trim().min(1).max(1000),
  }),
  bassSource: z.object({
    value: z.enum(["electric", "synth", "hybrid", "uncertain"]),
    confidence: confidenceSchema,
    evidence: z.string().trim().min(1).max(1000),
  }),
  guitarPresence: z.object({
    value: z.enum(["none", "rhythm", "lead", "both", "uncertain"]),
    confidence: confidenceSchema,
    evidence: z.string().trim().min(1).max(1000),
  }),
  synthPresence: z.object({
    value: z.enum(["none", "supporting", "major", "uncertain"]),
    confidence: confidenceSchema,
    evidence: z.string().trim().min(1).max(1000),
  }),
  rhythmicLayerSource: z.object({
    value: rhythmicLayerValueSchema,
    confidence: confidenceSchema,
    evidence: z.string().trim().min(1).max(1400),
    cues: z.array(z.string().trim().min(1).max(300)).max(8),
  }),
  feltTempo: z.object({
    bpm: z.number().min(20).max(300).nullable(),
    confidence: confidenceSchema,
    evidence: z.string().trim().min(1).max(1000),
  }),
});

type Verification = z.infer<typeof verifierSchema>;
type Confidence = "high" | "medium" | "low";
type Stage0Evidence = z.infer<typeof stage0DspEvidenceSchema>;

const VERIFIER_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    drumSource: {
      type: "OBJECT",
      properties: {
        value: { type: "STRING", enum: ["acoustic", "programmed", "hybrid", "uncertain"] },
        confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        evidence: { type: "STRING" },
      },
      required: ["value", "confidence", "evidence"],
    },
    bassSource: {
      type: "OBJECT",
      properties: {
        value: { type: "STRING", enum: ["electric", "synth", "hybrid", "uncertain"] },
        confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        evidence: { type: "STRING" },
      },
      required: ["value", "confidence", "evidence"],
    },
    guitarPresence: {
      type: "OBJECT",
      properties: {
        value: { type: "STRING", enum: ["none", "rhythm", "lead", "both", "uncertain"] },
        confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        evidence: { type: "STRING" },
      },
      required: ["value", "confidence", "evidence"],
    },
    synthPresence: {
      type: "OBJECT",
      properties: {
        value: { type: "STRING", enum: ["none", "supporting", "major", "uncertain"] },
        confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        evidence: { type: "STRING" },
      },
      required: ["value", "confidence", "evidence"],
    },
    rhythmicLayerSource: {
      type: "OBJECT",
      properties: {
        value: {
          type: "STRING",
          enum: ["guitar", "processed_guitar", "synth_pluck", "other_plucked_string", "mixed", "uncertain"],
        },
        confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        evidence: { type: "STRING" },
        cues: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["value", "confidence", "evidence", "cues"],
    },
    feltTempo: {
      type: "OBJECT",
      properties: {
        bpm: { type: "NUMBER", nullable: true },
        confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        evidence: { type: "STRING" },
      },
      required: ["bpm", "confidence", "evidence"],
    },
  },
  required: ["drumSource", "bassSource", "guitarPresence", "synthPresence", "rhythmicLayerSource", "feltTempo"],
} as const;

const VERIFIER_SYSTEM_PROMPT = `You are PromptBeats Stage A Critical Evidence Verifier.
You hear the same source audio as the first Stage A pass. You are NOT a genre classifier.
Independently verify six high-impact facts that have caused run-to-run instability:
1. acoustic vs programmed/hybrid drum source,
2. electric vs synth/hybrid bass source,
3. audible rhythm/lead guitar presence,
4. material synthesizer presence,
5. neutral source identity of any ambiguous recurring rhythmic pluck/strum layer,
6. felt tempo / half-double-time interpretation.

NEUTRAL RHYTHMIC-LAYER RESOLVER
When the supplied prompt says rhythmicLayerResolutionRequired=true, classify the recurring ambiguous mid/high rhythmic layer among these equal-priority possibilities: guitar, processed_guitar, synth_pluck, other_plucked_string, mixed, uncertain. Do not search for guitar preferentially. Use guitar or processed_guitar only when at least two independent guitar-like cues are audible, such as repeated chord strokes, pick/transient attacks, string resonance, fretting/muting noise, natural timing/velocity variation, or guitar-like harmonic decay. Quantized repetition, perfectly repeated envelopes, resonant synth filtering, or sequenced arpeggiation support synth_pluck. If cues conflict or are weak, use mixed or uncertain. When rhythmicLayerResolutionRequired=false, return uncertain unless an obvious layer is directly relevant to a supplied claim.

If a DEMUCS OTHER-STEM PREVIEW is supplied, use it ONLY to resolve guitar / processed-guitar / synth-pluck / other-plucked-string / mixed / uncertain source identity and recurring guitar presence. The other stem is a residual mixture, not a solo guitar stem. Cross-check it against the full mix. It must not override full-mix evidence for drums, bass, tempo, vocals, or genre, and it must not create a guitar claim unless at least two direct guitar-like articulation cues are audible.

For rhythm guitar, explicitly test whether a sustained chordal strumming/comping texture is audible across meaningful sections. Do not reduce a clearly recurring rhythm-guitar part to a generic plucked-string or synth label merely because acoustic-vs-clean-electric source is uncertain. Conversely, do not call a quantized pluck patch or sampled transient a guitar without direct guitar-like articulation evidence.

Do not trust the first Stage A pass merely because it is supplied. Treat it as claims to test against the audio.
Use high confidence only when direct timbre/articulation/rhythmic evidence is unmistakable. If source identity is ambiguous, return uncertain or mixed rather than guessing.
Do not identify artist/track, do not classify genre, and do not transcribe lyrics.
Return only the requested JSON.`;

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

function confidenceRank(value: Confidence) {
  return value === "high" ? 2 : value === "medium" ? 1 : 0;
}

function lowerConfidence(current: Confidence, verifierConfidence: Confidence) {
  if (verifierConfidence === "high") return "low" as const;
  if (verifierConfidence === "medium" && current === "high") return "medium" as const;
  return current;
}

function explicitMmSs(text: string) {
  const values: Array<{ seconds: number; concatenated: number }> = [];
  const regex = /\b(\d{1,2}):([0-5]\d)\b/g;
  for (const match of text.matchAll(regex)) {
    const minutes = Number(match[1]);
    const secondsPart = Number(match[2]);
    values.push({
      seconds: minutes * 60 + secondsPart,
      concatenated: Number(`${minutes}${match[2]}`),
    });
  }
  return values;
}

function compactMmSsSeconds(value: number) {
  if (!Number.isInteger(value) || value < 100) return null;
  const minutes = Math.floor(value / 100);
  const secondsPart = value % 100;
  if (minutes < 1 || secondsPart >= 60) return null;
  const seconds = minutes * 60 + secondsPart;
  return seconds === value ? null : seconds;
}

function collectCrossFieldClockSeconds(evidence: StageAEvidence) {
  const texts = [
    ...evidence.arrangementChanges.map((item) => `${item.claim} ${item.evidence}`),
    ...evidence.melodicElements.map((item) => `${item.claim} ${item.evidence}`),
    ...evidence.instrumentEvidence.map((item) => `${item.instrument} ${item.role} ${item.technique ?? ""} ${item.evidence}`),
    ...evidence.dominantElements.map((item) => `${item.element} ${item.role} ${item.technique ?? ""} ${item.evidence}`),
    ...evidence.energyProgression.map((item) => `${item.claim} ${item.evidence}`),
    ...evidence.productionMixEvidence.map((item) => `${item.claim} ${item.evidence}`),
    ...evidence.vocalCharacteristics.map((item) => `${item.claim} ${item.evidence}`),
  ];
  return new Set(texts.flatMap((text) => explicitMmSs(text).map((value) => value.seconds)));
}

function matchesCrossFieldClock(value: number, crossFieldClockSeconds: Set<number>) {
  for (const seconds of crossFieldClockSeconds) {
    if (Math.abs(value - seconds) <= 1) return true;
  }
  return false;
}

function repairTimelineBoundary(
  value: number | null,
  explicit: { seconds: number; concatenated: number } | undefined,
  durationSeconds: number,
  compactClockMode: boolean,
  crossFieldClockSeconds: Set<number>,
) {
  if (value == null) return { value, corrected: false, removed: false };
  if (
    explicit &&
    explicit.seconds <= durationSeconds + 0.5 &&
    Math.abs(value - explicit.concatenated) <= 1 &&
    Math.abs(value - explicit.seconds) > 1
  ) {
    return { value: explicit.seconds, corrected: true, removed: false };
  }
  const decoded = compactMmSsSeconds(value);
  const crossFieldConfirmed = decoded != null && matchesCrossFieldClock(decoded, crossFieldClockSeconds);
  if ((compactClockMode || crossFieldConfirmed) && decoded != null && decoded <= durationSeconds + 0.5) {
    return { value: decoded, corrected: true, removed: false };
  }
  if (value > durationSeconds + 0.5) {
    if (explicit && explicit.seconds <= durationSeconds + 0.5) {
      return { value: explicit.seconds, corrected: true, removed: false };
    }
    return { value: null, corrected: false, removed: true };
  }
  return { value, corrected: false, removed: false };
}

function sanitizeTimeline(evidence: StageAEvidence, durationSeconds: number | null) {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return evidence;

  const crossFieldClockSeconds = collectCrossFieldClockSeconds(evidence);
  const provenCompactCorrections = evidence.songSections.reduce((count, section) => {
    const explicit = explicitMmSs(`${section.label} ${section.evidence}`);
    const values = [section.startSeconds, section.endSeconds];
    return count + values.reduce((inner, value, index) => {
      const timestamp = explicit[index];
      const explicitMatch =
        value != null &&
        timestamp != null &&
        Math.abs(value - timestamp.concatenated) <= 1 &&
        Math.abs(value - timestamp.seconds) > 1;
      const decoded = value == null ? null : compactMmSsSeconds(value);
      const crossFieldMatch = decoded != null && matchesCrossFieldClock(decoded, crossFieldClockSeconds);
      return inner + Number(explicitMatch || crossFieldMatch);
    }, 0);
  }, 0);
  const compactClockMode = provenCompactCorrections >= 2;

  let corrections = 0;
  let removals = 0;
  let overlapRepairs = 0;
  let previousStart: number | null = null;

  const songSections = evidence.songSections.map((section) => {
    let confidence = section.confidence;
    const explicit = explicitMmSs(`${section.label} ${section.evidence}`);
    const repairedStart = repairTimelineBoundary(section.startSeconds, explicit[0], durationSeconds, compactClockMode, crossFieldClockSeconds);
    const repairedEnd = repairTimelineBoundary(section.endSeconds, explicit[1], durationSeconds, compactClockMode, crossFieldClockSeconds);
    let startSeconds = repairedStart.value;
    let endSeconds = repairedEnd.value;

    if (repairedStart.corrected || repairedEnd.corrected) {
      corrections += Number(repairedStart.corrected) + Number(repairedEnd.corrected);
      if (confidence === "high") confidence = "medium";
    }
    if (repairedStart.removed || repairedEnd.removed) {
      removals += Number(repairedStart.removed) + Number(repairedEnd.removed);
      confidence = "low";
    }
    if (startSeconds != null && previousStart != null && startSeconds + 0.5 < previousStart) {
      startSeconds = null;
      endSeconds = null;
      removals += 1;
      confidence = "low";
    }
    if (startSeconds != null && endSeconds != null && endSeconds < startSeconds) {
      endSeconds = null;
      removals += 1;
      confidence = "low";
    }
    if (startSeconds != null) previousStart = startSeconds;
    return { ...section, startSeconds, endSeconds, confidence };
  });

  for (let index = 1; index < songSections.length; index += 1) {
    const previous = songSections[index - 1];
    const current = songSections[index];
    if (
      previous.startSeconds != null &&
      previous.endSeconds != null &&
      current.startSeconds != null &&
      previous.endSeconds > current.startSeconds + 0.5 &&
      current.startSeconds >= previous.startSeconds
    ) {
      songSections[index - 1] = {
        ...previous,
        endSeconds: current.startSeconds,
        confidence: previous.confidence === "high" ? "medium" : previous.confidence,
      };
      overlapRepairs += 1;
    }
  }

  const uncertaintyNotes = [...evidence.uncertaintyNotes];
  if (corrections || removals || overlapRepairs) {
    uncertaintyNotes.push(
      `Deterministic timeline guard corrected ${corrections} mm:ss-to-seconds confusion(s), repaired ${overlapRepairs} overlapping boundary pair(s), and removed ${removals} boundary value(s) outside or inconsistent with the measured ${durationSeconds.toFixed(2)} s duration. Compact mm:ss recovery mode=${compactClockMode ? "on" : "off"}; cross-field clock references=${crossFieldClockSeconds.size}. Null boundaries must remain uncertain downstream.`,
    );
  }
  return { ...evidence, songSections, uncertaintyNotes: uncertaintyNotes.slice(0, 30) };
}

function redactQuotedMultiwordText(text: string, onRedaction: () => void) {
  const patterns = [
    /"([^"\n]{1,180})"/g,
    /'([^'\n]{1,180})'/g,
    /“([^”\n]{1,180})”/g,
    /‘([^’\n]{1,180})’/g,
  ];
  let output = text;
  for (const pattern of patterns) {
    output = output.replace(pattern, (full, inner: string) => {
      const words = inner.trim().split(/\s+/).filter(Boolean);
      const looksLikePhrase = words.length >= 2 && /[\p{L}]/u.test(inner);
      if (!looksLikePhrase) return full;
      onRedaction();
      return "[lyrics omitted]";
    });
  }
  return output;
}

function sanitizeLyricTranscription(evidence: StageAEvidence) {
  let redactions = 0;
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      return redactQuotedMultiwordText(value, () => {
        redactions += 1;
      });
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, walk(child)]));
    }
    return value;
  };
  const sanitized = walk(evidence) as StageAEvidence;
  if (!redactions) return sanitized;
  return {
    ...sanitized,
    uncertaintyNotes: [
      ...sanitized.uncertaintyNotes,
      `Stage A lyric guard redacted ${redactions} quoted multi-word lyric fragment(s); musical evidence was preserved without lyric transcription.`,
    ].slice(0, 30),
  };
}

function isHalfDoublePair(a: number, b: number) {
  const ratio = Math.max(a, b) / Math.min(a, b);
  return ratio >= 1.85 && ratio <= 2.15;
}

function rhythmicLayerResolutionRequired(evidence: StageAEvidence) {
  const texts = [
    ...evidence.instrumentEvidence.map((item) => `${item.instrument} ${item.role} ${item.technique ?? ""} ${item.timbre ?? ""} ${item.evidence}`),
    ...evidence.dominantElements.map((item) => `${item.element} ${item.role} ${item.technique ?? ""} ${item.evidence}`),
  ].map((text) => text.toLowerCase());
  const hasGuitar = texts.some((text) => /guitar|strum|palm mut|rhythmic comp/.test(text));
  const hasSynthPluck = texts.some((text) => /synth(?:esizer)?.*pluck|pluck.*synth|arpeggi/.test(text));
  const explicitlyAmbiguous = texts.some((text) => /plucked (?:guitar|string)|guitar\s*\/|\/\s*(?:string|guitar)|string instrument|guitar-like|pluck(?:ed)? layer/.test(text));
  return explicitlyAmbiguous || hasSynthPluck || (hasGuitar && hasSynthPluck);
}

function reconcileVerification(evidence: StageAEvidence, verification: Verification, stage0Evidence: Stage0Evidence) {
  const notes = [...evidence.uncertaintyNotes];
  const conflicts: string[] = [];
  const verifierStrongEnough = (confidence: Confidence) => confidenceRank(confidence) >= 1;
  const layerNeedsResolution = rhythmicLayerResolutionRequired(evidence);

  let instrumentEvidence = evidence.instrumentEvidence.map((item) => {
    const text = `${item.instrument} ${item.role} ${item.technique ?? ""} ${item.timbre ?? ""}`.toLowerCase();
    let confidence = item.confidence;

    if (verifierStrongEnough(verification.drumSource.confidence)) {
      const acousticDrum = /acoustic.*drum|drum kit/.test(text);
      const programmedDrum = /drum machine|programmed.*drum|electronic.*drum/.test(text);
      if (verification.drumSource.value === "acoustic" && programmedDrum) {
        confidence = lowerConfidence(confidence, verification.drumSource.confidence);
        conflicts.push("programmed/electronic drum identity contradicted by verification");
      } else if (verification.drumSource.value === "programmed" && acousticDrum) {
        confidence = lowerConfidence(confidence, verification.drumSource.confidence);
        conflicts.push("acoustic drum-kit identity contradicted by verification");
      } else if (verification.drumSource.value === "uncertain" && (acousticDrum || programmedDrum) && confidence === "high") {
        confidence = "medium";
      }
    }

    if (verifierStrongEnough(verification.bassSource.confidence)) {
      const synthBass = /synth.*bass|sub.?bass/.test(text);
      const electricBass = /electric bass|bass guitar/.test(text);
      if (verification.bassSource.value === "electric" && synthBass) {
        confidence = lowerConfidence(confidence, verification.bassSource.confidence);
        conflicts.push("synth-bass identity contradicted by verification");
      } else if (verification.bassSource.value === "synth" && electricBass) {
        confidence = lowerConfidence(confidence, verification.bassSource.confidence);
        conflicts.push("electric-bass identity contradicted by verification");
      } else if (verification.bassSource.value === "uncertain" && (synthBass || electricBass) && confidence === "high") {
        confidence = "medium";
      }
    }

    if (verifierStrongEnough(verification.guitarPresence.confidence) && /guitar/.test(text)) {
      const lead = /lead|solo|bend|vibrato/.test(text);
      const rhythm = /rhythm|strum|chord|palm mut/.test(text);
      const value = verification.guitarPresence.value;
      const contradiction = value === "none" || (value === "rhythm" && lead) || (value === "lead" && rhythm && !lead);
      if (contradiction) {
        confidence = lowerConfidence(confidence, verification.guitarPresence.confidence);
        conflicts.push("guitar role/presence contradicted by verification");
      } else if (value === "uncertain" && confidence === "high") {
        confidence = "medium";
      }
    }

    if (
      verifierStrongEnough(verification.synthPresence.confidence) &&
      verification.synthPresence.value === "none" &&
      /synth|synthesizer/.test(text)
    ) {
      confidence = lowerConfidence(confidence, verification.synthPresence.confidence);
      conflicts.push("material synthesizer identity contradicted by verification");
    }
    return confidence === item.confidence ? item : { ...item, confidence };
  });

  let dominantElements = evidence.dominantElements.map((item) => {
    const text = `${item.element} ${item.role} ${item.technique ?? ""}`.toLowerCase();
    let confidence = item.confidence;
    if (verification.guitarPresence.confidence === "high" && verification.guitarPresence.value === "none" && /guitar/.test(text)) confidence = "low";
    if (verification.synthPresence.confidence === "high" && verification.synthPresence.value === "none" && /synth/.test(text)) confidence = "low";
    return confidence === item.confidence ? item : { ...item, confidence };
  });

  if (layerNeedsResolution) {
    const source = verification.rhythmicLayerSource;
    const sourceStrong = verifierStrongEnough(source.confidence);
    const candidateIndex = instrumentEvidence.findIndex((item) => {
      const text = `${item.instrument} ${item.role} ${item.technique ?? ""} ${item.timbre ?? ""} ${item.evidence}`.toLowerCase();
      return /guitar|string instrument|plucked string|synth(?:esizer)?.*pluck|pluck|arpeggi|strum|comp/.test(text);
    });

    if (candidateIndex >= 0) {
      const candidate = instrumentEvidence[candidateIndex];
      const candidateText = `${candidate.instrument} ${candidate.technique ?? ""} ${candidate.timbre ?? ""}`.toLowerCase();
      const firstPassGuitarCues = /guitar|strum|palm mut|chordal comp/.test(candidateText);
      const firstPassSynthCues = /synth|arpeggi|sequenc/.test(candidateText);
      instrumentEvidence = instrumentEvidence.map((item, index) => {
        if (index !== candidateIndex) return item;
        if (sourceStrong && (source.value === "guitar" || source.value === "processed_guitar")) {
          return {
            ...item,
            instrument: "Rhythm Guitar",
            role: item.role || "Harmonic and rhythmic accompaniment",
            technique: /strum|comp|chord/i.test(item.technique ?? "") ? item.technique : "Chordal strumming / rhythmic comping",
            timbre: [item.timbre, source.value === "processed_guitar" ? "processed/sampled guitar-like timbre" : "guitar timbre confirmed", "acoustic vs clean electric source unresolved"].filter(Boolean).join("; "),
            confidence: item.confidence === "low" && source.confidence === "high" ? "medium" : item.confidence,
          };
        }
        if (sourceStrong && source.value === "synth_pluck") {
          if (firstPassGuitarCues && !firstPassSynthCues) {
            return { ...item, instrument: "Rhythmic Plucked Layer", confidence: item.confidence === "high" ? "medium" : item.confidence };
          }
          return { ...item, instrument: "Synth Pluck / Arpeggio", confidence: item.confidence === "low" ? "medium" : item.confidence };
        }
        if (sourceStrong && source.value === "other_plucked_string") {
          return { ...item, instrument: "Plucked String Instrument", confidence: item.confidence === "high" ? "medium" : item.confidence };
        }
        if (source.value === "mixed") {
          return { ...item, instrument: "Rhythmic Plucked Layer", timbre: [item.timbre, "mixed guitar/synth-like source"].filter(Boolean).join("; "), confidence: item.confidence === "high" ? "medium" : item.confidence };
        }
        if (source.value === "uncertain") {
          return { ...item, instrument: "Rhythmic Plucked Layer", confidence: item.confidence === "high" ? "medium" : item.confidence };
        }
        return item;
      });
    } else if (
      source.value !== "uncertain" &&
      source.confidence === "high" &&
      instrumentEvidence.length < 30
    ) {
      if (source.value === "guitar" || source.value === "processed_guitar") {
        instrumentEvidence = [...instrumentEvidence, {
          instrument: "Rhythm Guitar",
          role: "Harmonic and rhythmic accompaniment",
          technique: "Chordal strumming / rhythmic comping",
          timbre: source.value === "processed_guitar" ? "Processed guitar timbre; acoustic vs clean electric source unresolved" : "Guitar timbre; acoustic vs clean electric source unresolved",
          prominence: "major",
          confidence: "medium",
          evidence: source.evidence,
        }];
      }
    }

    notes.push(
      `Stage A neutral source resolver: ambiguous rhythmic pluck/strum layer classified as ${source.value} with ${source.confidence} confidence. This resolver is source-neutral and must not create a guitar or synth identity without direct articulation evidence.`,
    );
  }

  const resolverSupportsGuitar =
    !layerNeedsResolution ||
    ((verification.rhythmicLayerSource.value === "guitar" || verification.rhythmicLayerSource.value === "processed_guitar") &&
      verifierStrongEnough(verification.rhythmicLayerSource.confidence));
  const rhythmGuitarConfirmed =
    resolverSupportsGuitar &&
    verifierStrongEnough(verification.guitarPresence.confidence) &&
    (verification.guitarPresence.value === "rhythm" || verification.guitarPresence.value === "both");

  if (rhythmGuitarConfirmed) {
    const candidateIndex = instrumentEvidence.findIndex((item) => {
      const text = `${item.instrument} ${item.role} ${item.technique ?? ""} ${item.timbre ?? ""} ${item.evidence}`.toLowerCase();
      return /guitar/.test(text) && /rhythm|strum|comp|chord|palm mut|accompan/.test(text);
    });
    if (candidateIndex >= 0) {
      const candidate = instrumentEvidence[candidateIndex];
      const sourceSpecific = /acoustic guitar|clean electric guitar|electric guitar/.test(candidate.instrument.toLowerCase());
      instrumentEvidence = instrumentEvidence.map((item, index) => index === candidateIndex ? {
        ...item,
        instrument: sourceSpecific ? candidate.instrument : "Rhythm Guitar",
        role: candidate.role || "Harmonic and rhythmic accompaniment",
        technique: candidate.technique && /strum|comp|chord/i.test(candidate.technique) ? candidate.technique : "Chordal strumming / rhythmic comping",
        timbre: sourceSpecific ? candidate.timbre : [candidate.timbre, "guitar timbre confirmed; acoustic vs clean electric source unresolved"].filter(Boolean).join("; "),
        confidence: candidate.confidence === "low" && verification.guitarPresence.confidence === "high" ? "medium" : candidate.confidence,
      } : item);
    }
    dominantElements = dominantElements.map((item) => {
      const text = `${item.element} ${item.role} ${item.technique ?? ""} ${item.evidence}`.toLowerCase();
      if (!/guitar|string instrument|plucked string|pluck/.test(text) || !/rhythm|strum|comp|chord|palm mut|accompan/.test(text)) return item;
      return {
        ...item,
        element: /guitar/.test(item.element.toLowerCase()) ? item.element : "Rhythm Guitar",
        technique: item.technique && /strum|comp|chord/i.test(item.technique) ? item.technique : "Chordal strumming / rhythmic comping",
      };
    });
    notes.push("Stage A guitar guard: independent audio verification confirmed a recurring rhythm-guitar role. Preserve the strummed/comping guitar in generator-ready Instruments while leaving acoustic-vs-clean-electric source unresolved unless direct evidence distinguishes it.");
  }

  let tempo = evidence.tempo;
  const verifiedTempo = verification.feltTempo.bpm;
  if (verifiedTempo != null && evidence.tempo.feltTempo != null) {
    const difference = Math.abs(verifiedTempo - evidence.tempo.feltTempo) / Math.max(verifiedTempo, evidence.tempo.feltTempo);
    if (isHalfDoublePair(verifiedTempo, evidence.tempo.feltTempo)) {
      tempo = {
        ...tempo,
        confidence: tempo.confidence === "low" ? "low" : "medium",
        notes: `${tempo.notes} Independent audio verification preferred ${verifiedTempo.toFixed(1)} BPM while the first Stage A pass preferred ${evidence.tempo.feltTempo.toFixed(1)} BPM; these are near half/double-time alternatives, so high confidence is prohibited.`,
      };
      conflicts.push("felt tempo changed by a half/double-time factor between independent audio passes");
    } else if (difference > 0.12 && verification.feltTempo.confidence !== "low") {
      tempo = {
        ...tempo,
        confidence: "low",
        notes: `${tempo.notes} Independent audio verification estimated ${verifiedTempo.toFixed(1)} BPM, materially disagreeing with the first Stage A felt tempo; preserve the disagreement rather than forcing precision.`,
      };
      conflicts.push("felt tempo materially disagreed between independent audio passes");
    }
  }

  if (stage0Evidence.tempo?.ambiguous) {
    notes.push("Stage A tempo guard: Stage 0 reports a half/double-time ambiguity. The selected BPM may describe either the felt pulse or a subdivision grid; BPM alone must never determine genre family without corroborating drum-pattern, bass, vocal-phrasing, harmonic-rhythm, arrangement, and production evidence.");
  }

  for (const conflict of [...new Set(conflicts)]) {
    notes.push(`Stage A stability guard: ${conflict}. Conflicting specific claims were confidence-downgraded before final interpretation.`);
  }

  return { ...evidence, instrumentEvidence, dominantElements, tempo, uncertaintyNotes: notes.slice(0, 30) };
}

function evidenceDerivedInstruments(evidence: StageAEvidence) {
  const forbidden = /\b(vocals?|singer|backing vocals?|vocal chops?|risers?|sweeps?|impacts?|transition(?:al)? fx|sound effects?|sfx|reverb|delay|white noise|compression|sidechain)\b/i;
  const values = evidence.instrumentEvidence
    .filter((item) => !forbidden.test(item.instrument) && item.confidence !== "low")
    .map((item) => {
      const details = [item.timbre, item.technique, item.role].filter(Boolean).join("; ");
      return details ? `${item.instrument} — ${details}` : item.instrument;
    });
  return [...new Set(values)].slice(0, 30);
}

function formatSectionTime(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function patchInitialResult(result: SongAnalysisResult, evidence: StageAEvidence): SongAnalysisResult {
  const instruments = evidenceDerivedInstruments(evidence);
  const labels = evidence.songSections.map((section) => section.label.trim()).filter(Boolean).slice(0, 30);
  const structureText = evidence.songSections
    .map((section) => {
      if (section.startSeconds == null || section.endSeconds == null) return section.label;
      return `${section.label} (${formatSectionTime(section.startSeconds)}-${formatSectionTime(section.endSeconds)})`;
    })
    .join(" → ");
  const bpm = evidence.tempo.feltTempo ?? result.generatorReady.bpm.approximate;

  return {
    ...result,
    generatorReady: {
      ...result.generatorReady,
      instruments: instruments.length ? instruments : result.generatorReady.instruments,
      songStructure: labels.length ? labels : result.generatorReady.songStructure,
      bpm: {
        ...result.generatorReady.bpm,
        approximate: bpm == null ? null : Math.round(bpm),
        rangeMin: null,
        rangeMax: null,
        confidence: evidence.tempo.confidence,
        notes: evidence.tempo.notes,
      },
    },
    detailedAnalysis: {
      ...result.detailedAnalysis,
      songStructure: structureText || result.detailedAnalysis.songStructure,
    },
  };
}

async function runVerifier(args: {
  apiKey: string;
  model: z.infer<typeof analyzerModelSchema>;
  audioBase64: string;
  mimeType: z.infer<typeof supportedMimeTypes>;
  evidence: StageAEvidence;
  durationSeconds: number | null;
  sourceStemPreview?: Stage0Evidence["sourceStemPreview"];
}) {
  const layerResolutionRequired = rhythmicLayerResolutionRequired(args.evidence);
  const stemPreviewUsed = Boolean(layerResolutionRequired && args.sourceStemPreview);
  const prompt = [
    `Measured duration: ${args.durationSeconds ?? "unknown"} seconds.`,
    `rhythmicLayerResolutionRequired=${layerResolutionRequired}`,
    `otherStemPreviewAvailable=${stemPreviewUsed}`,
    stemPreviewUsed
      ? `The following additional audio part is a distributed Demucs OTHER-stem preview covering windows ${args.sourceStemPreview!.windows.map((window) => `${window.startSeconds.toFixed(1)}-${window.endSeconds.toFixed(1)}s`).join(", ")}. Use it only for source disambiguation as instructed.`
      : "No isolated other-stem preview is available for this run.",
    "First-pass Stage A claims to independently verify:",
    JSON.stringify({
      tempo: args.evidence.tempo,
      drumPercussionEvidence: args.evidence.drumPercussionEvidence,
      bassEvidence: args.evidence.bassEvidence,
      harmonicFoundation: args.evidence.harmonicFoundation,
      dominantElements: args.evidence.dominantElements,
      instrumentEvidence: args.evidence.instrumentEvidence,
    }),
  ].join("\n");

  const parts: Array<Record<string, unknown>> = [
    { inlineData: { mimeType: args.mimeType, data: args.audioBase64 } },
  ];
  if (stemPreviewUsed && args.sourceStemPreview) {
    parts.push({
      text: "DEMUCS OTHER-STEM PREVIEW: residual non-vocal/non-drum/non-bass mixture sampled across the track. Use only for neutral instrument-source disambiguation.",
    });
    parts.push({
      inlineData: {
        mimeType: args.sourceStemPreview.mimeType,
        data: args.sourceStemPreview.audioBase64,
      },
    });
  }
  parts.push({ text: prompt });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": args.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: VERIFIER_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: VERIFIER_RESPONSE_SCHEMA,
          maxOutputTokens: 3072,
          temperature: 0,
        },
      }),
      signal: AbortSignal.timeout(5 * 60 * 1000),
    },
  );

  const payload = (await response.json()) as any;
  const usage = normalizedUsage(payload);
  if (!response.ok) throw Object.assign(new Error(payload?.error?.message || `Stage A verifier failed (${response.status})`), { usage });
  const candidate = payload?.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    throw Object.assign(new Error(`Stage A verifier stopped before completion: ${candidate.finishReason}`), { usage });
  }
  const text = (candidate?.content?.parts ?? []).map((part: any) => (typeof part?.text === "string" ? part.text : "")).join("").trim();
  if (!text) throw Object.assign(new Error("Stage A verifier returned no JSON"), { usage });
  return { verification: verifierSchema.parse(JSON.parse(text)), usage, stemPreviewUsed };
}

export const guardSongAnalyzerStageA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => guardInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_analyzer");
    const durationSeconds = data.stage0Evidence.processing.durationSeconds;
    let evidence = sanitizeLyricTranscription(data.stageAEvidence as StageAEvidence);
    evidence = sanitizeTimeline(evidence, durationSeconds);
    let verificationUsed = false;

    const apiKey = process.env["GEMINI_API_KEY"];
    if (apiKey) {
      let usage: ReturnType<typeof normalizedUsage> = null;
      try {
        const checked = await runVerifier({
          apiKey,
          model: data.model,
          audioBase64: data.audioBase64,
          mimeType: data.mimeType,
          evidence,
          durationSeconds,
          sourceStemPreview: data.stage0Evidence.sourceStemPreview,
        });
        usage = checked.usage;
        evidence = reconcileVerification(evidence, checked.verification, data.stage0Evidence);
        if (checked.stemPreviewUsed) {
          evidence = {
            ...evidence,
            uncertaintyNotes: [
              ...evidence.uncertaintyNotes,
              "Stage A stem-assisted resolver used a distributed Demucs other-stem preview as secondary source-identity evidence for the ambiguous rhythmic pluck/strum layer; full-mix evidence remained authoritative for all other claims.",
            ].slice(0, 30),
          };
        }
        verificationUsed = true;
        await recordAiUsage({
          userId: context.userId,
          provider: "gemini",
          model: data.model,
          operation: "song_analysis",
          usage,
          success: true,
        });
      } catch (error) {
        usage = (error as any)?.usage ?? usage;
        await recordAiUsage({
          userId: context.userId,
          provider: "gemini",
          model: data.model,
          operation: "song_analysis",
          usage,
          success: false,
        });
        evidence = {
          ...evidence,
          uncertaintyNotes: [
            ...evidence.uncertaintyNotes,
            "Stage A critical-evidence verification was unavailable; deterministic timeline validation still ran, but source-family stability was not independently cross-checked.",
          ].slice(0, 30),
        };
        console.warn("[song-analyzer] Stage A verifier unavailable; continuing with deterministic guard", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      stageAEvidence: evidence,
      initialResult: patchInitialResult(data.initialResult, evidence),
      verificationUsed,
    };
  });
