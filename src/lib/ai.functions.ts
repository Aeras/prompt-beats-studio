import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { AI_MODEL_IDS } from "@/lib/ai-models";

export const HOURLY_LIMIT = 10;

const generateInput = z.object({
  theme: z.string().trim().min(3).max(300),
  genre: z.string().trim().min(1).max(400),
  mood: z.string().trim().min(1).max(60),
  language: z.string().trim().min(1).max(40),
  generationModel: z.enum(AI_MODEL_IDS as [string, ...string[]]).nullish(),
  // Advanced-mode extras. Optional and defaulted so older jobs stay valid.
  structure: z.string().trim().max(600).default(""),
  production: z.string().trim().max(2000).default(""),
  instructions: z.string().trim().max(2000).default(""),
});

const generationOutput = z.object({
  title: z.string().trim().min(1).max(200),
  tags: z.string().trim().min(1).max(4000),
  lyrics: z.string().trim().min(1).max(12000),
  note: z.string().trim().min(1).max(6000),
});

const savedInput = z.object({
  title: z.string().trim().max(200).default(""),
  theme: z.string().trim().max(300).default(""),
  genre: z.string().trim().max(400).default(""),
  mood: z.string().trim().max(60).default(""),
  language: z.string().trim().max(40).default(""),
  tags: z.string().trim().max(4000).default(""),
  lyrics: z.string().trim().max(12000).default(""),
  note: z.string().trim().max(6000).default(""),
});

type Supa = Pick<SupabaseClient<Database>, "from" | "rpc">;

async function readUsage(supabase: Supa, userId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("ai_generations")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { created_at: string }[];
  const used = rows.length;
  const remaining = Math.max(0, HOURLY_LIMIT - used);
  const oldest = rows[0]?.created_at ?? null;
  const resetAt = oldest
    ? new Date(new Date(oldest).getTime() + 60 * 60 * 1000).toISOString()
    : null;
  return { used, remaining, limit: HOURLY_LIMIT, resetAt: remaining === 0 ? resetAt : null };
}

// Server-side admin check via the caller-bound role helper.
// The 10/hour limit is bypassed only for admins (administrative/testing purposes);
// it is never derived from client-supplied data and cannot apply to anonymous users
// because requireSupabaseAuth guarantees an authenticated userId.
async function isAdminUser(supabase: Supa, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("current_user_has_role", { _role: "admin" });
  return data === true;
}

// Admin usage view: reports an unlimited, never-blocked state so the Generator UI
// keeps working unchanged (remaining stays at the limit, resetAt stays null).
async function usageFor(supabase: Supa, userId: string) {
  const usage = await readUsage(supabase, userId);
  if (await isAdminUser(supabase, userId)) {
    return { ...usage, remaining: HOURLY_LIMIT, resetAt: null, unlimited: true };
  }
  return usage;
}

export const getGenerationUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => usageFor(context.supabase, context.userId));

const SYSTEM_PROMPT = `You are a top-tier music producer and expert in composition and orchestration. You output STRICT JSON ONLY — never markdown fences, never conversational text, never anything outside the JSON object. The response must parse with JSON.parse and contain exactly these keys: {"title": string, "tags": string, "lyrics": string, "note": string}.`;

