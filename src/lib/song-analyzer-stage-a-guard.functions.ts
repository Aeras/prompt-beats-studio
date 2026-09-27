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
  feltTempo: z.object({
    bpm: z.number().min(20).max(300).nullable(),
    confidence: confidenceSchema,
    evidence: z.string().trim().min(1).max(1000),
  }),
});

type Verification = z.infer<typeof verifierSchema>;

type Confidence = "high" | "medium" | "low";

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
  required: ["drumSource", "bassSource", "guitarPresence", "synthPresence", "feltTempo"],
} as const;

const VERIFIER_SYSTEM_PROMPT = `You are PromptBeats Stage A Critical Evidence Verifier.
You hear the same source audio as the first Stage A pass. You are NOT a genre classifier.
Independently verify only five high-impact facts that have caused run-to-run instability:
1. acoustic vs programmed/hybrid drum source,
2. electric vs synth/hybrid bass source,
3. audible rhythm/lead guitar presence,
4. material synthesizer presence,
5. felt tempo / half-double-time interpretation.

Do not trust the first Stage A pass merely because it is supplied. Treat it as claims to test against the audio.
Use high confidence only when direct timbre/articulation/rhythmic evidence is unmistakable. If acoustic-vs-electronic, guitar-vs-synth, or bass-source identity is ambiguous, return uncertain or hybrid rather than guessing.
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

function sanitizeTimeline(evidence: StageAEvidence, durationSeconds: number | null) {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return evidence;
  }

  let corrections = 0;
  let removals = 0;
  let previousStart: number | null = null;

  const songSections = evidence.songSections.map((section) => {
    let startSeconds = section.startSeconds;
    let endSeconds = section.endSeconds;
    let confidence = section.confidence;
    const explicit = explicitMmSs(section.evidence);

    if (startSeconds != null && explicit[0] && Math.abs(startSeconds - explicit[0].concatenated) <= 1) {
      startSeconds = explicit[0].seconds;
      corrections += 1;
      confidence = confidence === "high" ? "medium" : confidence;
    }
    if (endSeconds != null && explicit[1] && Math.abs(endSeconds - explicit[1].concatenated) <= 1) {
      endSeconds = explicit[1].seconds;
      corrections += 1;
      confidence = confidence === "high" ? "medium" : confidence;
    }

    if (startSeconds != null && startSeconds > durationSeconds + 0.5) {
      startSeconds = null;
      removals += 1;
      confidence = "low";
    }
    if (endSeconds != null && endSeconds > durationSeconds + 0.5) {
      endSeconds = null;
      removals += 1;
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

  const uncertaintyNotes = [...evidence.uncertaintyNotes];
  if (corrections || removals) {
    uncertaintyNotes.push(
      `Deterministic timeline guard corrected ${corrections} mm:ss-to-seconds confusion(s) and removed ${removals} boundary value(s) outside or inconsistent with the measured ${durationSeconds.toFixed(2)} s duration. Null boundaries must remain uncertain downstream.`,
    );
  }

  return {
    ...evidence,
    songSections,
    uncertaintyNotes: uncertaintyNotes.slice(0, 30),
  };
}

function isHalfDoublePair(a: number, b: number) {
  const ratio = Math.max(a, b) / Math.min(a, b);
  return ratio >= 1.85 && ratio <= 2.15;
}

function reconcileVerification(evidence: StageAEvidence, verification: Verification) {
  const notes = [...evidence.uncertaintyNotes];
  const conflicts: string[] = [];

  const verifierStrongEnough = (confidence: Confidence) => confidenceRank(confidence) >= 1;

  const instrumentEvidence = evidence.instrumentEvidence.map((item) => {
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
      const contradiction =
        value === "none" ||
        (value === "rhythm" && lead) ||
        (value === "lead" && rhythm && !lead);
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

  const dominantElements = evidence.dominantElements.map((item) => {
    const text = `${item.element} ${item.role} ${item.technique ?? ""}`.toLowerCase();
    let confidence = item.confidence;
    if (
      verification.guitarPresence.confidence === "high" &&
      verification.guitarPresence.value === "none" &&
      /guitar/.test(text)
    ) confidence = "low";
    if (
      verification.synthPresence.confidence === "high" &&
      verification.synthPresence.value === "none" &&
      /synth/.test(text)
    ) confidence = "low";
    return confidence === item.confidence ? item : { ...item, confidence };
  });

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

  for (const conflict of [...new Set(conflicts)]) {
    notes.push(`Stage A stability guard: ${conflict}. Conflicting specific claims were confidence-downgraded before final interpretation.`);
  }

  return {
    ...evidence,
    instrumentEvidence,
    dominantElements,
    tempo,
    uncertaintyNotes: notes.slice(0, 30),
  };
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
}) {
  const prompt = [
    `Measured duration: ${args.durationSeconds ?? "unknown"} seconds.`,
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

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": args.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: VERIFIER_SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: args.mimeType, data: args.audioBase64 } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: VERIFIER_RESPONSE_SCHEMA,
          maxOutputTokens: 2048,
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
  const text = (candidate?.content?.parts ?? [])
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
  if (!text) throw Object.assign(new Error("Stage A verifier returned no JSON"), { usage });
  return { verification: verifierSchema.parse(JSON.parse(text)), usage };
}

export const guardSongAnalyzerStageA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => guardInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_analyzer");
    const durationSeconds = data.stage0Evidence.processing.durationSeconds;
    let evidence = sanitizeTimeline(data.stageAEvidence as StageAEvidence, durationSeconds);
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
        });
        usage = checked.usage;
        evidence = reconcileVerification(evidence, checked.verification);
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
