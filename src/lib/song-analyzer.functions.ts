import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import {
  auxiliaryRequestKeySchema,
  executeDurableAuxiliaryAiRequest,
} from "@/lib/ai-auxiliary-idempotency.server";
import { recordAiUsage } from "@/lib/ai-usage.server";
import { stage0DspEvidenceSchema, type Stage0DspEvidence } from "@/lib/song-analyzer-dsp.shared";
import { analyzerV2Compatibility, analyzerV2ProvenanceSchema } from "@/lib/song-analyzer-v2.shared";

export const SONG_ANALYZER_MODELS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { id: "gemini-4-argon", label: "Gemini 4 Argon" },
  { id: "gpt-audio-1.5", label: "GPT Audio 1.5" },
] as const;

export type SongAnalyzerModelId = string;

const supportedMimeTypes = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
] as const;

type SongAnalyzerProvider = "gemini" | "openai" | "openrouter";

type SongAnalyzerModelConfig = {
  id: string;
  label: string;
  provider: SongAnalyzerProvider;
  acceptedMimeTypes: readonly string[];
};

const BUILTIN_SONG_ANALYZER_MODEL_CONFIGS: readonly SongAnalyzerModelConfig[] = [
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    provider: "gemini",
    acceptedMimeTypes: supportedMimeTypes,
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    provider: "gemini",
    acceptedMimeTypes: supportedMimeTypes,
  },
  {
    id: "gemini-4-argon",
    label: "Gemini 4 Argon",
    provider: "gemini",
    acceptedMimeTypes: supportedMimeTypes,
  },
  {
    id: "gpt-audio-1.5",
    label: "GPT Audio 1.5",
    provider: "openai",
    acceptedMimeTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"],
  },
];

export const DEFAULT_SONG_ANALYZER_MODEL = "gemini-3.8-flash";
const V1_OPENROUTER_SYNTHESIS_MODEL = "google/gemini-4-argon";
export const SONG_ANALYZER_MAX_FILE_BYTES = 15 * 1024 * 1024;

const confidenceSchema = z.enum(["high", "medium", "low"]);

const bpmSchema = z
  .object({
    approximate: z.number().min(20).max(300).nullable(),
    rangeMin: z.number().min(20).max(300).nullable(),
    rangeMax: z.number().min(20).max(300).nullable(),
    confidence: confidenceSchema,
    notes: z.string().trim().max(1000),
  })
  .superRefine((value, ctx) => {
    if (value.rangeMin != null && value.rangeMax != null && value.rangeMin > value.rangeMax) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid BPM range" });
    }
  });

const uncertainObservationSchema = z.object({
  observation: z.string().trim().min(1).max(2000),
  confidence: confidenceSchema,
});

export const songAnalysisResultSchema = z.object({
  generatorReady: z.object({
    musicStyle: z.string().trim().min(1).max(4000),
    mood: z.string().trim().min(1).max(2000),
    instruments: z.array(z.string().trim().min(1).max(1000)).max(30),
    bpm: bpmSchema,
    songStructure: z.array(z.string().trim().min(1).max(120)).min(1).max(30),
    productionStyle: z.string().trim().min(1).max(4000),
    additionalInstructions: z.string().trim().max(4000),
  }),
  detailedAnalysis: z.object({
    genreAndStyle: z.string().trim().min(1).max(5000),
    moodAndEmotionalArc: z.string().trim().min(1).max(5000),
    tempoAndGroove: z.string().trim().min(1).max(5000),
    instrumentation: z.array(uncertainObservationSchema).max(40),
    arrangement: z.string().trim().min(1).max(6000),
    songStructure: z.string().trim().min(1).max(5000),
    vocals: z.string().trim().min(1).max(5000),
    productionAndMix: z.array(uncertainObservationSchema).max(40),
    dynamicsAndEnergy: z.string().trim().min(1).max(5000),
    notableCharacteristics: z.array(z.string().trim().min(1).max(2000)).max(30),
    confidenceAndUncertaintyNotes: z.array(z.string().trim().min(1).max(2000)).max(30),
  }),
});

export type SongAnalysisResult = z.infer<typeof songAnalysisResultSchema>;

const evidenceClaimSchema = z.object({
  claim: z.string().trim().min(1).max(1200),
  evidence: z.string().trim().min(1).max(2000),
  confidence: confidenceSchema,
});

const dominantElementSchema = z.object({
  category: z.enum(["instrument", "groove", "texture", "melodic_figure", "other"]),
  element: z.string().trim().min(1).max(500),
  role: z.string().trim().min(1).max(1000),
  technique: z.string().trim().max(500).nullable(),
  prominence: z.enum(["dominant", "major", "supporting"]),
  confidence: confidenceSchema,
  evidence: z.string().trim().min(1).max(2000),
});

const instrumentEvidenceSchema = z.object({
  instrument: z.string().trim().min(1).max(500),
  role: z.string().trim().min(1).max(1000),
  technique: z.string().trim().max(500).nullable(),
  timbre: z.string().trim().max(500).nullable(),
  prominence: z.enum(["dominant", "major", "supporting"]),
  confidence: confidenceSchema,
  evidence: z.string().trim().min(1).max(2000),
});

const tolerantSectionTimeSchema = z
  .preprocess(
    (value) => (value === undefined || value === "" ? null : value),
    z.number().min(0).max(21600).nullable(),
  )
  .catch(null);

const songSectionEvidenceSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    startSeconds: tolerantSectionTimeSchema,
    endSeconds: tolerantSectionTimeSchema,
    evidence: z.string().trim().min(1).max(1500),
    confidence: confidenceSchema,
  })
  .transform((value) => {
    if (
      value.startSeconds != null &&
      value.endSeconds != null &&
      value.endSeconds < value.startSeconds
    ) {
      return { ...value, startSeconds: null, endSeconds: null };
    }
    return value;
  });

const stageAEvidenceSchema = z.object({
  dominantRhythmicPulse: z.object({
    observation: z.string().trim().min(1).max(1500),
    evidence: z.string().trim().min(1).max(2000),
    confidence: confidenceSchema,
  }),
  tempo: z.object({
    gridCandidates: z.array(z.number().min(20).max(300)).min(1).max(6),
    feltTempo: z.number().min(20).max(300).nullable(),
    possibleHalfTime: z.number().min(20).max(300).nullable(),
    possibleDoubleTime: z.number().min(20).max(300).nullable(),
    confidence: confidenceSchema,
    kickEvidence: z.string().trim().max(1500),
    backbeatEvidence: z.string().trim().max(1500),
    bassPhrasing: z.string().trim().max(1500),
    vocalPhrasing: z.string().trim().max(1500),
    harmonicRhythm: z.string().trim().max(1500),
    notes: z.string().trim().max(2500),
  }),
  drumPercussionEvidence: z.array(evidenceClaimSchema).max(30),
  bassEvidence: z.array(evidenceClaimSchema).max(20),
  harmonicFoundation: z.array(evidenceClaimSchema).max(20),
  dominantElements: z.array(dominantElementSchema).min(3).max(5),
  instrumentEvidence: z.array(instrumentEvidenceSchema).max(30),
  melodicElements: z.array(evidenceClaimSchema).max(20),
  vocalCharacteristics: z.array(evidenceClaimSchema).max(20),
  arrangementChanges: z.array(evidenceClaimSchema).max(30),
  songSections: z.array(songSectionEvidenceSchema).min(1).max(30),
  energyProgression: z.array(evidenceClaimSchema).max(20),
  productionMixEvidence: z.array(evidenceClaimSchema).max(30),
  uncertaintyNotes: z.array(z.string().trim().min(1).max(2000)).max(30),
});

export type StageAEvidence = z.infer<typeof stageAEvidenceSchema>;