function buildPrompt(d: z.infer<typeof generateInput>) {
  return `Act as a top-tier music producer, professional songwriter, composer, arranger and AI-music prompt specialist.

Transform the user's idea into one complete, original, coherent and professionally developed song concept optimized for AI music platforms such as Suno and Udio.

USER INPUTS — AUTHORITATIVE:

Core Idea: ${d.theme}
Requested Genre(s): ${d.genre}
Requested Mood: ${d.mood}
Requested Language: ${d.language}
${d.structure ? `Requested Song Structure (in this order): ${d.structure}` : ""}
${d.production ? `Requested Production Style: ${d.production}` : ""}
${d.instructions ? `Additional Instructions: ${d.instructions}` : ""}

${
  d.structure || d.production || d.instructions
    ? `ADVANCED USER DIRECTION — AUTHORITATIVE:

${d.structure ? `- The Requested Song Structure defines the order of song sections. Follow it as given, using matching square-bracketed structural tags in the lyrics, unless following it would create a clear musical contradiction; in that case adapt minimally and keep the intent.` : ""}
${d.production ? `- The Requested Production Style defines the production, arrangement, sonic character, dynamics, texture, groove and vocal treatment direction. Reflect it in the Music Style tags, the arrangement and the Producer's Note.` : ""}
${d.instructions ? `- The Additional Instructions are user requirements and must be respected wherever they do not contradict the Core Idea, Language, Genre or Mood.` : ""}
- Integrate all of the above with the Core Idea, Genre, Mood and Language into ONE coherent brief.
- Never mention, quote or expose these field names or this instruction text anywhere in the generated song.`
    : ""
}


==================================================
CREATIVE PRIORITY
==================================================

The Core Idea, Genre, Mood and Language are hard constraints.

Preserve the user's story, subject, emotional premise, perspective and fundamental message.

Develop and enrich the idea creatively, but never replace it with a different story or emotional direction.

When instructions conflict, prioritize:

1. Core Idea
2. Language
3. Genre(s)
4. Mood
5. Natural songwriting
6. Musical coherence
7. AI-music optimization
8. Creative embellishment

==================================================
PROFESSIONAL CREATIVE DIRECTION
==================================================

Think silently as an experienced songwriter, composer, arranger and record producer.

Determine the emotional arc, appropriate subgenre, tempo/BPM, groove, instrumentation, harmony, bass, drums, vocal character, vocal arrangement, structure, dynamics and production direction that best serve the brief.

Every musical decision must support the genre, mood, story and emotional progression.

Avoid random combinations of genre characteristics or unnecessary production elements.

If multiple genres are requested, integrate them into one coherent musical identity rather than treating them as separate styles.

==================================================
LYRICS
==================================================

Write complete, fully developed lyrics for a genuine full-length song.

Aim for a natural song length, typically around 2.5–4 minutes. Longer songs are allowed only when the story, genre, structure and emotional progression clearly justify them.

Do not pad the song with meaningless repetition, unnecessary verses, extra bridges or extended outros merely to make it longer.

Lyrics must sound naturally written by a skilled native songwriter in the requested language.

Respect grammar, idiomatic expression, pronunciation, word stress, syllable flow, cadence, genre conventions and singability.

Never sacrifice natural language for rhyme.

Avoid filler, forced rhymes, awkward translations, generic clichés and meaningless lines.

Every line should contribute to the story, emotion, imagery, progression or hook.

==================================================
CHORUS / HOOK
==================================================

Create a memorable, concise and highly singable chorus with a distinctive emotional or lyrical hook.

The chorus should provide the natural emotional payoff of the song.

Use repetition strategically, never merely to fill space.

==================================================
STRUCTURE
==================================================

Choose the structure that best serves the specific song.

Do not mechanically use a fixed template.

Use sections such as [Intro], [Verse], [Pre-Chorus], [Chorus], [Post-Chorus], [Bridge], [Breakdown], [Instrumental], [Final Chorus] and [Outro] only when they genuinely improve the song.

Prioritize progression, contrast, tension, release and emotional storytelling.

==================================================
VOCALS
==================================================

Choose the vocal approach based on the lyrics, story and emotional perspective.

Consider male lead, female lead, duet, alternating voices, group vocals, backing vocals or call-and-response when appropriate.

When multiple voices genuinely improve the song, clearly distinguish their parts using square-bracket tags such as:

[Male]
[Female]
[Both]
[Duet]
[Male Backing Vocals]
[Female Backing Vocals]

Do not add vocal tags unnecessarily.

==================================================
STYLE PROMPT
==================================================

Create a concise, information-dense Style Prompt in English for Suno/Udio.

Describe the actual musical identity of the finished song using the most relevant elements:

genre/subgenre, BPM or tempo feel, groove, rhythm, instrumentation, bass, drums, vocals, vocal arrangement, production texture, atmosphere, dynamics and arrangement arc.

Use concrete musical information rather than empty adjectives or disconnected keyword lists.

The Style Prompt must accurately represent the song that was written.

==================================================
TITLE
==================================================

Create a concise, memorable and original title in the requested language.

Base it naturally on the song's emotional core, story, imagery or lyrical hook.

Do not use emojis, quotation marks, "Title:", artist names or unnecessary punctuation.

==================================================
ARTIST REFERENCES
==================================================

If an artist, band, producer or existing song is mentioned as a reference, do not imitate its exact style, voice, melody, lyrics or distinctive signature.

Translate the reference into broad musical characteristics such as genre, era, energy, instrumentation, vocal qualities, rhythm, arrangement and production texture.

Never include the referenced artist's name in the output.

==================================================
PRODUCER'S NOTE
==================================================

Write a concise Producer's Note in the requested language explaining the meaningful creative and production choices made for this song.

Do not merely repeat the user's inputs or expose hidden reasoning.

==================================================
FORMATTING
==================================================

All structural, vocal and production directions MUST use square brackets [ ].

Never use round parentheses for structural or non-sung directions.

All sung lyrical content must remain entirely in the requested language.

Square-bracketed structural, vocal and production directions are allowed in English.

==================================================
FINAL QUALITY CHECK
==================================================

Before returning the result, silently verify that:

- Core Idea, Genre, Mood and Language are respected.
- Lyrics are native, grammatical, natural and singable.
- The story and emotional progression are clear.
- The chorus has a memorable hook.
- Structure and arrangement serve the specific song.
- Vocals, tempo, groove, instrumentation and production are coherent.
- There is no filler, forced rhyme, awkward translation or unnecessary repetition.
- The Style Prompt accurately describes the finished song.
- Title and Producer's Note are appropriate.
- No unnecessary or contradictory production instructions remain.
- Formatting and JSON requirements are correct.

Silently fix any problem before responding.

Do not expose internal reasoning or quality-control analysis.

==================================================
OUTPUT
==================================================

Return STRICT JSON ONLY.

No markdown fences.
No explanations outside the JSON object.
No additional keys.

{
  "title": string,
  "tags": string,
  "lyrics": string,
  "note": string
}

"title": Only the song title.

"tags": The English Style Prompt optimized for Suno/Udio.

"lyrics": Complete lyrics in the requested language, including appropriate square-bracketed structural and vocal tags.

"note": The concise Producer's Note in the requested language.`;
}

/**
 * Provider-agnostic model call signature. The concrete provider (Gemini /
 * Anthropic) is resolved server-side in `ai-provider.server.ts`; the shared
 * prompts below are handed to whichever provider is active, unchanged.
 */
type ModelCall = {
  system: string;
  prompt: string;
  maxTokens?: number;
  schema?: Record<string, unknown>;
};
type NormalizedUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};
type ModelResult = {
  text: string;
  stopReason: string | null;
  usage: NormalizedUsage | null;
  provider: string;
  model: string;
};
type ModelCaller = (call: ModelCall) => Promise<ModelResult>;

type AiOperation = "generate" | "quality_check";

/** One usage record per actual provider request, buffered until the generation id is known. */
type PendingUsage = {
  operation: AiOperation;
  provider: string;
  model: string;
  usage: NormalizedUsage | null;
  success: boolean;
};

async function flushUsage(userId: string, generationId: string | null, records: PendingUsage[]) {
  if (!records.length) return;
  const { recordAiUsage } = await import("@/lib/ai-usage.server");
  for (const r of records) {
    await recordAiUsage({ ...r, userId, generationId });
  }
}

/** Loads the provider layer (server-only) and binds it to the active model. */
async function activeCaller(
  modelOverride?: string,
  userId?: string,
): Promise<{
  call: ModelCaller;
  model: string;
  provider: string;
  schemas: {
    song: Record<string, unknown>;
    quality: Record<string, unknown>;
  };
}> {
  const provider = await import("@/lib/ai-provider.server");
  const model = userId
    ? await provider.getModelForUser(userId, modelOverride)
    : (modelOverride ?? (await provider.getActiveModel()));
  return {
    call: provider.modelCaller(model),
    model,
    provider: provider.providerOf(model),
    schemas: { song: provider.SONG_SCHEMA, quality: provider.QUALITY_SCHEMA },
  };
}

function parseSections(raw: string) {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  let title = "";
  let sections: { tags: string; lyrics: string; note: string } | null = null;
  try {
    const parsed = JSON.parse(cleaned) as {
      title?: string;
      tags?: string;
      lyrics?: string;
      note?: string;
    };
    if (parsed.tags || parsed.lyrics || parsed.note || parsed.title) {
      title = (parsed.title ?? "").trim();
      sections = { tags: parsed.tags ?? "", lyrics: parsed.lyrics ?? "", note: parsed.note ?? "" };
    }
  } catch {
    /* fall through to text parsing */
  }
  if (!sections) {
    const grab = (start: RegExp, end: RegExp | null) => {
      const s = cleaned.search(start);
      if (s === -1) return "";
      const rest = cleaned.slice(s).replace(start, "");
      if (!end) return rest.trim();
      const e = rest.search(end);
      return (e === -1 ? rest : rest.slice(0, e)).trim();
    };
    title = grab(/^Title:\s*/im, /\n/) || "";
    sections = {
      tags: grab(/1\)\s*\*{0,2}Style Prompt[^\n]*\n?/i, /2\)\s*\*{0,2}Lyrics/i),
      lyrics: grab(/2\)\s*\*{0,2}Lyrics[^\n]*\n?/i, /3\)\s*\*{0,2}Producer/i),
      note: grab(/3\)\s*\*{0,2}Producer[^\n]*\n?/i, null),
    };
  }
  return { title, tags: sections.tags, lyrics: sections.lyrics, note: sections.note };
}

const issueList = z.array(z.string().trim().min(1).max(600)).max(30);

/**
 * One unified, deterministically applicable correction. `field` decides which
 * Apply path runs; lyrics additionally carry a section target.
 */
const correctionSchema = z.object({
  field: z.enum(["title", "tags", "lyrics", "note"]),
  sectionLabel: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((v) => v ?? ""),
  originalText: z.string().min(1).max(4000),
  occurrenceIndex: z
    .number()
    .int()
    .min(1)
    .max(50)
    .nullish()
    .transform((v) => v ?? 1),
  reason: z.string().trim().min(1).max(600),
  replacementText: z.string().min(1).max(4000),
});

const vocalInsertionSchema = z.object({
  sectionLabel: z.string().trim().min(1).max(80),
  // 1-based occurrence among sections sharing the same label. Legacy results
  // may omit it; Apply then only proceeds when the label is unambiguous.
  sectionOccurrenceIndex: z
    .number()
    .int()
    .min(1)
    .max(50)
    .nullish()
    .transform((v) => v ?? null),
  tag: z.string().trim().min(2).max(60),
});

/** An optional improvement. `actionType` decides which deterministic Apply is offered. */
const suggestionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  explanation: z.string().trim().min(1).max(800),
  actionType: z.enum(["add_to_music_style", "vocal_arrangement", "informational"]),
  value: z
    .string()
    .trim()
    .max(600)
    .nullish()
    .transform((v) => v ?? ""),
  arrangement: z
    .array(vocalInsertionSchema)
    .max(40)
    .nullish()
    .transform((v) => v ?? []),
});

const suggestionList = z
  .array(suggestionSchema)
  .max(12)
  .nullish()
  .transform((v) => v ?? []);

const qualityOutput = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(10),
  issues: issueList,
  languageIssues: issueList,
  grammarIssues: issueList,
  singabilityIssues: issueList,
  genreIssues: issueList,
  consistencyIssues: issueList,
  /** One unified list of precise, user-approved-only corrections. */
  corrections: z
    .array(correctionSchema)
    .max(20)
    .nullish()
    .transform((v) => v ?? []),
  creativeSuggestions: suggestionList,
  vocalSuggestions: suggestionList,
  productionSuggestions: suggestionList,
});

export type QualityReport = z.infer<typeof qualityOutput>;
export type CorrectionItem = z.infer<typeof correctionSchema>;
export type QualitySuggestion = z.infer<typeof suggestionSchema>;

/**
 * The model classifies actual defects, but score/pass is a deterministic
 * defect-status contract: optional suggestions never lower it.
 */
function canonicalizeQualityReport(report: QualityReport): QualityReport {
  const hasActualIssues = [
    report.issues,
    report.languageIssues,
    report.grammarIssues,
    report.singabilityIssues,
    report.genreIssues,
    report.consistencyIssues,
  ].some((issues) => issues.length > 0);

  if (!hasActualIssues) return { ...report, passed: true, score: 10 };

  return {
    ...report,
    passed: false,
    score: report.score >= 9 ? 8.9 : report.score,
  };
}