const EVIDENCE_EXTRACTION_SYSTEM_PROMPT = `
You are PromptBeats Stage A: RAW AUDIO EVIDENCE EXTRACTOR.

Your only job is to listen to the supplied audio and return structured AUDIBLE EVIDENCE.
You are NOT allowed to classify genre, subgenre, scene, era, or style family.

FORBIDDEN IN STAGE A
Do not output labels such as Dance-Pop, Pop-Rock, Slap House, Nu-Disco, Pop-Punk, R&B, EDM, Indie Pop, Club-Pop, or any other genre/style classification.
Do not complete the description from genre expectations.
Do not identify the song or artist from filename, metadata, lyrics, melody, or memory.
Do not transcribe lyrics.

EVIDENCE-FIRST RULE
Every important musical claim must be tied to something actually audible.
If uncertain, lower confidence and describe the uncertainty.

LANGUAGE / VOCAL DELIVERY ISOLATION
Lyrics language, accent, nationality, and singer identity are not musical-style evidence.
You may note the audible language only as a vocal characteristic when it is clear, but never use language as evidence for a regional, national, ethnic, or genre label.
Independently describe vocal delivery and rhythmic phrasing: sung, speech-like, rap-like, sing-rap-like, conversational, melismatic, sustained, clipped, syncopated, behind/on/ahead of the beat, or other directly audible behavior.
Do not let the language of the words replace the musical evidence in the vocal delivery.

QUANTITATIVE DSP REFERENCE
A deterministic Stage 0 DSP object is supplied with the audio.
Treat Stage 0 as supporting signal-derived evidence, NOT as ground truth and never as a genre cue.
Cross-check its tempo candidate, half/double-time candidates, stability, onset activity, energy curve, tonal estimate, and spectral metrics against what you actually hear.
If auditory evidence strongly disagrees with DSP:
- do not blindly follow DSP;
- explicitly note the disagreement;
- lower confidence where appropriate;
- consider half-time/double-time ambiguity;
- prefer interpretations supported by multiple independent musical signals.
DSP disagreement is useful evidence; it is not automatically an LLM error.
Weak key/chroma evidence must not influence genre.
An energy rise must not automatically be labeled as a chorus, build, or drop.

DSP DISAGREEMENT THRESHOLD
Do not reject a stable Stage 0 tempo candidate based only on a general subjective impression that the track "feels" faster or slower.

To materially disagree with a stable DSP tempo candidate, require at least TWO independent audible rhythmic indicators, for example:
- kick placement;
- snare/backbeat placement;
- bass phrase cycle;
- vocal phrase length;
- harmonic rhythm.

If these signals instead suggest a half-time or double-time interpretation, preserve both interpretations and lower confidence rather than declaring the DSP estimate incorrect.

You must observe:
1. dominant rhythmic pulse
2. tempo candidates
3. perceived/felt tempo
4. drum/percussion evidence
5. bass evidence
6. harmonic foundation
7. dominant instruments
8. instrument playing techniques
9. melodic elements
10. vocal characteristics and delivery independent of lyrics language
11. arrangement changes
12. song sections with approximate time coverage
13. energy progression
14. production/mix evidence
15. uncertainty notes

DOMINANT ELEMENTS
Return exactly 3–5 most defining audible musical elements.
These are the elements that most strongly define rhythmic, harmonic, arrangement, emotional, or sonic identity.
For each, state element, role, technique if clearly audible, prominence, confidence, and short evidence.
A clearly dominant guitar strumming pattern, piano ostinato, bass riff, drum groove, synth figure, string motif, or percussion pattern must not disappear.

TEMPO EVIDENCE
Do not return only one BPM.
Return grid candidates, felt/perceived tempo, possible half-time, possible double-time, confidence, and evidence from kick, backbeat, bass phrasing, vocal phrasing, and harmonic rhythm.
HIGH confidence is allowed only when these signals converge.

CLAIM-GROUNDING RULES
- "four-on-the-floor" only if a kick is clearly and consistently audible on all four quarter-note beats over sustained sections.
- "sidechain pumping" only if repeated audible ducking is clearly heard.
- "synth bass" only if bass timbre is clearly synthetic.
- "acoustic/electric guitar strumming" only if audible.
- "power chords" only if audible.
- "guitar solo" only if audible.
- Do not infer any of these from genre expectation.

INSTRUMENTS / VOCALS / FX
Keep musical instruments separate from vocals and production effects.
Instrument evidence must describe instrument, role, audible technique where clear, timbre where clear, prominence, confidence, and evidence.
Do not invent playing technique or instrument type.

SECTION-BY-SECTION INSTRUMENT SCAN

Before finalizing instrumentEvidence, inspect each major song section separately.

For every section, ask:
- Does a new instrument enter here that was not present earlier?
- Does a previously supporting instrument become dominant here?
- Is there a solo, lead, riff, or harmonic layer that appears only in this section?
- Does the outro introduce or expose an instrument more clearly than earlier sections?

Do not omit an instrument merely because it appears only in one important section.
If a clearly audible instrument appears in a bridge, solo, breakdown, final chorus, or outro, include it in instrumentEvidence and describe where it occurs.

GUITAR VS SYNTH DISAMBIGUATION CHECK

When a bright plucked, sustained, distorted, or lead-like timbre could plausibly be either electric guitar or synthesizer, do not automatically classify it as synth.

Check for audible guitar indicators such as:
- pick attack
- palm muting
- fret/string articulation
- bends
- vibrato
- sustained overdriven notes
- riff phrasing
- chord voicing characteristic of guitar
- amplifier/distortion texture

Check for synth indicators such as:
- perfectly uniform envelope
- quantized/retriggered note shape
- oscillator-like timbre
- arpeggiator regularity
- filter-envelope behavior
- modulation that is clearly synthetic

If the evidence remains ambiguous, lower confidence and state the uncertainty rather than forcing a synth or guitar label.

INSTRUMENT IDENTITY — CULTURAL / CONTEXT BIAS GUARD

Do not infer a specific regional instrument identity such as bouzouki, tzouras, mandolin, oud, lute, or similar instruments merely because:
- the vocal language is Greek or another regional language;
- the melody has modal or ornamented phrasing;
- the track has Mediterranean, Balkan, Middle Eastern, or folk-associated characteristics;
- the timbre is bright, metallic, or plucked.

A specific instrument identity requires direct audible evidence from timbre, articulation, resonance, attack, sustain, string behavior, and playing technique.

If the audio supports only a broader category, use a broader label such as:
- plucked string instrument
- electric guitar-like plucked instrument
- acoustic string-like pluck
- synth/plucked-string ambiguity

Do not assign high confidence to a specific regional instrument unless the timbral evidence is genuinely distinctive.

SECTION-SPECIFIC INSTRUMENT RE-EVALUATION

Do not assume that a melodic or plucked element heard in one section is necessarily the same instrument in later sections.

For each solo, bridge, final chorus, and outro, independently reassess the lead instrument.

Specifically check for:
- electric-guitar pick attack
- palm muting
- fret/string articulation
- bends
- vibrato
- sustained overdriven notes
- amplifier/distortion character
- feedback-like sustain
- lead-guitar phrasing
- harmonized guitar lines

If a later section has a materially different timbre or playing technique from the intro or verse, record it as a separate instrumentEvidence item when justified.

LEAD GUITAR SOLO CHECK

Whenever a section contains a prominent sustained, expressive, distorted, or overdriven melodic lead, explicitly test the hypothesis that it is electric guitar before classifying it as:
- synthesizer lead
- acoustic plucked string
- bouzouki/mandolin-like instrument
- generic melodic lead

If guitar-specific indicators such as bends, vibrato, sustained distortion, pick attack, string articulation, or amplifier character are audible, prefer electric guitar or state a guitar/synth ambiguity with reduced confidence.

Do not force a culturally specific acoustic-string interpretation when later-section evidence is more consistent with processed electric guitar.

CONFIDENCE RULE

When multiple plausible instrument identities remain, lower confidence.

Do not output:
- bouzouki
- mandolin
- tzouras
- electric guitar
- synth lead

with high confidence unless the evidence clearly distinguishes it from the competing hypotheses.

Use explicit uncertainty when needed.

TEMPORAL GROUNDING
For claims about arrangement, instrument entrances, section changes, energy shifts, solos, or changing production texture, ground the observation in an approximate part of the track whenever possible.
Use approximate startSeconds/endSeconds for each songSections item when you can place the boundary with reasonable confidence.
If a boundary cannot be placed reliably, use null for that boundary rather than inventing precision.

FULL-TIMELINE SECTION COVERAGE
songSections must represent the entire audible recording in chronological order, from the opening through the ending.
Do not silently omit a substantial interval between named sections.
Repeated verses, choruses, bridges, breakdowns, solos, interludes, transitions, and outros must be represented as separate occurrences when they are audibly distinct.
If a substantial interval cannot be confidently named, include a broad label such as "Transition / Uncertain section" with reduced confidence instead of leaving a gap.
Use Stage 0 duration, when available, as a cross-check that the section evidence reaches the end of the track.
Do not invent a verse, chorus, bridge, solo, or outro merely to fill time; preserve uncertainty explicitly.

FULL-TRACK EVIDENCE COVERAGE CHECK
Before returning the Stage A JSON, perform one final full-track pass mentally across the evidence you observed.

Verify that you have not omitted:
- a clearly recurring instrument;
- a dominant harmonic or rhythmic layer;
- an instrument that becomes prominent only in later sections;
- a contrasting acoustic vs electronic layer;
- an important playing technique;
- a major change in instrumentation between sections;
- a substantial timeline interval between section entries.

Pay special attention to instruments that appear only in solo, bridge, breakdown, final chorus, or outro sections.

Do not limit instrumentEvidence to the 3–5 dominantElements.
dominantElements are only the most defining elements; instrumentEvidence should preserve all clearly audible musically relevant instruments with appropriate prominence and confidence.

If an instrument is clearly audible in only one important section, include it and describe where it appears rather than omitting it.

PRODUCTION
Only report production/mix features that are directly audible.
Do not infer club-ready mix, EDM drop, sidechain, filter sweep, riser, synth hook, or similar terms from polish or modernity alone.

Return only the structured JSON requested by the schema.
`.trim();