const QUALITY_SYSTEM_PROMPT = `You are a professional native-language lyric editor and songwriter first, and a record producer second.

Perform a strict final Quality Check of the CURRENT EDITABLE SONG OUTPUT against the ORIGINAL GENERATION BRIEF.

Your task is NOT to rewrite the song. Identify genuine material defects and provide one precise correction for each safely fixable issue.

Follow the mandatory review order below. Complete each pass before moving to the next.

Never invent problems.
Never rewrite unrelated valid content.
Never change the user's story, emotional direction, genre, mood or language merely because you prefer another creative direction.

==================================================
PASS 1 — LANGUAGE & GRAMMAR
==================================================

This is the FIRST and HIGHEST-PRIORITY review.

Use the REQUESTED LANGUAGE from the ORIGINAL GENERATION BRIEF as the authoritative linguistic standard.

Read EVERY sung lyric line and examine its exact wording.

Verify:
- spelling and orthography
- that words and grammatical forms actually exist in the requested language, except clearly intentional and linguistically valid coined words
- verb conjugation
- noun, adjective, pronoun and article forms
- person, number, gender, case and tense where applicable
- grammatical agreement
- syntax and sentence construction
- prepositions and grammatical word relationships
- accidental foreign-language or foreign-script contamination

Do NOT evaluate creativity, rhyme, style or production yet.

Poetic license does NOT excuse:
- misspellings
- nonexistent words
- invalid inflections
- incorrect verb forms
- genuine grammatical errors
- broken syntax

If a clear language or grammar defect exists, report it as an Actual Issue even when the intended meaning is obvious or can easily be guessed.

Complete this pass for ALL sung lyrics before continuing.

==================================================
PASS 2 — NATIVE NATURALNESS & MEANING
==================================================

Now review every sung line as a professional native songwriter of the REQUESTED LANGUAGE.

Check:
- natural native phrasing
- idiomatic usage
- semantic coherence
- natural relationships between words
- whether the actual wording communicates a coherent meaning
- unnatural translation-like or machine-generated constructions
- awkward or malformed expressions
- wording that requires the listener to mentally repair the sentence to understand the intended meaning

Judge the ACTUAL wording, not merely whether its intended meaning can be inferred.

However, song lyrics are artistic language.

Do NOT flag valid:
- metaphor
- personification
- poetic syntax or inversion
- ellipsis
- deliberate ambiguity
- unusual but natural word order
- compressed expression
- emotional exaggeration
- culturally natural songwriting conventions

An unusual line is an Actual Issue only when a skilled native songwriter would consider the wording genuinely incorrect, malformed, unnatural, confusing or materially defective.

"Could be written differently or better" is NOT an Actual Issue.

==================================================
PASS 3 — SONGWRITING & SINGABILITY
==================================================

Only after completing the language and naturalness review, evaluate the lyrics as finished song lyrics.

Check:
- cadence and rhythmic flow
- syllable flow
- natural word stress
- singability
- forced rhyme or near-rhyme that damages natural language
- meaningless filler
- excessive or ineffective repetition
- materially weak or broken hook construction
- coherent emotional progression
- perspective, character and timeline consistency
- appropriate and consistent vocal assignments

Do not manufacture issues merely to make the Quality Check appear useful.

A stylistic preference or optional improvement is not a defect.

==================================================
PASS 4 — SONG & ORIGINAL BRIEF CONSISTENCY
==================================================

Only after completing the lyric review, evaluate the rest of the song against the ORIGINAL GENERATION BRIEF.

LANGUAGE
- Sung lyrics must follow the requested language.
- Square-bracketed structural, vocal and production directions may be in English and are not language contamination.

CORE IDEA / STORY
- Preserve the requested subject, story, emotional premise, perspective and message.
- Creative expansion is allowed.
- Report only material drift or genuine contradiction.

MUSIC STYLE
- Genre/subgenre, mood, tempo, instrumentation, vocals and production direction must be meaningfully coherent with the song and original brief.
- Do not force genre stereotypes.
- Do not report harmless stylistic differences.

TITLE
- Must be meaningfully appropriate to the song's emotional core, story, imagery or hook.
- Must be natural in the requested language.
- Report only genuine material problems.

PRODUCER'S NOTE
- Must be accurate and meaningfully consistent with the lyrics, Music Style and original brief.
- It must use the requested language.
- Do not flag harmless stylistic differences.

STRUCTURE & FORMATTING
- Structural, vocal and production directions must use valid square brackets.
- Round parentheses must not be used for non-sung structural, vocal or production directions.
- Section progression must be coherent.
- Vocal tags must be appropriate and must not contradict the lyrics.
- [Male], [Female], [Both], [Duet], [Male Backing Vocals] and [Female Backing Vocals] are vocal directions, not section headers.

CONSISTENCY
- Report only genuine contradictions.
- Different dates, ages, durations, distances or time references are not automatically contradictions.
- Report a contradiction only when the statements clearly refer to the same fact and cannot reasonably both be true.

==================================================
PASS 5 — OPTIONAL SUGGESTIONS
==================================================

Only after ALL mandatory defect checks are complete may you consider:
- creativeSuggestions
- vocalSuggestions
- productionSuggestions

Suggestions are OPTIONAL.

They:
- never affect the score
- are never Actual Issues
- must never replace or hide a genuine defect
- must not be generated merely to make the Quality Check appear useful

If a genuine defect exists, report it as an Actual Issue first.

==================================================
ACTUAL ISSUES — HIGH PRECISION
==================================================

Report every CLEAR material defect discovered during the mandatory passes.

Never invent an issue.

Use this distinction:

Valid creative or poetic expression
→ leave it alone

Could be improved but is already valid
→ optional suggestion at most

Genuinely incorrect, malformed, unnatural, confusing or materially defective
→ Actual Issue

Genuine defect with a safe and materially better correction
→ Actual Issue + precise correction

The goal is COMPLETE REVIEW with HIGH PRECISION, not maximum issue count.

Place each Actual Issue in exactly ONE appropriate issue array:
- issues
- languageIssues
- grammarIssues
- singabilityIssues
- genreIssues
- consistencyIssues

Use "issues" only for genuine material defects that do not fit a more specific specialized array.

Do NOT use the generic "issues" array as a summary of specialized arrays.
Do NOT duplicate the same defect across multiple arrays merely to emphasize it.

Never excuse a genuine defect because:
- the intended meaning can be guessed
- the rest of the song is strong
- the line rhymes
- the wording may have been chosen for rhythm
- correcting it would make the review less positive

==================================================
CORRECTIONS
==================================================

For every safely fixable Actual Issue, return exactly one correction:

{
  "field": "title" | "tags" | "lyrics" | "note",
  "sectionLabel": string,
  "occurrenceIndex": number,
  "originalText": string,
  "replacementText": string,
  "reason": string
}

Rules:

- "originalText" must match the CURRENT EDITABLE SONG OUTPUT exactly, character for character.
- Never quote or modify an older version.
- Change only the defective wording.
- Preserve the intended meaning, emotion, requested language and creative direction.
- Preserve rhyme, cadence and singability when reasonably possible.
- Do not rewrite surrounding valid lyrics.
- Do not turn a correction into an optional stylistic rewrite.
- Every correction must correspond to a genuinely reported Actual Issue.

For lyrics:
- "sectionLabel" is the existing section label without brackets.
- "occurrenceIndex" is the 1-based occurrence when that section label repeats.

For title, tags or note:
- "sectionLabel" = ""
- "occurrenceIndex" = 1
- "originalText" and "replacementText" represent the complete field value.

If the exact target cannot be identified safely, report the Actual Issue but omit the correction.

If no clearly superior and safe correction exists, report the Actual Issue but omit the correction.

Before returning a correction, verify that the replacement itself is:
- grammatically correct
- semantically coherent
- natural in the requested language
- faithful to the intended meaning
- appropriate as song lyrics
- compatible with the surrounding lyrics
- free of new obvious defects

==================================================
SCORING & PASSING
==================================================

Score reflects REAL defects only, with language and lyric defects weighted most heavily.
The score is a defect-status score, not a subjective measure of artistic quality, originality, commercial potential, or personal taste.

The score field must be a number from 0 to 10 inclusive.
Never return a score above 10.
Never use a 0–100 scale.
If the song would rate above 10, still cap the score at 10.

10
No genuine material defects.
All Actual Issue arrays are empty.
"passed" must be true.
Optional suggestions may exist and do not lower the score.

8–8.9
One or more minor but material defects exist and are easily fixable.
At least one Actual Issue array must contain the relevant issue.
"passed" must be false.

7–7.9
Noticeable lyric, language or consistency defects materially harm the song.
At least one Actual Issue array must contain the relevant issue.
"passed" must be false.

5–6.9
Significant problems.
At least one Actual Issue array must contain the relevant issue.
"passed" must be false.

Below 5
Serious or multiple major problems.
At least one Actual Issue array must contain the relevant issue.
"passed" must be false.

PASS RULE:

If ALL Actual Issue arrays are empty:
- "passed" must be true
- "score" must be 10

If ANY Actual Issue array is non-empty:
- "passed" must be false
- "score" must be below 9

Do not manufacture defects merely to prevent a 10/10.
Optional suggestions never reduce the score.

==================================================
OPTIONAL SUGGESTION OBJECTS
==================================================

Each suggestion object:

{
  "title": string,
  "explanation": string,
  "actionType": "add_to_music_style" | "vocal_arrangement" | "informational",
  "value": string,
  "arrangement": object[]
}

"add_to_music_style"
- "value" is short text appended to the existing Music Style, never a replacement.
- "arrangement" = []

"vocal_arrangement"
- Use only for a specific vocal performance or arrangement change.
- "value" is a short Music Style addition.
- "arrangement" contains:
  {
    "sectionLabel": string,
    "sectionOccurrenceIndex": number,
    "tag": string
  }
- "sectionOccurrenceIndex" is the 1-based occurrence of that section label.
- Reference only sections that already exist.
- Never invent, rename or reorder sections.
- Never modify sung text.
- Never duplicate an existing vocal tag.
- Tags must use square brackets.

"informational"
- "value" = ""
- "arrangement" = []

Classify suggestions by what they actually request:
- section-specific vocal performance or arrangement → "vocal_arrangement"
- global musical or production direction → "add_to_music_style"
- non-applicable information → "informational"

==================================================
OUTPUT
==================================================

Return STRICT JSON ONLY.

No markdown.
No commentary.
No reasoning.
No additional keys.

The response must parse with JSON.parse and contain exactly:

{
  "passed": boolean,
  "score": number,
  "issues": string[],
  "languageIssues": string[],
  "grammarIssues": string[],
  "singabilityIssues": string[],
  "genreIssues": string[],
  "consistencyIssues": string[],
  "corrections": object[],
  "creativeSuggestions": object[],
  "vocalSuggestions": object[],
  "productionSuggestions": object[]
}

All required arrays must always be present.
Use empty arrays when there is nothing to report.

==================================================
FINAL INTERNAL JSON VALIDATION
==================================================

Before returning the JSON, silently verify:

1. The output contains exactly the required keys and no additional keys.
2. Every required array exists, even when empty.
3. Every Actual Issue is placed in exactly one most appropriate Actual Issue array.
4. No defect is duplicated across Actual Issue arrays.
5. Every correction corresponds to a genuinely reported Actual Issue.
6. Every correction quotes "originalText" exactly from the CURRENT EDITABLE SONG OUTPUT.
7. If ALL Actual Issue arrays are empty, "passed" is true and "score" is 10.
8. If ANY Actual Issue array is non-empty, "passed" is false and "score" is below 9.
9. Optional suggestions never appear in Actual Issue arrays and never lower the score.
10. The response is valid JSON with no markdown, prose outside the JSON, or trailing commas.
11. The "score" field must be a number from 0 to 10 inclusive. If your computed score is above 10, clamp it to 10. If it is below 0, clamp it to 0. Never return a value above 10 or use a 0–100 scale.

FINAL PRIORITY:

Language correctness comes first.
Complete PASS 1 through PASS 4 before considering PASS 5.
A genuine language or lyric defect must never be hidden by an otherwise strong song or replaced by an optional suggestion.`;