const OPENAI_STAGE_A_JSON_CONTRACT = `
OUTPUT CONTRACT — REQUIRED EXACT JSON SHAPE

Return exactly one JSON object with these top-level keys and no prose:
{
  "dominantRhythmicPulse": {
    "observation": string,
    "evidence": string,
    "confidence": "high" | "medium" | "low"
  },
  "tempo": {
    "gridCandidates": number[],
    "feltTempo": number | null,
    "possibleHalfTime": number | null,
    "possibleDoubleTime": number | null,
    "confidence": "high" | "medium" | "low",
    "kickEvidence": string,
    "backbeatEvidence": string,
    "bassPhrasing": string,
    "vocalPhrasing": string,
    "harmonicRhythm": string,
    "notes": string
  },
  "drumPercussionEvidence": [
    { "claim": string, "evidence": string, "confidence": "high" | "medium" | "low" }
  ],
  "bassEvidence": [
    { "claim": string, "evidence": string, "confidence": "high" | "medium" | "low" }
  ],
  "harmonicFoundation": [
    { "claim": string, "evidence": string, "confidence": "high" | "medium" | "low" }
  ],
  "dominantElements": [
    {
      "category": "instrument" | "groove" | "texture" | "melodic_figure" | "other",
      "element": string,
      "role": string,
      "technique": string | null,
      "prominence": "dominant" | "major" | "supporting",
      "confidence": "high" | "medium" | "low",
      "evidence": string
    }
  ],
  "instrumentEvidence": [
    {
      "instrument": string,
      "role": string,
      "technique": string | null,
      "timbre": string | null,
      "prominence": "dominant" | "major" | "supporting",
      "confidence": "high" | "medium" | "low",
      "evidence": string
    }
  ],
  "melodicElements": [
    { "claim": string, "evidence": string, "confidence": "high" | "medium" | "low" }
  ],
  "vocalCharacteristics": [
    { "claim": string, "evidence": string, "confidence": "high" | "medium" | "low" }
  ],
  "arrangementChanges": [
    { "claim": string, "evidence": string, "confidence": "high" | "medium" | "low" }
  ],
  "songSections": [
    {
      "label": string,
      "startSeconds": number | null,
      "endSeconds": number | null,
      "evidence": string,
      "confidence": "high" | "medium" | "low"
    }
  ],
  "energyProgression": [
    { "claim": string, "evidence": string, "confidence": "high" | "medium" | "low" }
  ],
  "productionMixEvidence": [
    { "claim": string, "evidence": string, "confidence": "high" | "medium" | "low" }
  ],
  "uncertaintyNotes": string[]
}

CONTRACT RULES
- Every top-level key above is required, even when the value is an empty array.
- dominantElements must contain 3 to 5 items.
- gridCandidates must contain at least one BPM number between 20 and 300.
- startSeconds/endSeconds must be JSON numbers in seconds or null, never "mm:ss" strings.
- Use only the exact enum strings shown above.
- Use JSON null, never "unknown", "N/A", or omitted fields, for nullable values.
- Do not wrap the JSON in markdown fences.
- Do not add explanatory text before or after the JSON.
`.trim();

const ANALYZER_SYSTEM_PROMPT = `
You are PromptBeats Stage B: MUSICAL INTERPRETATION / GENERATOR-READY SYNTHESIS.

You do NOT receive the source audio.
You receive only structured Stage A audio evidence.

STRICT AUTHORITY RULE
Stage A evidence is the complete musical evidence boundary.
You MUST NOT introduce any specific musical claim that is absent from Stage A.

You may interpret and summarize evidence, but you may NOT invent:
- a new instrument
- a new playing technique
- a new drum pattern
- a new production effect
- a new groove claim
- a new tempo interpretation
- a new arrangement event

If Stage A does not mention sidechain, Stage B cannot mention sidechain.
If Stage A does not mention synth bass, Stage B cannot mention synth bass.
If Stage A marks acoustic guitar strumming as dominant, Stage B must preserve it prominently.

GENRE / STYLE
Classify only after considering the total Stage A evidence:
- groove
- felt tempo
- drum/percussion evidence
- bass evidence
- harmonic foundation
- dominant instruments
- playing techniques
- vocals
- arrangement
- production evidence

If evidence does not support a narrow genre, use a broader accurate label.
Broad accuracy is better than narrow speculation.
A polished or electronic element does not automatically justify Dance-Pop, EDM, Club-Pop, Slap House, Nu-Disco, or another club-oriented label.

LANGUAGE / CULTURAL STYLE ISOLATION
Lyrics language, accent, country, nationality, and artist identity are not genre/style evidence by themselves.
Do not put a nationality or regional adjective such as Greek, Spanish, Arabic, Turkish, Balkan, Nordic, Latin, or similar wording into Music Style or genreAndStyle merely because the vocals use that language or accent.
A regional/cultural style label requires at least TWO independent non-language musical indicators in Stage A, for example distinctive instrumentation/technique plus rhythmic, harmonic/modal, arrangement, or production evidence.
If Stage A reports only the vocal language, keep that fact in the vocal description and nowhere in the musical style label.
Example: Greek-language vocals do not equal Greek Pop.

STYLE CONTRADICTION CHECK
Before selecting Music Style, identify whether any dominant Stage A evidence materially contradicts the proposed label.

A narrow style label is allowed only if it explains the dominant rhythmic feel, instrumentation, arrangement, and production together.

If the proposed label explains only one prominent element, broaden it or use a hybrid description.

HYBRID STYLE PRESERVATION
Instrument prominence and genre identity are different signals.
Do not let the loudest, most exposed, or most prominent instrument replace an independently supported rhythmic or vocal style family.
A track can be acoustic- or live-instrument-led while still having a materially defining hip-hop, R&B, electronic, rock, folk, or other rhythmic/vocal foundation.

Before collapsing a track into one family, independently account for:
- drum/percussion language and pocket;
- bass language;
- vocal delivery and phrasing;
- rhythmic subdivision, swing, and syncopation;
- harmonic/instrumental surface;
- arrangement and production texture.

If two or more style families are independently and materially supported by Stage A evidence, Music Style MUST preserve them with a hybrid/crossover description rather than dropping one because another instrument is more prominent.
Do not infer a family from a single weak cue: hybrid wording still requires converging Stage A evidence.

Examples of the required reasoning pattern only — never force these labels when evidence does not support them:
- acoustic-led instrumentation + hip-hop rhythmic/vocal evidence -> preserve both families in a hybrid/crossover description;
- pop melodic structure + trap-derived pocket -> preserve both when both are materially supported;
- live/acoustic surface + electronic production foundation -> preserve both when both materially define the recording.

Do not use "ballad" merely because the tempo is slow or midtempo, the mood is emotive, or acoustic guitar is prominent.
A ballad classification requires compatible arrangement, vocal, harmonic, and groove evidence, and it must not erase a conflicting or coexisting rhythmic/vocal family.

RHYTHMIC / VOCAL FAMILY PRESERVATION
Stage A intentionally avoids genre names, so infer style families from converging raw evidence rather than waiting for Stage A to name a genre.
When Stage A contains speech-like or sing-rap-like vocal phrasing together with a materially syncopated backbeat, programmed/trap-like subdivision behavior, hip-hop-like pocket, or compatible bass phrasing, explicitly evaluate whether a hip-hop-derived family is materially present.
Likewise evaluate other families from multiple converging rhythmic, vocal, instrumental, harmonic, and production cues.
Do not discard a supported rhythmic/vocal family solely because the harmonic surface is acoustic, melodic, soft, emotive, or pop-accessible.
Do not force a family from one cue; require convergence from at least TWO independent evidence categories.

GENRE FAMILY ACCOUNTING GATE
Before finalizing Music Style:
1. Identify the primary rhythmic/groove family supported by Stage A.
2. Identify the primary vocal-delivery family supported by Stage A.
3. Identify the primary instrumental/production family supported by Stage A.
4. If these point to more than one materially defining family, use a hybrid/crossover description.
5. Do not allow one dominant instrument to overwrite an independently supported rhythmic or vocal style family.
6. Do not use lyrics language or nationality as one of the evidence categories.

GENERATOR-READY INSTRUMENTS
Generator-ready Instruments must be derived directly from Stage A instrument evidence.
Do not include vocals, FX, risers, sweeps, reverb, delay, sidechain, white noise, compression, or transition effects.
Preserve dominant instruments and defining playing techniques.

EVIDENCE COMPLETENESS / MUSICAL IDENTITY PRESERVATION
Do not over-compress a layered arrangement into generic instrument labels or a narrow style label.

When Stage A provides evidence of a broader or more specific musical identity:
- preserve acoustic-led or live-instrument-led identity when dominant;
- preserve clearly reported electronic layers such as pads, programmed drums, or synth bass when Stage A explicitly identifies them;
- do not let a dominant acoustic/live instrument collapse an independently supported rhythmic or vocal identity into generic pop or ballad wording;
- do not let one prominent electric guitar part dominate the classification if the total evidence points to a broader hybrid arrangement;
- do not reduce a multi-layered arrangement to generic labels such as "Electric Guitar / Drum Kit / Bass" when Stage A contains more specific supported instrumentation or techniques;
- retain important harmonic, textural, and rhythmic layers that materially define the recording;
- reflect the complete supported section sequence when Stage A provides clear arrangement changes or section evidence;
- summarize Mood / Vibe from the full Stage A emotional evidence rather than only the highest-energy passages;
- preserve reflective, emotive, melodic, atmospheric, restrained, or intimate qualities when Stage A supports them, even if the track also becomes energetic or driving.

Before finalizing Music Style, ask:
Does this label explain the total Stage A evidence, including the dominant instruments, acoustic/electronic balance, groove, arrangement, production texture, and vocal character?
If a narrower label overweights one element or ignores important supported layers, broaden or revise the label.

Before finalizing Instruments and Production Style, verify that no high-prominence or defining Stage A element has been omitted merely because a more generic description would be simpler.

EVIDENCE ACCOUNTING GATE
Before producing Generator-ready fields:

1. Read every Stage A dominantElement with prominence "dominant" or "major".
2. Read every Stage A instrumentEvidence item with prominence "dominant" or "major".
3. Determine whether each materially defining item is represented in at least one of:
   - Music Style
   - Instruments
   - Production Style
   - Additional Instructions

A defining Stage A element may be summarized, but it must not disappear.

Supporting elements may be omitted when they do not materially affect the generator-ready identity.

If removing an element would cause a music generator to recreate a substantially different arrangement, that element is materially defining and must be preserved.

STRUCTURE / TIMELINE COVERAGE
Generator-ready Song Structure must preserve every Stage A songSections occurrence in chronological order.
Do not skip a repeated verse/chorus, bridge, interlude, breakdown, solo, transition, or outro that Stage A explicitly reports.
Do not invent section names or timestamps that are absent from Stage A.
When Stage A uses an uncertain/transition label to cover an ambiguous interval, preserve the uncertainty rather than silently deleting that interval.
Detailed songStructure must not present a sequence with a substantial unexplained time gap between adjacent Stage A sections.

ARRANGEMENT CLAIM GROUNDING
Additional Instructions is descriptive reconstruction, not a place to redesign or improve the song.
Every instrument entrance, harmony, shaker/percussion layer, solo, bridge behavior, filter/effect, dynamic event, and outro instruction must be traceable to Stage A evidence.
Do not turn a low-confidence or ambiguous Stage A observation into a definite generator instruction.
Do not add stereotypical arrangement events merely because they would fit the proposed genre.

BPM
Choose ONE generator-ready BPM value.
Prefer Stage A felt/perceived tempo when it is musically representative.
If grid and felt tempo differ, keep the ambiguity in notes.
BPM confidence cannot exceed Stage A tempo confidence.
If meaningful half/double-time ambiguity exists, confidence cannot be HIGH.

PRODUCTION CLAIMS
Production Style may use only production/mix claims present in Stage A evidence.
Do not add stereotypical club/EDM language.

FINAL CONSISTENCY GATE
Before returning:
1. Compare every Generator-ready field against Stage A evidence.
2. Remove any unsupported claim.
3. Restore any missing dominant element.
4. Broaden Music Style if it requires evidence not present in Stage A.
5. Lower BPM confidence if it exceeds Stage A evidence.
6. Ensure the result belongs to the same broad musical family implied by the evidence.
7. Verify that dominant instrumentation has not erased an independently supported rhythmic or vocal style family; use hybrid/crossover wording when multiple families materially define the track.
8. Remove nationality/regional style wording that is supported only by lyrics language or accent.
9. Verify that Song Structure accounts for the complete Stage A section sequence without dropping substantial intervals.
10. Remove any Additional Instructions claim that cannot be traced directly to Stage A evidence.

Do not reproduce lyrics, melodies, hooks, or protected expression.
Return only the existing canonical Analyzer JSON schema.
`.trim();