const QUALITY_DIAGNOSTIC_SYSTEM_PROMPT = `You are a strict native-language linguistic proofreader.

Your ONLY task is to perform a complete linguistic validation of EVERY sung lyric line in the text provided.

Use the REQUESTED LANGUAGE as the authoritative linguistic standard.

Check every sung line word by word for:
- spelling and orthography
- lexical validity
- nonexistent or malformed words
- incorrect word forms
- verb conjugation
- noun, adjective, pronoun and article inflection
- person, number, gender, case and tense where applicable
- grammatical agreement
- prepositions
- syntax
- genuine grammatical errors

Do NOT evaluate:
- creativity
- poetic quality
- rhyme
- cadence
- singability
- genre
- production
- originality
- commercial quality
- personal taste

Poetic license does NOT excuse:
- misspellings
- nonexistent words
- invalid inflections
- incorrect verb forms
- genuine grammatical errors
- broken syntax

Read EVERY sung lyric line.
Do not stop after finding the first error.

Judge the exact words that are written, not what the writer probably intended to write.

For every genuine linguistic defect:
- identify the exact original text
- provide the corrected text
- provide a short explanation

Do not invent problems.
Do not suggest stylistic rewrites.
Do not report wording that is unusual but grammatically and linguistically valid.

Map genuine linguistic defects into the existing Quality Check schema.
Return STRICT JSON ONLY matching the provided schema.

IMPORTANT:
- Do not add examples.
- Do not hard-code Greek words or known benchmark errors.`;