export const ANALYZER_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    generatorReady: {
      type: "OBJECT",
      properties: {
        musicStyle: { type: "STRING" },
        mood: { type: "STRING" },
        instruments: { type: "ARRAY", items: { type: "STRING" } },
        bpm: {
          type: "OBJECT",
          properties: {
            approximate: { type: "NUMBER", nullable: true },
            rangeMin: { type: "NUMBER", nullable: true },
            rangeMax: { type: "NUMBER", nullable: true },
            confidence: { type: "STRING", enum: ["high", "medium", "low"] },
            notes: { type: "STRING" },
          },
          required: ["approximate", "rangeMin", "rangeMax", "confidence", "notes"],
        },
        songStructure: { type: "ARRAY", items: { type: "STRING" } },
        productionStyle: { type: "STRING" },
        additionalInstructions: { type: "STRING" },
      },
      required: [
        "musicStyle",
        "mood",
        "instruments",
        "bpm",
        "songStructure",
        "productionStyle",
        "additionalInstructions",
      ],
    },
    detailedAnalysis: {
      type: "OBJECT",
      properties: {
        genreAndStyle: { type: "STRING" },
        moodAndEmotionalArc: { type: "STRING" },
        tempoAndGroove: { type: "STRING" },
        instrumentation: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              observation: { type: "STRING" },
              confidence: { type: "STRING", enum: ["high", "medium", "low"] },
            },
            required: ["observation", "confidence"],
          },
        },
        arrangement: { type: "STRING" },
        songStructure: { type: "STRING" },
        vocals: { type: "STRING" },
        productionAndMix: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              observation: { type: "STRING" },
              confidence: { type: "STRING", enum: ["high", "medium", "low"] },
            },
            required: ["observation", "confidence"],
          },
        },
        dynamicsAndEnergy: { type: "STRING" },
        notableCharacteristics: { type: "ARRAY", items: { type: "STRING" } },
        confidenceAndUncertaintyNotes: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: [
        "genreAndStyle",
        "moodAndEmotionalArc",
        "tempoAndGroove",
        "instrumentation",
        "arrangement",
        "songStructure",
        "vocals",
        "productionAndMix",
        "dynamicsAndEnergy",
        "notableCharacteristics",
        "confidenceAndUncertaintyNotes",
      ],
    },
  },
  required: ["generatorReady", "detailedAnalysis"],
};

const EVIDENCE_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    dominantRhythmicPulse: {
      type: "OBJECT",
      properties: {
        observation: { type: "STRING" },
        evidence: { type: "STRING" },
        confidence: { type: "STRING", enum: ["high", "medium", "low"] },
      },
      required: ["observation", "evidence", "confidence"],
    },
    tempo: {
      type: "OBJECT",
      properties: {
        gridCandidates: { type: "ARRAY", items: { type: "NUMBER" } },
        feltTempo: { type: "NUMBER", nullable: true },
        possibleHalfTime: { type: "NUMBER", nullable: true },
        possibleDoubleTime: { type: "NUMBER", nullable: true },
        confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        kickEvidence: { type: "STRING" },
        backbeatEvidence: { type: "STRING" },
        bassPhrasing: { type: "STRING" },
        vocalPhrasing: { type: "STRING" },
        harmonicRhythm: { type: "STRING" },
        notes: { type: "STRING" },
      },
      required: [
        "gridCandidates",
        "feltTempo",
        "possibleHalfTime",
        "possibleDoubleTime",
        "confidence",
        "kickEvidence",
        "backbeatEvidence",
        "bassPhrasing",
        "vocalPhrasing",
        "harmonicRhythm",
        "notes",
      ],
    },
    drumPercussionEvidence: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          claim: { type: "STRING" },
          evidence: { type: "STRING" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["claim", "evidence", "confidence"],
      },
    },
    bassEvidence: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          claim: { type: "STRING" },
          evidence: { type: "STRING" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["claim", "evidence", "confidence"],
      },
    },
    harmonicFoundation: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          claim: { type: "STRING" },
          evidence: { type: "STRING" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["claim", "evidence", "confidence"],
      },
    },
    dominantElements: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          category: {
            type: "STRING",
            enum: ["instrument", "groove", "texture", "melodic_figure", "other"],
          },
          element: { type: "STRING" },
          role: { type: "STRING" },
          technique: { type: "STRING", nullable: true },
          prominence: { type: "STRING", enum: ["dominant", "major", "supporting"] },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
          evidence: { type: "STRING" },
        },
        required: [
          "category",
          "element",
          "role",
          "technique",
          "prominence",
          "confidence",
          "evidence",
        ],
      },
    },
    instrumentEvidence: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          instrument: { type: "STRING" },
          role: { type: "STRING" },
          technique: { type: "STRING", nullable: true },
          timbre: { type: "STRING", nullable: true },
          prominence: { type: "STRING", enum: ["dominant", "major", "supporting"] },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
          evidence: { type: "STRING" },
        },
        required: [
          "instrument",
          "role",
          "technique",
          "timbre",
          "prominence",
          "confidence",
          "evidence",
        ],
      },
    },
    melodicElements: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          claim: { type: "STRING" },
          evidence: { type: "STRING" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["claim", "evidence", "confidence"],
      },
    },
    vocalCharacteristics: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          claim: { type: "STRING" },
          evidence: { type: "STRING" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["claim", "evidence", "confidence"],
      },
    },
    arrangementChanges: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          claim: { type: "STRING" },
          evidence: { type: "STRING" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["claim", "evidence", "confidence"],
      },
    },
    songSections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          startSeconds: { type: "NUMBER", nullable: true },
          endSeconds: { type: "NUMBER", nullable: true },
          evidence: { type: "STRING" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["label", "startSeconds", "endSeconds", "evidence", "confidence"],
      },
    },
    energyProgression: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          claim: { type: "STRING" },
          evidence: { type: "STRING" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["claim", "evidence", "confidence"],
      },
    },
    productionMixEvidence: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          claim: { type: "STRING" },
          evidence: { type: "STRING" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["claim", "evidence", "confidence"],
      },
    },
    uncertaintyNotes: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: [
    "dominantRhythmicPulse",
    "tempo",
    "drumPercussionEvidence",
    "bassEvidence",
    "harmonicFoundation",
    "dominantElements",
    "instrumentEvidence",
    "melodicElements",
    "vocalCharacteristics",
    "arrangementChanges",
    "songSections",
    "energyProgression",
    "productionMixEvidence",
    "uncertaintyNotes",
  ],
};

const externalValidationSchema = z.object({
  identityConfirmed: z.boolean(),
  styleAgreement: z.enum(["strong", "partial", "weak", "conflicting"]),
  tempoAgreement: z.enum(["strong", "partial", "weak", "conflicting"]),
  referenceStyles: z.array(z.string().trim().min(1).max(500)).max(12),
  referenceTempos: z.array(z.string().trim().min(1).max(300)).max(12),
  instrumentationCredits: z.array(z.string().trim().min(1).max(1000)).max(20),
  keyOrChordReferences: z.array(z.string().trim().min(1).max(1000)).max(20),
  productionOrArrangementNotes: z.array(z.string().trim().min(1).max(1000)).max(20),
  releaseContext: z.array(z.string().trim().min(1).max(1000)).max(20),
  discrepancies: z.array(z.string().trim().min(1).max(1500)).max(20),
  notes: z.array(z.string().trim().min(1).max(1500)).max(20),
});

type ExternalValidation = z.infer<typeof externalValidationSchema> & {
  used: boolean;
  supportingSourcesCount: number;
  sourceTitles: string[];
};

const EXTERNAL_VALIDATION_RESPONSE_FORMAT = {
  type: "object",
  properties: {
    identityConfirmed: { type: "boolean" },
    styleAgreement: { type: "string", enum: ["strong", "partial", "weak", "conflicting"] },
    tempoAgreement: { type: "string", enum: ["strong", "partial", "weak", "conflicting"] },
    referenceStyles: { type: "array", items: { type: "string" } },
    referenceTempos: { type: "array", items: { type: "string" } },
    instrumentationCredits: { type: "array", items: { type: "string" } },
    keyOrChordReferences: { type: "array", items: { type: "string" } },
    productionOrArrangementNotes: { type: "array", items: { type: "string" } },
    releaseContext: { type: "array", items: { type: "string" } },
    discrepancies: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } },
  },
  required: [
    "identityConfirmed",
    "styleAgreement",
    "tempoAgreement",
    "referenceStyles",
    "referenceTempos",
    "instrumentationCredits",
    "keyOrChordReferences",
    "productionOrArrangementNotes",
    "releaseContext",
    "discrepancies",
    "notes",
  ],
} as const;

export async function requireAnalyzerAccess(context: { supabase: any }) {
  await requireFeatureAccess(context.supabase, "song_analyzer");
}

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

function normalizedOpenAiUsage(payload: any) {
  const usage = payload?.usage;
  if (!usage) return null;
  return {
    inputTokens: usage.prompt_tokens ?? null,
    outputTokens: usage.completion_tokens ?? null,
    totalTokens: usage.total_tokens ?? null,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? null,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
  };
}

function analyzerProvider(model: string) {
  return (
    BUILTIN_SONG_ANALYZER_MODEL_CONFIGS.find((item) => item.id === model)?.provider ?? "gemini"
  );
}

async function readExtraSongAnalyzerModels(): Promise<SongAnalyzerModelConfig[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "song_analyzer_extra_models")
    .maybeSingle();
  if (error) {
    console.error("[song-analyzer] could not read extra analyzer models", error.message);
    return [];
  }
  const rows = (data as any)?.value?.models;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((item: any) => {
    const provider = String(item?.provider ?? "") as SongAnalyzerProvider;
    const id = String(item?.id ?? "");
    if (!["gemini", "openai", "openrouter"].includes(provider) || !id) return [];

    const configured =
      provider === "gemini"
        ? Boolean(process.env["GEMINI_API_KEY"]?.trim())
        : provider === "openai"
          ? Boolean(process.env["OPENAI_API_KEY"]?.trim())
          : Boolean(process.env["OPENROUTER_API_KEY"]?.trim());
    if (!configured) return [];

    return [
      {
        id,
        label: String(item?.label ?? id),
        provider,
        acceptedMimeTypes:
          provider === "gemini"
            ? supportedMimeTypes
            : (["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"] as const),
      },
    ];
  });
}

async function availableSongAnalyzerModels() {
  const extras = await readExtraSongAnalyzerModels();
  return [...BUILTIN_SONG_ANALYZER_MODEL_CONFIGS, ...extras].filter(
    (model, index, all) => all.findIndex((candidate) => candidate.id === model.id) === index,
  );
}

export async function resolveSongAnalyzerModel(model: string): Promise<SongAnalyzerModelConfig> {
  const models = await availableSongAnalyzerModels();
  const selected = models.find((item) => item.id === model);
  if (!selected) throw new Error("That Music Analyzer model is not enabled.");
  return selected;
}

function openAiInputAudioFormat(mimeType: string): "mp3" | "wav" | null {
  if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") return "mp3";
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") return "wav";
  return null;
}

export function songAnalyzerModelAcceptsMimeType(model: string, mimeType: string) {
  const builtin = BUILTIN_SONG_ANALYZER_MODEL_CONFIGS.find((item) => item.id === model);
  return builtin
    ? builtin.acceptedMimeTypes.some((accepted) => accepted === mimeType)
    : openAiInputAudioFormat(mimeType) !== null;
}

function logStage(
  model: string,
  stage: string,
  event: string,
  details?: unknown,
  provider?: SongAnalyzerProvider,
) {
  console.info("[song-analyzer]", {
    provider: provider ?? analyzerProvider(model),
    model,
    stage,
    event,
    details,
  });
}

function parseStructured<T>(
  text: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  model: string,
  stage: string,
): T {
  const trimmed = text.trim();
  const fenced = trimmed.startsWith("```") && trimmed.endsWith("```");
  const jsonText = fenced
    ? trimmed.slice(trimmed.indexOf("\n") + 1, trimmed.lastIndexOf("```")).trim()
    : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    logStage(
      model,
      stage,
      "json_parse_failure",
      error instanceof Error ? error.message : String(error),
    );
    throw new Error(`Analyzer ${stage} returned invalid JSON`);
  }

  const checked = schema.safeParse(parsed);
  if (!checked.success) {
    const issues = checked.error.issues.slice(0, 6).map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      message: issue.message,
    }));
    logStage(model, stage, "schema_validation_failure", { issues });
    const detail = issues
      .map((issue) => issue.path || "<root>")
      .filter(Boolean)
      .slice(0, 4)
      .join(", ");
    throw new Error(
      `Analyzer ${stage} returned schema-invalid JSON${detail ? ` at: ${detail}` : ""}`,
    );
  }
  return checked.data;
}

function normalizeSectionCoverage(
  evidence: StageAEvidence,
  durationSeconds: number | null,
): StageAEvidence {
  if (!evidence.songSections.length) return evidence;

  const sections = evidence.songSections;
  const maxInserted = Math.max(0, 30 - sections.length);
  let inserted = 0;
  const normalized: StageAEvidence["songSections"] = [];

  const addGap = (startSeconds: number, endSeconds: number, location: string) => {
    if (inserted >= maxInserted || endSeconds - startSeconds <= 12) return;
    normalized.push({
      label: "Transition / Uncertain section",
      startSeconds,
      endSeconds,
      evidence: `Unclassified audible interval ${location}; preserved to avoid a silent timeline gap.`,
      confidence: "low",
    });
    inserted += 1;
  };

  const first = sections[0];
  if (first && first.startSeconds != null && first.startSeconds > 12) {
    addGap(0, first.startSeconds, "before the first identified section");
  }

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    if (!section) continue;
    if (index > 0) {
      const previous = sections[index - 1];
      if (previous && previous.endSeconds != null && section.startSeconds != null) {
        addGap(previous.endSeconds, section.startSeconds, "between identified sections");
      }
    }
    normalized.push(section);
  }

  const last = sections[sections.length - 1];
  if (
    last &&
    durationSeconds != null &&
    last.endSeconds != null &&
    durationSeconds > last.endSeconds
  ) {
    addGap(last.endSeconds, durationSeconds, "after the final identified section");
  }

  return normalized.length === sections.length
    ? evidence
    : { ...evidence, songSections: normalized.slice(0, 30) };
}