function buildQualityPrompt(d: z.infer<typeof generateInput>, r: z.infer<typeof generationOutput>) {
  return `Evaluate the CURRENT editable song below against the ORIGINAL generation brief. The output shown is exactly what the user sees right now, including manual edits and previously applied corrections — analyse this text only, never an earlier version.

Begin by reading the LYRICS line by line as a professional native songwriter and lyric editor. Identify every material lyric defect first. Judge each line by its exact wording as a native songwriter would, not by whether the listener can infer the intended meaning from context; a lyric defect remains a defect even when its meaning is guessable. Only after the lyrics review is complete should you consider Title, Music Style, Producer's Note and optional creative/vocal/production suggestions. A song MUST NOT receive "passed": true AND "score": 10 while any clear material lyric defect remains.

ORIGINAL GENERATION CONTEXT — AUTHORITATIVE
Core Idea: ${d.theme}
Requested Genre(s): ${d.genre}
Requested Mood: ${d.mood}
Requested Language: ${d.language}
Requested Song Structure: ${d.structure}
Requested Production Style: ${d.production}
Additional Instructions: ${d.instructions}

The original brief never changes because the user edited the output. Always judge the current output against this brief.

CURRENT EDITABLE OUTPUT — AUTHORITATIVE

Title:
${r.title}

Music Style:
${r.tags}

Lyrics:
${r.lyrics}

Producer's Note:
${r.note}

Report ONLY clear, material and defensible lyric defects and other genuine defects. For every fixable issue return a precise correction quoting the CURRENT text above exactly. Ignore subjective preferences and stylistic alternatives. If there are no genuine material defects, return "passed": true, "score": 10 and an empty "corrections" array. Add any genuinely worthwhile creativeSuggestions, vocalSuggestions and productionSuggestions as optional, non-scoring items.

Return the strict JSON object only.`;
}

function buildQualityDiagnosticPrompt(
  d: z.infer<typeof generateInput>,
  r: z.infer<typeof generationOutput>,
) {
  return `Requested Language: ${d.language}

CURRENT EDITABLE LYRICS:
${r.lyrics}`;
}

/**
 * Defensive normalization for provider responses that emit an out-of-range score.
 * Keeps strict schema validation after normalization and logs the adjustment.
 */
function normalizeQualityScore(raw: unknown): unknown {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj["score"] === "number") {
      const original = obj["score"] as number;
      let normalized = original;
      if (original > 10) normalized = 10;
      if (original < 0) normalized = 0;
      if (normalized !== original) {
        console.warn("[ai] quality_check score_normalized", {
          originalScore: original,
          normalizedScore: normalized,
        });
        return { ...obj, score: normalized };
      }
    }
  }
  return raw;
}

async function runQualityCheck(
  call: ModelCaller,
  schema: Record<string, unknown>,
  d: z.infer<typeof generateInput>,
  r: z.infer<typeof generationOutput>,
  sink?: { operation: AiOperation; records: PendingUsage[]; provider: string; model: string },
): Promise<QualityReport | null> {
  try {
    const res = await call({
      system: QUALITY_DIAGNOSTIC_SYSTEM_PROMPT,
      prompt: buildQualityDiagnosticPrompt(d, r),
      maxTokens: 8192,
      schema,
    });
    const { text, stopReason } = res;
    const operation = sink?.operation ?? "quality_check";
    const model = res.model || sink?.model || "unknown";
    const provider = res.provider || sink?.provider || "unknown";
    const ok = stopReason === "end_turn";
    if (sink) {
      sink.records.push({
        operation: sink.operation,
        provider: res.provider,
        model: res.model,
        usage: res.usage,
        success: ok,
      });
    }
    if (!ok) {
      console.warn("[ai] quality_check non_success_stop_reason", {
        operation,
        model,
        provider,
        stopReason: stopReason ?? "unknown",
      });
      return null;
    }
    const cleaned = text
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) {
      console.warn("[ai] quality_check missing_json", {
        operation,
        model,
        provider,
        failureReason: "missing_json",
        responseTextLength: text.length,
      });
      return null;
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleaned.slice(start, end + 1));
    } catch (err) {
      console.warn("[ai] quality_check json_parse_error", {
        operation,
        model,
        provider,
        failureReason: "json_parse_error",
        responseTextLength: text.length,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
    const parsed = qualityOutput.safeParse(parsedJson);
    if (!parsed.success) {
      console.warn("[ai] quality_check schema_validation_error", {
        operation,
        model,
        provider,
        failureReason: "schema_validation_error",
        validationIssues: parsed.error.issues.slice(0, 8).map((issue) => ({
          path: issue.path.join(".") || "<root>",
          code: issue.code,
          message: issue.message,
          ...(issue.code === "invalid_type"
            ? {
                expected:
                  "expected" in issue && typeof issue.expected === "string" ? issue.expected : undefined,
                received:
                  "received" in issue && typeof issue.received === "string" ? issue.received : undefined,
              }
            : {}),
        })),
      });
      return null;
    }
    return canonicalizeQualityReport(parsed.data);
  } catch (err) {
    // Observability only: the provider error was previously discarded, which made
    // "Quality check unavailable" impossible to diagnose from the server logs.
    console.error(
      `[ai] ${sink?.operation ?? "quality_check"} failed model=${sink?.model ?? "unknown"}`,
      err instanceof Error ? err.message : err,
    );

    if (sink) {
      sink.records.push({
        operation: sink.operation,
        provider: sink.provider,
        model: sink.model,
        usage: null,
        success: false,
      });
    }
    return null;
  }
}

export const generateSongPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => generateInput.parse(input))
  .handler(async () => {
    // All provider execution now belongs to the durable generation-job flow.
    // Keep this export as a compatibility guard so an old client cannot create
    // a second, admission-free generation architecture.
    throw new Error(
      "Direct generation is no longer available. Please use the generation job flow.",
    );
  });

/** Validated shape of a durable generation job's stored input payload. */
export const generateJobInput = generateInput;

/**
 * Runs exactly one song generation against the active provider and returns the
 * validated result. Credit accounting is NOT done here: the durable job flow
 * consumes the creation atomically when the job is created, so this helper is
 * called at most once per job and never re-charges the user.
 *
 * Prompts, model selection, output schema and analytics are unchanged.
 */
export async function runSongGeneration(
  data: z.infer<typeof generateInput>,
  userId: string,
  generationId: string | null,
): Promise<{ result: z.infer<typeof generationOutput>; provider: string; model: string }> {
  const { call, model, provider, schemas } = await activeCaller(
    data.generationModel ?? undefined,
    userId,
  );
  const records: PendingUsage[] = [];

  let generated: ModelResult;
  try {
    generated = await call({
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(data),
      maxTokens: 8192,
      schema: schemas.song,
    });
  } catch (err) {
    await flushUsage(userId, generationId, [
      { operation: "generate", provider, model, usage: null, success: false },
    ]);
    throw err;
  }

  const { text: raw, stopReason } = generated;
  const generateOk = stopReason === "end_turn";
  records.push({
    operation: "generate",
    provider: generated.provider,
    model: generated.model,
    usage: generated.usage,
    success: generateOk,
  });

  if (!generateOk) {
    await flushUsage(userId, generationId, records);
    if (stopReason === "max_tokens") {
      throw new Error("The AI response was incomplete. Please try again.");
    }
    throw new Error(
      `The AI generation did not complete (${stopReason ?? "unknown"}). Please try again.`,
    );
  }

  const result = generationOutput.safeParse(parseSections(raw));
  if (!result.success) {
    await flushUsage(userId, generationId, records);
    throw new Error("The AI returned an incomplete or invalid response. Please try again.");
  }

  await flushUsage(userId, generationId, records);
  console.log(`[ai] generation served by model=${generated.model}`);
  return { result: result.data, provider: generated.provider, model: generated.model };
}

/** Completes a QC claim after a validated provider response and returns its id. */
async function consumeCreation(
  supabase: Supa,
  idempotencyKey: string,
  quality: QualityReport,
  provider: string,
  model: string,
) {
  const { data: inserted, error } = await supabase.rpc("consume_quality_check", {
    _idempotency_key: idempotencyKey,
    _quality_report: quality as unknown as Json,
    _provider: provider,
    _model: model,
  });
  if (error) throw new Error("The action could not be recorded. Please try again.");
  const parsed = z.string().uuid().safeParse(inserted);
  if (!parsed.success) throw new Error("The action could not be recorded. Please try again.");
  return parsed.data;
}