async function generateAudioEvidence(args: {
  apiKey?: string;
  provider: SongAnalyzerProvider;
  model: SongAnalyzerModelId;
  audioBase64: string;
  mimeType: string;
  stage0Evidence: Stage0DspEvidence;
  onUsage: (usage: ReturnType<typeof normalizedUsage>) => void;
}) {
  const stage = "evidence_extraction";
  const prompt = [
    "Extract raw musical evidence only. Do not classify genre or style. Return only schema-compliant JSON.",
    "",
    "QUANTITATIVE DSP REFERENCE",
    "The following values were computed directly from the same audio signal by deterministic DSP analysis.",
    "Treat them as SUPPORTING EVIDENCE, not unquestionable truth.",
    "If your auditory interpretation strongly disagrees:",
    "- do not blindly follow the DSP;",
    "- explicitly note the disagreement;",
    "- lower confidence where appropriate;",
    "- consider half-time/double-time ambiguity;",
    "- prefer the interpretation supported by multiple independent signals.",
    "DSP values must never generate genre assumptions.",
    "Energy changes are supporting evidence only and must not be mapped automatically to section labels.",
    "Weak key/chroma evidence must not influence genre classification.",
    "",
    JSON.stringify(args.stage0Evidence),
  ].join("\n");

  if (!args.apiKey) {
    throw new Error("The selected Music Analyzer provider is not configured.");
  }

  if (args.provider === "openai" || args.provider === "openrouter") {
    const format = openAiInputAudioFormat(args.mimeType);
    if (!format) {
      throw new Error(
        "This Music Analyzer provider currently accepts MP3 or WAV input in PromptBeats.",
      );
    }
    const response = await fetch(
      args.provider === "openrouter"
        ? "https://openrouter.ai/api/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${args.apiKey}`,
        },
        body: JSON.stringify({
          model: args.model,
          ...(args.provider === "openai" ? { modalities: ["text"] } : {}),
          messages: [
            {
              role: "system",
              content: `${EVIDENCE_EXTRACTION_SYSTEM_PROMPT}\n\n${OPENAI_STAGE_A_JSON_CONTRACT}`,
            },
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "input_audio",
                  input_audio: { data: args.audioBase64, format },
                },
              ],
            },
          ],
          max_completion_tokens: 8192,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(5 * 60 * 1000),
      },
    );

    const payload = (await response.json()) as any;
    args.onUsage(normalizedOpenAiUsage(payload));
    if (!response.ok) {
      logStage(args.model, stage, "provider_error", payload?.error?.message ?? response.status);
      throw new Error(
        payload?.error?.message || `Audio provider evidence extraction failed (${response.status})`,
      );
    }

    const choice = payload?.choices?.[0];
    const finishReason = choice?.finish_reason ?? null;
    if (finishReason && finishReason !== "stop") {
      logStage(args.model, stage, "non_success_stop_reason", finishReason);
      throw new Error(
        `Audio provider evidence extraction stopped before completion: ${finishReason}`,
      );
    }
    const text = typeof choice?.message?.content === "string" ? choice.message.content.trim() : "";
    if (!text) {
      logStage(args.model, stage, "missing_json");
      throw new Error("Audio provider evidence extraction returned no JSON");
    }

    const parsed = parseStructured(text, stageAEvidenceSchema, args.model, stage);
    const evidence = normalizeSectionCoverage(
      parsed,
      args.stage0Evidence.processing.durationSeconds,
    );
    logStage(args.model, stage, "success", {
      dominantElements: evidence.dominantElements.length,
      instruments: evidence.instrumentEvidence.length,
      sections: evidence.songSections.length,
    });
    return evidence;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": args.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: EVIDENCE_EXTRACTION_SYSTEM_PROMPT }] },
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
          responseSchema: EVIDENCE_RESPONSE_SCHEMA,
          maxOutputTokens: args.model === "gemini-4-argon" ? 32_768 : 8192,
          ...(args.model === "gemini-4-argon"
            ? { thinkingConfig: { thinkingLevel: "medium" } }
            : {}),
          temperature: 0.1,
        },
      }),
    },
  );

  const payload = (await response.json()) as any;
  args.onUsage(normalizedUsage(payload));

  if (!response.ok) {
    logStage(args.model, stage, "provider_error", payload?.error?.message ?? response.status);
    throw new Error(
      payload?.error?.message || `Gemini evidence extraction failed (${response.status})`,
    );
  }

  const candidate = payload?.candidates?.[0];
  const finishReason = candidate?.finishReason ?? null;
  if (finishReason && finishReason !== "STOP") {
    logStage(args.model, stage, "non_success_stop_reason", finishReason);
    throw new Error(`Gemini evidence extraction stopped before completion: ${finishReason}`);
  }

  const text = (candidate?.content?.parts ?? [])
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
  if (!text) {
    logStage(args.model, stage, "missing_json");
    throw new Error("Gemini evidence extraction returned no JSON");
  }

  const parsed = parseStructured(text, stageAEvidenceSchema, args.model, stage);
  const evidence = normalizeSectionCoverage(parsed, args.stage0Evidence.processing.durationSeconds);
  logStage(args.model, stage, "success", {
    dominantElements: evidence.dominantElements.length,
    instruments: evidence.instrumentEvidence.length,
    sections: evidence.songSections.length,
  });
  return evidence;
}

function evidenceDerivedInstruments(evidence: StageAEvidence) {
  const forbidden =
    /\b(vocals?|singer|backing vocals?|vocal chops?|risers?|sweeps?|impacts?|transition(?:al)? fx|sound effects?|sfx|reverb|delay|white noise|compression|sidechain)\b/i;
  const values = evidence.instrumentEvidence
    .filter((item) => !forbidden.test(item.instrument))
    .map((item) => {
      const details = [item.timbre, item.technique, item.role].filter(Boolean).join("; ");
      return details ? `${item.instrument} — ${details}` : item.instrument;
    });
  return [...new Set(values)].slice(0, 30);
}

function evidenceDerivedStructure(evidence: StageAEvidence) {
  const labels = evidence.songSections.map((section) => section.label.trim()).filter(Boolean);
  return labels.length ? labels.slice(0, 30) : null;
}

function formatSectionTime(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function evidenceDerivedDetailedStructure(evidence: StageAEvidence) {
  if (!evidence.songSections.length) return null;
  return evidence.songSections
    .map((section) => {
      if (section.startSeconds == null || section.endSeconds == null) return section.label;
      return `${section.label} (${formatSectionTime(section.startSeconds)}-${formatSectionTime(section.endSeconds)})`;
    })
    .join(" → ");
}

function clampConfidence(
  finalConfidence: "high" | "medium" | "low",
  evidenceConfidence: "high" | "medium" | "low",
) {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  return rank[finalConfidence] <= rank[evidenceConfidence] ? finalConfidence : evidenceConfidence;
}

function applyEvidenceGate(
  result: SongAnalysisResult,
  evidence: StageAEvidence,
): SongAnalysisResult {
  const instruments = evidenceDerivedInstruments(evidence);
  const structure = evidenceDerivedStructure(evidence);
  const detailedStructure = evidenceDerivedDetailedStructure(evidence);
  const felt = evidence.tempo.feltTempo;
  const fallback =
    result.generatorReady.bpm.approximate ?? evidence.tempo.gridCandidates[0] ?? null;
  const chosenBpm = felt ?? fallback;

  return {
    ...result,
    generatorReady: {
      ...result.generatorReady,
      instruments: instruments.length ? instruments : result.generatorReady.instruments,
      songStructure: structure ?? result.generatorReady.songStructure,
      bpm: {
        ...result.generatorReady.bpm,
        approximate: chosenBpm == null ? null : Math.round(chosenBpm),
        rangeMin: null,
        rangeMax: null,
        confidence: clampConfidence(
          result.generatorReady.bpm.confidence,
          evidence.tempo.confidence,
        ),
        notes: [
          result.generatorReady.bpm.notes,
          evidence.tempo.notes,
          evidence.tempo.possibleHalfTime != null
            ? `Possible half-time: ${evidence.tempo.possibleHalfTime} BPM.`
            : "",
          evidence.tempo.possibleDoubleTime != null
            ? `Possible double-time: ${evidence.tempo.possibleDoubleTime} BPM.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      },
    },
    detailedAnalysis: {
      ...result.detailedAnalysis,
      songStructure: detailedStructure ?? result.detailedAnalysis.songStructure,
    },
  };
}

async function generateFinalFromEvidence(args: {
  apiKey?: string;
  model: SongAnalyzerModelId;
  evidence: StageAEvidence;
  stage0Evidence: Stage0DspEvidence;
  initialResult?: SongAnalysisResult;
  externalValidation?: ExternalValidation | null;
  onUsage: (usage: ReturnType<typeof normalizedUsage>) => void;
}) {
  const stage = args.externalValidation ? "external_reconciliation" : "final_synthesis";
  const context = [
    "STAGE A EVIDENCE:",
    JSON.stringify(args.evidence),
    "\nSTAGE 0 QUANTITATIVE DSP SUPPORTING EVIDENCE:",
    JSON.stringify(args.stage0Evidence),
    "\nStage 0 is supporting evidence only. It cannot authorize any new instrument, groove, production, or genre claim absent from Stage A. Use it only to cross-check tempo, energy/dynamics, tonal uncertainty, and confidence.",
    args.initialResult
      ? "\nPREVIOUS STAGE B RESULT TO RECHECK:\n" + JSON.stringify(args.initialResult)
      : "",
    args.externalValidation
      ? "\nOPTIONAL EXTERNAL VALIDATION (secondary context only; cannot introduce new musical claims):\n" +
        JSON.stringify(args.externalValidation)
      : "",
    "\nProduce the final canonical Analyzer JSON. Every specific musical claim must be grounded in Stage A evidence.",
  ]
    .filter(Boolean)
    .join("\n");

  if (!args.apiKey) {
    throw new Error(
      args.model === V1_OPENROUTER_SYNTHESIS_MODEL
        ? "OpenRouter API is not configured"
        : analyzerProvider(args.model) === "openai"
          ? "OpenAI API is not configured"
          : "Gemini API is not configured",
    );
  }

  // V1 automatic Stage B for non-Gemini audio models uses the separately
  // installed OpenRouter Argon route. This is NOT the direct Google API.
  if (args.model === V1_OPENROUTER_SYNTHESIS_MODEL) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        model: V1_OPENROUTER_SYNTHESIS_MODEL,
        messages: [
          { role: "system", content: ANALYZER_SYSTEM_PROMPT },
          { role: "user", content: context },
        ],
        response_format: { type: "json_object" },
        max_tokens: 16_384,
      }),
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });
    const payload = (await response.json()) as any;
    args.onUsage(normalizedOpenAiUsage(payload));
    if (!response.ok) {
      logStage(args.model, stage, "provider_error", payload?.error?.message ?? response.status);
      throw new Error(payload?.error?.message || `OpenRouter synthesis failed (${response.status})`);
    }
    const choice = payload?.choices?.[0];
    const finishReason = choice?.finish_reason ?? null;
    if (finishReason && finishReason !== "stop") {
      logStage(args.model, stage, "non_success_stop_reason", finishReason);
      throw new Error(`OpenRouter synthesis stopped before completion: ${finishReason}`);
    }
    const text = typeof choice?.message?.content === "string" ? choice.message.content.trim() : "";
    if (!text) {
      logStage(args.model, stage, "missing_json");
      throw new Error("OpenRouter synthesis returned no JSON");
    }
    const final = parseStructured(text, songAnalysisResultSchema, args.model, stage);
    const gated = applyEvidenceGate(final, args.evidence);
    logStage(args.model, stage, "success");
    return gated;
  }

  if (analyzerProvider(args.model) === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        model: args.model,
        modalities: ["text"],
        messages: [
          { role: "system", content: ANALYZER_SYSTEM_PROMPT },
          { role: "user", content: context },
        ],
        max_completion_tokens: 8192,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });

    const payload = (await response.json()) as any;
    args.onUsage(normalizedOpenAiUsage(payload));
    if (!response.ok) {
      logStage(args.model, stage, "provider_error", payload?.error?.message ?? response.status);
      throw new Error(
        payload?.error?.message || `OpenAI final synthesis failed (${response.status})`,
      );
    }

    const choice = payload?.choices?.[0];
    const finishReason = choice?.finish_reason ?? null;
    if (finishReason && finishReason !== "stop") {
      logStage(args.model, stage, "non_success_stop_reason", finishReason);
      throw new Error(`OpenAI final synthesis stopped before completion: ${finishReason}`);
    }

    const text = typeof choice?.message?.content === "string" ? choice.message.content.trim() : "";
    if (!text) {
      logStage(args.model, stage, "missing_json");
      throw new Error("OpenAI final synthesis returned no JSON");
    }

    const final = parseStructured(text, songAnalysisResultSchema, args.model, stage);
    const gated = applyEvidenceGate(final, args.evidence);
    logStage(args.model, stage, "success");
    return gated;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": args.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: ANALYZER_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: context }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: ANALYZER_RESPONSE_SCHEMA,
          maxOutputTokens: args.model === "gemini-4-argon" ? 32_768 : 8192,
          ...(args.model === "gemini-4-argon"
            ? { thinkingConfig: { thinkingLevel: "medium" } }
            : {}),
          temperature: 0.1,
        },
      }),
    },
  );

  const payload = (await response.json()) as any;
  args.onUsage(normalizedUsage(payload));

  if (!response.ok) {
    logStage(args.model, stage, "provider_error", payload?.error?.message ?? response.status);
    throw new Error(
      payload?.error?.message || `Gemini final synthesis failed (${response.status})`,
    );
  }

  const candidate = payload?.candidates?.[0];
  const finishReason = candidate?.finishReason ?? null;
  if (finishReason && finishReason !== "STOP") {
    logStage(args.model, stage, "non_success_stop_reason", finishReason);
    throw new Error(`Gemini final synthesis stopped before completion: ${finishReason}`);
  }

  const text = (candidate?.content?.parts ?? [])
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
  if (!text) {
    logStage(args.model, stage, "missing_json");
    throw new Error("Gemini final synthesis returned no JSON");
  }

  const final = parseStructured(text, songAnalysisResultSchema, args.model, stage);
  const gated = applyEvidenceGate(final, args.evidence);
  logStage(args.model, stage, "success");
  return gated;
}

async function runExternalReferenceValidation(args: {
  apiKey: string;
  model: string;
  trackTitle: string;
  artist: string;
  initialAnalysis: SongAnalysisResult;
}) {
  const stage = "external_validation";
  const ai = new GoogleGenAI({ apiKey: args.apiKey });
  const prompt = `
You are performing SECONDARY external-reference validation for an AI music-analysis system.

IMPORTANT ORDER OF AUTHORITY
- Raw audio evidence was extracted independently before this lookup.
- The final musical analysis was synthesized from that evidence before this lookup.
- External references may support, challenge, or contextualize the analysis, but must never create new musical claims.
- Do not infer instrumentation or production stereotypes from genre metadata.
- Only validate the exact track identity and collect cautious reference signals.

USER-PROVIDED TRACK IDENTITY
Track Title: ${args.trackTitle}
Artist: ${args.artist}

EVIDENCE-GROUNDED ANALYSIS TO CROSS-CHECK
${JSON.stringify(args.initialAnalysis)}

SEARCH / SOURCE RULES
- Search only for the exact artist + track combination.
- Prefer official artist/label pages, reputable music databases, official streaming metadata, liner-note/credit sources, and reliable music-reference sites.
- Treat low-quality SEO pages, autogenerated metadata pages, and generic BPM/chord pages as weak evidence.
- If identity is ambiguous, multiple songs share the title, or the artist/title combination cannot be confidently confirmed, set identityConfirmed=false.
- Do not guess.
- Broad style validation matters more than forcing a narrow subgenre.
- Public BPM references are validation signals only; half/double-time mismatches are common.
- Key/chord references, instrumentation credits, production/arrangement notes, album/release context, and official credits may be collected only when supported by a reliable source.
- External references cannot authorize an instrument, effect, groove, or arrangement claim that is absent from Stage A audio evidence.

Return only the requested structured JSON.
`.trim();

  try {
    const response = await ai.models.generateContent({
      model: args.model,
      contents: prompt,
      config: {
        abortSignal: AbortSignal.timeout(5 * 60 * 1000),
        httpOptions: { timeout: 5 * 60 * 1000 },
        tools: [{ googleSearch: {} }],
        responseFormat: {
          text: { mimeType: "application/json", schema: EXTERNAL_VALIDATION_RESPONSE_FORMAT },
        },
        temperature: 0.1,
      } as any,
    });

    const usage = normalizedUsage(response as any);
    const text = String((response as any).text ?? "").trim();
    if (!text) {
      logStage(args.model, stage, "missing_json");
      throw new Error("External validation returned no structured result");
    }

    const validated = parseStructured(text, externalValidationSchema, args.model, stage);
    const chunks = ((response as any)?.candidates?.[0]?.groundingMetadata?.groundingChunks ??
      []) as any[];
    const uniqueSources = new Map<string, string>();
    for (const chunk of chunks) {
      const uri = chunk?.web?.uri;
      const title = chunk?.web?.title;
      if (typeof uri === "string" && uri)
        uniqueSources.set(uri, typeof title === "string" ? title : uri);
    }

    const supportingSourcesCount = uniqueSources.size;
    const used = validated.identityConfirmed && supportingSourcesCount > 0;
    logStage(args.model, stage, "success", {
      identityConfirmed: validated.identityConfirmed,
      supportingSourcesCount,
    });

    return {
      validation: {
        ...validated,
        used,
        supportingSourcesCount,
        sourceTitles: [...uniqueSources.values()].slice(0, 12),
      } satisfies ExternalValidation,
      usage,
    };
  } catch (error) {
    logStage(args.model, stage, "failure", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

const analyzeInput = z.object({
  version: z.literal("v1").default("v1"),
  audioBase64: z.string().min(1).max(21_500_000),
  mimeType: z.enum(supportedMimeTypes),
  model: z.string().trim().min(1).max(240).default(DEFAULT_SONG_ANALYZER_MODEL),
  trackTitle: z.string().trim().min(1).max(200).optional(),
  artist: z.string().trim().min(1).max(200).optional(),
  stage0Evidence: stage0DspEvidenceSchema,
  requestKey: auxiliaryRequestKeySchema,
});

export const getSongAnalyzerAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAnalyzerAccess(context);
    const { readAnalyzerV2AdminOptions } = await import("./song-analyzer-v2-admin-options.server");
    const v2Options = await readAnalyzerV2AdminOptions();
    return {
      allowed: true as const,
      models: (await availableSongAnalyzerModels()).map((model) => ({
        id: model.id,
        label: model.label,
        provider: model.provider,
        acceptedMimeTypes: [...model.acceptedMimeTypes],
        v2Compatible:
          analyzerV2Compatibility(model).compatible ||
          v2Options.some(
            (option) =>
              option.provider === model.provider && option.id === model.id && option.enabled,
          ),
      })),
      defaultModel: DEFAULT_SONG_ANALYZER_MODEL,
      maxFileBytes: SONG_ANALYZER_MAX_FILE_BYTES,
      supportedMimeTypes,
    };
  });

async function recordStageUsage(args: {
  userId: string;
  provider: string;
  model: string;
  stage:
    "evidence_extraction" | "final_synthesis" | "external_validation" | "external_reconciliation";
  usage: ReturnType<typeof normalizedUsage>;
  success: boolean;
}) {
  logStage(args.model, args.stage, args.success ? "usage_success" : "usage_failure", args.usage);
  await recordAiUsage({
    userId: args.userId,
    provider: args.provider,
    model: args.model,
    operation: "song_analysis",
    usage: args.usage,
    success: args.success,
  });
}

export const analyzeSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => analyzeInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAnalyzerAccess(context);
    return executeDurableAuxiliaryAiRequest({
      supabase: context.supabase,
      userId: context.userId,
      operation: "song_analyzer",
      requestKey: data.requestKey,
      execute: async (markProviderStarted) => {
        const bytes = Buffer.from(data.audioBase64, "base64");
        if (!bytes.length || bytes.byteLength > SONG_ANALYZER_MAX_FILE_BYTES) {
          throw new Error("Audio file exceeds the 15 MB Analyzer limit.");
        }

        const modelConfig = await resolveSongAnalyzerModel(data.model);
        const provider = modelConfig.provider;
        const apiKey =
          provider === "openai"
            ? process.env["OPENAI_API_KEY"]
            : provider === "openrouter"
              ? process.env["OPENROUTER_API_KEY"]
              : process.env["GEMINI_API_KEY"];
        if (!apiKey) {
          throw new Error(
            provider === "openai"
              ? "OpenAI API is not configured"
              : provider === "openrouter"
                ? "OpenRouter API is not configured"
                : "Gemini API is not configured",
          );
        }

        const totalStartedAt = Date.now();
        const stage0Evidence = data.stage0Evidence;
        logStage(data.model, "stage0_dsp", stage0Evidence.available ? "available" : "unavailable", {
          processing: stage0Evidence.processing,
          tempo: stage0Evidence.tempo,
          limitations: stage0Evidence.limitations,
        });

        let evidenceUsage: ReturnType<typeof normalizedUsage> = null;
        let evidence: StageAEvidence;
        const stageAStartedAt = Date.now();
        try {
          await markProviderStarted();
          evidence = await generateAudioEvidence({
            apiKey,
            provider,
            model: data.model,
            audioBase64: data.audioBase64,
            mimeType: data.mimeType,
            stage0Evidence,
            onUsage: (usage) => {
              evidenceUsage = usage;
            },
          });
          await recordStageUsage({
            userId: context.userId,
            provider,
            model: data.model,
            stage: "evidence_extraction",
            usage: evidenceUsage,
            success: true,
          });
          logStage(data.model, "evidence_extraction", "timing", {
            durationMs: Date.now() - stageAStartedAt,
          });
        } catch (error) {
          await recordStageUsage({
            userId: context.userId,
            provider,
            model: data.model,
            stage: "evidence_extraction",
            usage: evidenceUsage,
            success: false,
          });
          throw error;
        }

        const synthesisModel: SongAnalyzerModelId =
          provider === "gemini" ? data.model : V1_OPENROUTER_SYNTHESIS_MODEL;
        const synthesisApiKey =
          synthesisModel === data.model ? apiKey : process.env["OPENROUTER_API_KEY"];
        if (!synthesisApiKey) {
          throw new Error("OpenRouter API is not configured");
        }

        let synthesisUsage: ReturnType<typeof normalizedUsage> = null;
        let result: SongAnalysisResult;
        const stageBStartedAt = Date.now();
        try {
          result = await generateFinalFromEvidence({
            apiKey: synthesisApiKey,
            model: synthesisModel,
            evidence,
            stage0Evidence,
            onUsage: (usage) => {
              synthesisUsage = usage;
            },
          });
          await recordStageUsage({
            userId: context.userId,
            provider: provider === "gemini" ? "gemini" : "openrouter",
            model: synthesisModel,
            stage: "final_synthesis",
            usage: synthesisUsage,
            success: true,
          });
          logStage(synthesisModel, "final_synthesis", "timing", {
            durationMs: Date.now() - stageBStartedAt,
            audioAnalysisModel: data.model,
          });
        } catch (error) {
          await recordStageUsage({
            userId: context.userId,
            provider: "gemini",
            model: synthesisModel,
            stage: "final_synthesis",
            usage: synthesisUsage,
            success: false,
          });
          throw error;
        }

        const trackTitle = data.trackTitle?.trim();
        const artist = data.artist?.trim();

        if (provider !== "gemini" || !trackTitle || !artist) {
          logStage(data.model, "analysis_total", "timing", {
            durationMs: Date.now() - totalStartedAt,
          });
          return { result, model: data.model, stage0Evidence, stageAEvidence: evidence };
        }

        let externalUsage: ReturnType<typeof normalizedUsage> = null;
        let external: ExternalValidation | null = null;
        try {
          const validationResult = await runExternalReferenceValidation({
            apiKey,
            model: data.model,
            trackTitle,
            artist,
            initialAnalysis: result,
          });
          external = validationResult.validation;
          externalUsage = validationResult.usage;
          await recordStageUsage({
            userId: context.userId,
            provider: "gemini",
            model: data.model,
            stage: "external_validation",
            usage: externalUsage,
            success: true,
          });
        } catch (error) {
          await recordStageUsage({
            userId: context.userId,
            provider: "gemini",
            model: data.model,
            stage: "external_validation",
            usage: externalUsage,
            success: false,
          });
          logStage(data.model, "analysis_total", "timing", {
            durationMs: Date.now() - totalStartedAt,
          });
          return { result, model: data.model, stage0Evidence, stageAEvidence: evidence };
        }

        if (!external.used || !external.identityConfirmed) {
          logStage(data.model, "analysis_total", "timing", {
            durationMs: Date.now() - totalStartedAt,
          });
          return { result, model: data.model, stage0Evidence, stageAEvidence: evidence };
        }

        let reconciliationUsage: ReturnType<typeof normalizedUsage> = null;
        try {
          const reconciled = await generateFinalFromEvidence({
            apiKey,
            model: data.model,
            evidence,
            stage0Evidence,
            initialResult: result,
            externalValidation: external,
            onUsage: (usage) => {
              reconciliationUsage = usage;
            },
          });
          await recordStageUsage({
            userId: context.userId,
            provider: "gemini",
            model: data.model,
            stage: "external_reconciliation",
            usage: reconciliationUsage,
            success: true,
          });
          logStage(data.model, "analysis_total", "timing", {
            durationMs: Date.now() - totalStartedAt,
          });
          return {
            result: reconciled,
            model: data.model,
            stage0Evidence,
            stageAEvidence: evidence,
          };
        } catch (error) {
          await recordStageUsage({
            userId: context.userId,
            provider: "gemini",
            model: data.model,
            stage: "external_reconciliation",
            usage: reconciliationUsage,
            success: false,
          });
          logStage(data.model, "analysis_total", "timing", {
            durationMs: Date.now() - totalStartedAt,
          });
          return { result, model: data.model, stage0Evidence, stageAEvidence: evidence };
        }
      },
    });
  });

// Optional experimental metadata lives only at the persistence boundary.
// V1 generation/validation and its provider schema remain exactly unchanged.
export const savedSongAnalysisResultSchema = songAnalysisResultSchema.extend({
  generatorReady: songAnalysisResultSchema.shape.generatorReady.extend({
    analyzerVersion: z.literal("v2").optional(),
  }),
  detailedAnalysis: songAnalysisResultSchema.shape.detailedAnalysis.extend({
    analyzerProvenance: analyzerV2ProvenanceSchema.optional(),
  }),
});

const saveAnalysisInput = z.object({
  name: z.string().trim().min(1).max(200),
  projectId: z.string().uuid().nullable().optional(),
  model: z.string().trim().min(1).max(240),
  result: savedSongAnalysisResultSchema,
});

async function assertOwnedProject(
  supabase: any,
  userId: string,
  projectId: string | null | undefined,
) {
  if (!projectId) return;
  const { data: project, error } = await supabase
    .from("prompt_projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !project) throw new Error("Project not found");
}

export const saveSongAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveAnalysisInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAnalyzerAccess(context);
    const supabase = context.supabase as any;
    await assertOwnedProject(supabase, context.userId, data.projectId);

    const { data: saved, error } = await supabase
      .from("song_analyses")
      .insert({
        user_id: context.userId,
        name: data.name,
        project_id: data.projectId ?? null,
        model: data.model,
        generator_ready: data.result.generatorReady,
        detailed_analysis: data.result.detailedAnalysis,
      })
      .select("id, name, project_id, model, generator_ready, detailed_analysis, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { analysis: saved };
  });

/** Backward-compatible export for callers created by the first Analyzer release. */
export const saveSongAnalysisToProject = saveSongAnalysis;

export const listSongAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFeatureAccess(context.supabase, "song_analyzer");
    const supabase = context.supabase as any;
    const { data, error } = await supabase
      .from("song_analyses")
      .select("id, name, project_id, model, generator_ready, detailed_analysis, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { analyses: data ?? [] };
  });

const updateAnalysisInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  projectId: z.string().uuid().nullable().optional(),
});

export const updateSongAnalysisOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateAnalysisInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_analyzer");
    const supabase = context.supabase as any;
    if (data.projectId !== undefined) {
      await assertOwnedProject(supabase, context.userId, data.projectId);
    }
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.projectId !== undefined) patch["project_id"] = data.projectId;
    if (Object.keys(patch).length === 0) return { ok: true as const };
    const { error } = await supabase
      .from("song_analyses")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteSongAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "song_analyzer");
    const supabase = context.supabase as any;
    const { error } = await supabase
      .from("song_analyses")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