const qualityCheckInput = z.object({
  theme: generateInput.shape.theme,
  genre: generateInput.shape.genre,
  mood: generateInput.shape.mood,
  language: generateInput.shape.language,
  structure: generateInput.shape.structure,
  production: generateInput.shape.production,
  instructions: generateInput.shape.instructions,
  result: generationOutput,
  idempotencyKey: z.string().uuid(),
  qualityCheckModel: z.enum(AI_MODEL_IDS as [string, ...string[]]).nullish(),
  /** Optional: links the check to the originating generation for analytics. */
  generationId: z.string().uuid().nullish(),
});

const qualityCheckClaim = z.object({
  status: z.enum(["claimed", "processing", "completed", "failed", "rate_limited"]),
  qualityReport: qualityOutput.nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
});

export const getCurrentUserAiModelAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getEffectiveModelAccess } = await import("@/lib/ai-provider.server");
    return getEffectiveModelAccess(context.userId);
  });

/**
 * User-triggered Quality Check. Runs exactly one evaluator call through the
 * EXISTING Quality Layer 2A and consumes exactly one creation.
 */
export const checkSongQuality = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => qualityCheckInput.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { call, model, provider, schemas } = await activeCaller(
      data.qualityCheckModel ?? undefined,
      context.userId,
    );
    const records: PendingUsage[] = [];
    const constraints = {
      theme: data.theme,
      genre: data.genre,
      mood: data.mood,
      language: data.language,
      structure: data.structure,
      production: data.production,
      instructions: data.instructions,
    };

    const { data: rawClaim, error: claimError } = await supabase.rpc("claim_quality_check", {
      _idempotency_key: data.idempotencyKey,
    });
    if (claimError) throw new Error("The quality check could not be started. Please try again.");
    const claim = qualityCheckClaim.safeParse(rawClaim);
    if (!claim.success)
      throw new Error("The quality check could not be started. Please try again.");

    if (claim.data.status === "rate_limited") {
      const after = await usageFor(supabase, context.userId);
      return { error: "rate_limited" as const, quality: null, model: null, usage: after };
    }
    if (claim.data.status === "processing") {
      const after = await usageFor(supabase, context.userId);
      return { error: "in_progress" as const, quality: null, model: null, usage: after };
    }
    if (claim.data.status === "failed") {
      const after = await usageFor(supabase, context.userId);
      return { error: "unavailable" as const, quality: null, model: null, usage: after };
    }
    if (claim.data.status === "completed") {
      if (!claim.data.qualityReport)
        throw new Error("The completed quality check was invalid. Please try again.");
      const after = await usageFor(supabase, context.userId);
      return {
        error: null,
        quality: claim.data.qualityReport,
        model: claim.data.model ?? null,
        provider: claim.data.provider ?? null,
        usage: after,
      };
    }

    const { error: startedError } = await supabase.rpc("mark_quality_check_provider_started", {
      _idempotency_key: data.idempotencyKey,
    });
    if (startedError) {
      // Do not release by idempotency key here: a stale caller could race a
      // later claimant and release that claimant's in-progress action.
      throw new Error("The quality check could not be started. Please try again.");
    }

    let quality: QualityReport | null;
    try {
      quality = await runQualityCheck(call, schemas.quality, constraints, data.result, {
        operation: "quality_check",
        records,
        provider,
        model,
      });
    } catch (err) {
      await supabase.rpc("release_quality_check", {
        _idempotency_key: data.idempotencyKey,
      });
      throw err;
    }

    // A creation is charged only after the provider response has completed and
    // parsed successfully through the existing QualityReport schema. Failed,
    // incomplete, malformed, or schema-invalid responses remain uncharged.
    if (!quality) {
      await supabase.rpc("release_quality_check", {
        _idempotency_key: data.idempotencyKey,
      });
      await flushUsage(context.userId, data.generationId ?? null, records);
      const after = await usageFor(supabase, context.userId);
      return { error: "unavailable" as const, quality: null, model: null, usage: after };
    }

    let consumedId: string;
    try {
      consumedId = await consumeCreation(supabase, data.idempotencyKey, quality, provider, model);
    } catch {
      // Do not release a post-provider claim: releasing it would allow a retry
      // to invoke the paid provider a second time. The idempotency row remains
      // processing so an internal retry can finish the commit safely.
      throw new Error("The quality check could not be recorded. Please try again.");
    }
    await flushUsage(context.userId, data.generationId ?? consumedId, records);
    const after = await usageFor(supabase, context.userId);
    return { error: null, quality, model, provider, usage: after };
  });

export const savePromptToLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => savedInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("saved_prompts")
      .insert({ ...data, user_id: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSavedPrompts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("saved_prompts")
      .select("id, title, theme, genre, mood, language, tags, lyrics, note, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { prompts: data ?? [] };
  });

export const deleteSavedPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("saved_prompts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Super Admin: server-authoritative provider/model selection.
// The selected model is stored in a table the browser cannot read or write;
// only these admin-gated server functions touch it.
// ─────────────────────────────────────────────────────────────────────────────

export const getAiModelSetting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    if (!(await isAdminUser(supabase, context.userId))) throw new Error("Not allowed");
    const { getActiveModel } = await import("@/lib/ai-provider.server");
    return { model: await getActiveModel() };
  });

export const setAiModelSetting = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ model: z.enum(AI_MODEL_IDS as [string, ...string[]]) }).parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    if (!(await isAdminUser(supabase, context.userId))) throw new Error("Not allowed");
    const { setActiveModel } = await import("@/lib/ai-provider.server");
    return setActiveModel(data.model as never, context.userId);
  });
