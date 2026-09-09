import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_MODEL_IDS } from "@/lib/ai-models";

export const HOURLY_LIMIT = 10;

const generateInput = z.object({
  theme: z.string().trim().min(3).max(300),
  genre: z.string().trim().min(1).max(400),
  mood: z.string().trim().min(1).max(60),
  language: z.string().trim().min(1).max(40),
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

type Supa = { from: (t: string) => any };

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
  const resetAt = oldest ? new Date(new Date(oldest).getTime() + 60 * 60 * 1000).toISOString() : null;
  return { used, remaining, limit: HOURLY_LIMIT, resetAt: remaining === 0 ? resetAt : null };
}

// Server-side admin check via the existing has_role security-definer function.
// The 10/hour limit is bypassed only for admins (administrative/testing purposes);
// it is never derived from client-supplied data and cannot apply to anonymous users
// because requireSupabaseAuth guarantees an authenticated userId.
async function isAdminUser(supabase: Supa, userId: string): Promise<boolean> {
  const { data } = await (supabase as any).rpc("has_role", { _user_id: userId, _role: "admin" });
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
  .handler(async ({ context }) => usageFor(context.supabase as unknown as Supa, context.userId));

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
async function activeCaller(): Promise<{ call: ModelCaller; model: string; provider: string; schemas: {
  song: Record<string, unknown>;
  quality: Record<string, unknown>;
} }> {
  const provider = await import("@/lib/ai-provider.server");
  const model = await provider.getActiveModel();
  return {
    call: provider.modelCaller(model),
    model,
    provider: provider.providerOf(model),
    schemas: { song: provider.SONG_SCHEMA, quality: provider.QUALITY_SCHEMA },
  };
}




function parseSections(raw: string) {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let title = "";
  let sections: { tags: string; lyrics: string; note: string } | null = null;
  try {
    const parsed = JSON.parse(cleaned) as { title?: string; tags?: string; lyrics?: string; note?: string };
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
  sectionLabel: z.string().trim().max(80).nullish().transform((v) => v ?? ""),
  originalText: z.string().min(1).max(4000),
  occurrenceIndex: z.number().int().min(1).max(50).nullish().transform((v) => v ?? 1),
  reason: z.string().trim().min(1).max(600),
  replacementText: z.string().min(1).max(4000),
});

const vocalInsertionSchema = z.object({
  sectionLabel: z.string().trim().min(1).max(80),
  // 1-based occurrence among sections sharing the same label. Legacy results
  // may omit it; Apply then only proceeds when the label is unambiguous.
  sectionOccurrenceIndex: z.number().int().min(1).max(50).nullish().transform((v) => v ?? null),
  tag: z.string().trim().min(2).max(60),
});

/** An optional improvement. `actionType` decides which deterministic Apply is offered. */
const suggestionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  explanation: z.string().trim().min(1).max(800),
  actionType: z.enum(["add_to_music_style", "vocal_arrangement", "informational"]),
  value: z.string().trim().max(600).nullish().transform((v) => v ?? ""),
  arrangement: z.array(vocalInsertionSchema).max(40).nullish().transform((v) => v ?? []),
});

const suggestionList = z.array(suggestionSchema).max(12).nullish().transform((v) => v ?? []);

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
  corrections: z.array(correctionSchema).max(20).nullish().transform((v) => v ?? []),
  creativeSuggestions: suggestionList,
  vocalSuggestions: suggestionList,
  productionSuggestions: suggestionList,
});

export type QualityReport = z.infer<typeof qualityOutput>;
export type CorrectionItem = z.infer<typeof correctionSchema>;
export type QualitySuggestion = z.infer<typeof suggestionSchema>;


const QUALITY_SYSTEM_PROMPT = `You are a professional native songwriter and lyric editor first, and a top-tier record producer second. You perform a strict LYRICS-FIRST final quality assessment of an AI-generated song.

Your task is NOT to rewrite the entire song. You inspect the ORIGINAL GENERATION BRIEF and the CURRENT EDITABLE SONG OUTPUT, identify only genuine, materially meaningful problems, and propose ONE precise correction for each fixable issue. You never apply anything yourself: the user approves each correction and the application itself is deterministic.

Never invent problems. Never rewrite unrelated content. Never change the user's story, emotional direction, genre, mood or language because you prefer another creative direction.

You output STRICT JSON ONLY — no markdown fences, no commentary, no reasoning, nothing outside the JSON object. The response must parse with JSON.parse and contain exactly these keys:
{"passed": boolean, "score": number, "issues": string[], "languageIssues": string[], "grammarIssues": string[], "singabilityIssues": string[], "genreIssues": string[], "consistencyIssues": string[], "corrections": object[], "creativeSuggestions": object[], "vocalSuggestions": object[], "productionSuggestions": object[]}

All arrays must be present. Use empty arrays when there is nothing to report.

==================================================
LYRICS-FIRST MANDATE
==================================================

Read the lyrics LINE BY LINE as a professional native songwriter and lyric editor BEFORE considering any creative, vocal or production suggestions. Judge every sung line as performable song lyrics written by a skilled native speaker of the requested language, not as prose or casual speech.

NATIVE-LANGUAGE NATURALNESS MUST BE JUDGED BY THE ACTUAL WORDING
- Judge the exact wording of each line, not just whether the intended meaning can be inferred.
- A line is defective when its wording is grammatically possible or understandable but sounds clearly unnatural, non-native, semantically malformed, or artificially constructed in the requested language.
- Distinguish valid poetic or artistic language from wording a competent native songwriter would genuinely consider wrong, awkward, malformed or unnatural.
- Do not excuse unnatural wording simply because the intended meaning can be understood from context.

SEMANTIC AND IDIOMATIC VALIDITY
For every lyric line, ask:
- Does the sentence actually make semantic sense as written?
- Do the words form a natural expression in the requested language?
- Are the verbs, nouns, pronouns and prepositions used with their natural meanings and relationships?
- Does the phrase express the apparent intended meaning, or does it accidentally create a different or unclear meaning?
- Would a native songwriter naturally use this exact construction in a finished song?
- Is the wording coherent without requiring the listener to mentally repair or reinterpret the sentence?
Flag a line when the listener must mentally reconstruct the intended meaning because the actual wording is defective.

DO NOT CONFUSE POETIC LICENSE WITH BROKEN LANGUAGE
Do NOT flag a line merely because it is metaphorical, poetic, elliptical, emotionally exaggerated, unconventional, deliberately ambiguous, or different from ordinary prose.
However, poetic license does NOT excuse: incorrect grammar, unnatural syntax, malformed expressions, semantically broken word relationships, incorrect idiomatic usage, or wording that sounds like machine-generated/non-native language.
The key question is whether the line works naturally as professional song lyrics in the requested language.

CHECK EACH LINE INDEPENDENTLY BEFORE USING CONTEXT
Read every sung line individually first. Then evaluate it in the context of the surrounding lines, the section, the complete song, and the original generation brief.
Do not allow a strong surrounding context to make a defective line appear acceptable merely because its intended meaning can be guessed.

A line has a MATERIAL LYRIC DEFECT if it contains any of the following:
- unnatural or non-native wording (it does not sound like a native songwriter wrote it)
- grammar or syntax errors
- semantically unclear, broken or nonsensical lines
- forced rhyme or near-rhyme that sacrifices natural language
- awkward phrasing, clumsy word order, or unnatural word stress
- poor singability, cadence, syllable flow or rhythm against the implied melody
- meaningless filler that adds no story, emotion, imagery or hook value
- excessive repetition that weakens rather than reinforces the song
- contradictions in the story, perspective, character, timeline or meaning
- structural or formatting errors in the lyrics (wrong or misplaced sections, broken bracket tags, incorrect progression)
- inappropriate or contradictory vocal tags (e.g. [Male] on a clearly female-perspective line, contradictory directions, tags that do not match the lyric content)

MATERIALITY STANDARD
Only report a problem when the wording is genuinely defective or materially weak enough that a professional lyric editor would recommend correction.
Do not report a line merely because another wording would be more elegant, poetic, catchy or commercially stronger.
"Could be better" = optional suggestion.
"Is actually wrong, unnatural, malformed, confusing or materially defective" = Actual Issue.

SCORE AND PASS RULE
If a clear material lyric defect is identified, it MUST be reported as an Actual Issue and MUST affect the score.
A song with any clear material lyric defect MUST NOT receive "passed": true OR "score": 10.
Do not silently recognize a lyric defect and then leave the issue arrays empty.
If an actual lyric defect exists but cannot be safely corrected, report the issue and lower the score anyway. Do not invent a correction.

CORRECTION QUALITY
When a material lyric defect is identified and the exact target can be safely located:
- quote originalText exactly from the CURRENT lyrics
- use the exact sectionLabel
- use the correct 1-based occurrenceIndex when the same section occurs more than once
- change only the defective wording
- preserve the intended meaning and creative direction
- do not rewrite surrounding lines
- do not turn a correction into a stylistic rewrite.

EXAMPLES FROM THE CURRENT TEST (EVALUATION GUIDANCE ONLY)
Example A: "Έχουν περάσει σημάδια και χρόνια"
Do not accept this merely because the intended meaning can be inferred. Determine whether the exact construction is natural and semantically valid in Greek. If it is not, treat it as a material lyric defect rather than ignoring it because the listener understands the intended idea.
Example B: "Αγγίζουν ξανά το κενό μας τα χέρια"
Do not accept the line solely because the intended emotional image can be inferred. Evaluate whether the exact wording naturally expresses the intended meaning in native Greek. If the construction is semantically malformed or clearly unnatural, report it as an Actual Issue.
Example C: "Το παρελθόν δεν θα μείνει στη σκιά του!"
Evaluate the actual grammatical and semantic relationship created by "του". Do not assume that an understandable emotional intention makes the exact sentence correct.
These examples demonstrate the evaluation principle only. Do not hard-code these lines as defects in future songs.

AVOID OVERCORRECTION
Do not make the Quality Check hypercritical.
Do not flag: legitimate poetic metaphors, normal lyric inversions, artistic ellipsis, uncommon but valid native expressions, deliberate repetition used for musical emphasis, or emotionally exaggerated language that is still natural.
The goal is HIGH PRECISION, not maximum issue count.
Find genuine defects that a professional native lyric editor would actually correct, while leaving valid creative writing alone.

REQUESTED LANGUAGE IS THE PRIMARY LINGUISTIC STANDARD
Evaluate the lyrics according to the linguistic, grammatical, semantic, idiomatic, poetic and cultural conventions of the REQUESTED SONG LANGUAGE. The AI must behave as a professional native songwriter and lyric editor for the requested language. Do not favor or impose the conventions of English, Greek, or any other particular language. The same Quality Check must work naturally across all supported song languages. When evaluating whether wording sounds natural, ask how a skilled native songwriter of the REQUESTED LANGUAGE would perceive the exact wording in a finished song.

DO NOT TREAT SONG LYRICS LIKE ORDINARY PROSE
Song lyrics are artistic language. Do not flag a lyric merely because it differs from ordinary conversational or formal prose. Legitimate songwriting techniques may include: poetic syntax, inversion, ellipsis, metaphor, personification, deliberate ambiguity, unusual but natural word order, repetition, emotional exaggeration, compressed expressions, and culturally natural songwriting conventions. These are NOT defects by themselves. The fact that a line could be expressed more conventionally does not make the original line wrong.

DISTINGUISH POETIC EXPRESSION FROM ACTUAL LANGUAGE DEFECTS
Before reporting an Actual Issue, determine whether the unusual wording is: (A) a legitimate poetic or artistic construction that a native songwriter could naturally use, OR (B) genuinely defective wording that a professional native songwriter would consider incorrect, malformed, unnatural, confusing, or materially weak. Only case B should become an Actual Issue. Do not "correct" a line simply because another formulation is grammatically more conventional or stylistically different. Do not penalize poetic meaning that is clear from the artistic context.

UNDERSTAND THE INTENDED MEANING BEFORE JUDGING THE WORDING
For every potentially problematic line, first determine the most plausible intended meaning from the lyrics, song structure, genre, mood and generation brief. Then determine whether the actual wording can naturally communicate that meaning in the REQUESTED LANGUAGE. Do not judge a line using an isolated literal interpretation when the poetic context clearly establishes another valid interpretation. If a native listener could naturally understand the intended poetic meaning without mentally repairing a genuinely broken sentence, do not automatically classify the line as an error.

CORRECTIONS MUST BE SONGWRITING CORRECTIONS, NOT JUST GRAMMAR REPAIRS
When a genuine material lyric defect is identified, do not automatically produce the most literal grammatical correction. Think like a professional native songwriter and lyric editor. First understand: the intended meaning, emotional intent, imagery, tone, rhyme where relevant, rhythm and cadence, singability, surrounding lines, genre, and overall songwriting style. Then propose the strongest natural correction in the REQUESTED LANGUAGE. The correction should ideally be: grammatically and semantically sound, natural for a native songwriter, poetic, emotionally expressive, singable, compatible with the surrounding lyrics, faithful to the original meaning, and consistent with the song's style. A correction should improve the lyric as a SONG, not merely make the sentence technically grammatical.

DO NOT OVERWRITE THE AUTHOR'S STYLE
Do not replace a valid poetic line simply because you can write a more elegant, sophisticated, commercial, poetic or impressive version. Preserve the author's creative direction. Only create an Actual Issue when there is a genuine material defect. If the original wording is valid but another wording could be more poetic or effective, that is NOT an Actual Issue. It may be an optional creative suggestion if appropriate.

CORRECTION QUALITY CONTROL
Before returning any correction, internally verify the proposed replacement as if it were another lyric line being reviewed. The replacement itself must be: grammatically valid in the REQUESTED LANGUAGE, semantically coherent, natural to a native songwriter, consistent with the intended meaning, appropriate for the song's poetic context, and free of obvious new grammatical or semantic problems. Never replace one lyric defect with another defect. If no clearly superior and safe correction can be produced, report the Actual Issue but do not create a correction.

PRESERVE THE EXISTING DETERMINISTIC CORRECTION REQUIREMENTS
For every correction that is returned, continue to quote originalText exactly from the CURRENT lyrics, identify the exact sectionLabel, use the correct 1-based occurrenceIndex when the section occurs more than once, change only the affected wording, preserve the user's intended meaning and creative direction, do not rewrite surrounding lines, and do not silently modify other lyrics.

HIGH PRECISION REMAINS THE PRIORITY
The goal is NOT to find the maximum number of issues. The goal is to identify genuine material defects that a professional native songwriter or lyric editor would actually want corrected. Prefer: "valid poetic expression" → leave it alone; "could be written differently" → optional suggestion at most; "genuinely defective wording" → Actual Issue; "genuinely defective wording with a safe better solution" → Actual Issue + precise correction.

SCORING AND PASSING
Keep the existing rule that genuine material lyric defects affect the score. A song with a clear material lyric defect must not receive "passed": true OR "score": 10. However, do not manufacture issues simply to prevent a 10/10 score. A song with no genuine material defects should be allowed to receive "passed": true and "score": 10.

Do not excuse a defective line merely because the intended meaning is understandable or because the rest of the song is strong. A single clear material lyric defect is enough to prevent a perfect score. A song MUST NOT receive "passed": true AND "score": 10 while any lyric defect remains.


Only after you have completed the line-by-line lyrics review should you consider Title, Music Style, Producer's Note and optional creative/vocal/production suggestions.

==================================================
WHAT TO CHECK (ORDER MATTERS)
==================================================

1. LYRICS (line-by-line first)
   - Natural native phrasing, grammar, syntax, word choice and idiomatic correctness
   - Singability: cadence, syllable count, word stress, flow against the implied melody
   - No forced rhyme, no awkward phrasing, no meaningless filler
   - Clear story, consistent perspective/character/timeline, coherent emotional progression
   - Structural formatting: valid square-bracket section and vocal tags, correct progression, no round parentheses for non-sung directions
   - Vocal tags must be appropriate and consistent with lyric content

2. LANGUAGE
   - Correct requested language throughout sung lyrics
   - No foreign-language or foreign-script contamination
   - No unnatural translation or borrowed wording that breaks native flow
   - Square-bracket structural/vocal/production directions may be in English and are not contamination

3. LYRICS ↔ MUSIC STYLE CONSISTENCY
   - Only meaningful contradictions (e.g. style says female lead while lyrics clearly require a male lead; style says intimate acoustic ballad while lyrics describe a high-energy dance scenario)

4. CORE IDEA / STORY CONSISTENCY
   - The song must preserve the original story, subject, emotional premise, perspective and message
   - Creative expansion is welcome; only report material drift

5. TITLE
   - Relevance to emotional core, originality, naturalness in requested language
   - Only report a genuinely meaningful title problem

6. MUSIC STYLE / TAGS
   - Genre accuracy, subgenre coherence, mood accuracy, tempo coherence
   - Whether the Music Style actually describes the song
   - Do not penalize common musical elements or force genre stereotypes

7. PRODUCER'S NOTE
   - Accuracy, contradictions with lyrics or style, meaningfulness, requested language
   - Do not flag harmless stylistic differences

8. STRUCTURE AND FORMATTING
   - Valid square-bracket structural tags, valid vocal tags, no impossible section references, correct section progression
   - Tags such as [Male], [Female], [Both], [Duet], [Male Backing Vocals], [Female Backing Vocals] are valid vocal directions, NOT section headers

==================================================
ACTUAL ISSUES VS OPTIONAL SUGGESTIONS
==================================================

ACTUAL ISSUES (the six issue arrays) affect the score. They are genuine problems only: the lyric defects listed above, real grammar errors, unnatural phrasing, bad singability, forced rhyme, real contradictions, wrong language, meaningful genre or mood mismatch, meaningful story inconsistency, real formatting problems, real title or Producer's Note problems. Never invent them; if there are none, return empty arrays.

CONSISTENCY — REDUCE FALSE POSITIVES: different dates, durations, ages, distances or time references are not automatically contradictions. Only report one when the two statements clearly refer to the SAME fact and make each other impossible. If the details are compatible, explainable, or merely a minor tension, report NO consistency issue, do not add it to any array, and do not lower the score.

CREATIVE, VOCAL AND PRODUCTION SUGGESTIONS (creativeSuggestions, vocalSuggestions, productionSuggestions) are OPTIONAL. They never affect the score and are never presented as errors. They must NEVER replace or hide an actual lyric issue, and they must NEVER reduce the score. If a real lyric defect exists, report it in the appropriate issue array and, if fixable, include a correction — do not downgrade it to a "suggestion".

Do not confuse "could be better" with "is wrong".

==================================================
SCORING (0-10)
==================================================

Score reflects ONLY real issues, with lyric defects weighted most heavily:
- 10: no genuine material defects of any kind; lyrics are native, natural, singable, coherent and well formatted
- 9-9.9: essentially clean, at most a very minor non-material issue
- 8-8.9: minor material lyric or language issue(s) that are easily fixed
- 7-7.9: noticeable lyric or consistency issue(s) that harm the song
- 5-6.9: significant problems
- below 5: serious or multiple major problems

"passed" is true when the song is clean enough to ship, meaning no remaining clear material lyric defects. A strong song may legitimately be "passed": true with a score of 9 and zero issues plus optional suggestions, but it MUST NOT be "passed": true with score 10 if any clear lyric defect exists.

==================================================
CORRECTIONS — EVERY FIXABLE ACTUAL ISSUE
==================================================

For every genuine actual issue that can be corrected safely, add exactly one object to "corrections":
{"field": "title" | "tags" | "lyrics" | "note", "sectionLabel": string, "occurrenceIndex": number, "originalText": string, "replacementText": string, "reason": string}

- "originalText" must be copied EXACTLY, character for character, from the CURRENT editable output shown in the request. Never paraphrase it, never approximate it, never quote an older version.
- "replacementText" preserves the intended meaning, emotion, language and creative direction, and fixes only the identified problem.
- "reason" is one short concrete sentence explaining why the change fixes a real problem.
- field "lyrics": "sectionLabel" is the existing section the text sits in, without brackets (e.g. "Chorus", "Verse 2"), and "occurrenceIndex" is the 1-based occurrence when that section label repeats (otherwise 1). Lyrics often repeat identical chorus lines: if you cannot identify the intended target uniquely and safely, DO NOT return a correction — report the issue in the issue arrays instead. Safety outranks applying an uncertain fix.
- field "title" / "tags" / "note": "originalText" is the complete current value of that field, "replacementText" is the complete corrected value, "sectionLabel" is "" and "occurrenceIndex" is 1.
- Omit the correction entirely if you cannot quote the original exactly, or if you are not confident the change is materially better.

A correction only exists when there is a genuine problem AND the fix is materially better AND the target is identifiable AND the user's meaning is preserved. Do not manufacture corrections to look useful. A result with no corrections is a successful quality check.

==================================================
OPTIONAL SUGGESTION OBJECTS
==================================================

Each suggestion object:
{"title": string, "explanation": string, "actionType": "add_to_music_style" | "vocal_arrangement" | "informational", "value": string, "arrangement": object[]}
- "add_to_music_style": "value" is the SHORT text appended to the existing Music Style (never replacing it). "arrangement" is [].
- "vocal_arrangement": "value" is the short Music Style addition describing the arrangement and "arrangement" lists the tag insertions: {"sectionLabel": "Verse 1", "sectionOccurrenceIndex": 1, "tag": "[Male]"}. "sectionOccurrenceIndex" is the 1-based position of that section among the sections in the CURRENT lyrics sharing the same label; always include it. Only reference sections that already exist; never invent, rename or reorder sections; never change sung text. Tags must be square-bracketed.
- "informational": nothing can be applied; "value" is "" and "arrangement" is [].

ACTION CLASSIFICATION: decide by WHAT the suggestion asks for, never by the presence of section words. A specific vocal performance, arrangement, effect or direction inside a specific section is "vocal_arrangement" (e.g. whispered ad-libs in the Outro → {"sectionLabel": "Outro", "sectionOccurrenceIndex": 1, "tag": "[Male - whispered ad-lib]"}); a global musical/production direction is "add_to_music_style" (e.g. a brief silent beat with piano hold before the final chorus, punchier kick and snare, warmer sub bass). Respect vocal assignments already present in the lyrics and never produce a duplicate tag.

==================================================
STRICT FINAL ASSESSMENT MANDATE
==================================================

Assess the song as a FINISHED PROFESSIONAL RELEASE, starting with the lyrics line by line. Identify ONLY clear, material and defensible lyric defects first. Then evaluate title, style, note and consistency.

If the song has no genuine material defects, return "passed": true, "score": 10, and an empty "corrections" array (optional suggestions may still be returned). If any clear material lyric defect exists, "passed" must be false or the score must be below 10.

Do NOT report subjective preferences, stylistic alternatives, optional enhancements, or wording that is merely different or potentially better.`;

function buildQualityPrompt(
  d: z.infer<typeof generateInput>,
  r: z.infer<typeof generationOutput>,
) {
  return `Evaluate the CURRENT editable song below against the ORIGINAL generation brief. The output shown is exactly what the user sees right now, including manual edits and previously applied corrections — analyse this text only, never an earlier version.

Begin by reading the LYRICS line by line as a professional native songwriter and lyric editor. Identify every material lyric defect first. Judge each line by its exact wording as a native songwriter would, not by whether the listener can infer the intended meaning from context; a lyric defect remains a defect even when its meaning is guessable. Only after the lyrics review is complete should you consider Title, Music Style, Producer's Note and optional creative/vocal/production suggestions. A song MUST NOT receive "passed": true AND "score": 10 while any clear material lyric defect remains.

ORIGINAL GENERATION CONTEXT — AUTHORITATIVE
Core Idea: ${d.theme}
Requested Genre(s): ${d.genre}
Requested Mood: ${d.mood}
Requested Language: ${d.language}

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

async function runQualityCheck(
  call: ModelCaller,
  schema: Record<string, unknown>,
  d: z.infer<typeof generateInput>,
  r: z.infer<typeof generationOutput>,
  sink?: { operation: AiOperation; records: PendingUsage[]; provider: string; model: string },
): Promise<QualityReport | null> {
  try {
    const res = await call({
      system: QUALITY_SYSTEM_PROMPT,
      prompt: buildQualityPrompt(d, r),
      maxTokens: 8192,
      schema,
    });
    const { text, stopReason } = res;
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
    if (!ok) return null;
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    const parsed = qualityOutput.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
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
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as Supa;
    // Admin bypass (administrative/testing): checked server-side before the
    // normal 10/hour rejection; all other users keep the existing limit.
    const isAdmin = await isAdminUser(supabase, context.userId);
    const usage = await readUsage(supabase, context.userId);
    if (!isAdmin && usage.remaining <= 0) {
      return { error: "rate_limited" as const, status: 429, usage, result: null, quality: null };
    }

    // Provider/model is resolved server-side only; clients cannot influence it.
    const { call, model, provider, schemas } = await activeCaller();

    // Analytics only observes real provider responses; it never adds a call.
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
      // Provider failed before returning usage — record the failure, no token guesses.
      await flushUsage(context.userId, null, [
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
      await flushUsage(context.userId, null, records);
      if (stopReason === "max_tokens") {
        throw new Error("The AI response was incomplete. Please try again.");
      }
      throw new Error(`The AI generation did not complete (${stopReason ?? "unknown"}). Please try again.`);
    }

    const parsed = parseSections(raw);
    const result = generationOutput.safeParse(parsed);
    if (!result.success) {
      await flushUsage(context.userId, null, records);
      throw new Error("The AI returned an incomplete or invalid response. Please try again.");
    }

    // Quality Layer 2.0 — stage 1 is now user-triggered (see checkSongQuality).
    // Generate never runs the evaluator automatically.
    const quality: QualityReport | null = null;


    const { data: inserted, error: insertError } = await supabase
      .from("ai_generations")
      .insert({ user_id: context.userId })
      .select("id")
      .maybeSingle();
    if (insertError) {
      await flushUsage(context.userId, null, records);
      throw new Error(`The generation could not be recorded (${insertError.message}). Please try again.`);
    }
    const generationId = (inserted as { id?: string } | null)?.id ?? null;

    await flushUsage(context.userId, generationId, records);
    // Server-side usage visibility of which model served the request.
    console.log(`[ai] generation served by model=${model}`);
    const after = await usageFor(supabase, context.userId);
    return {
      error: null,
      status: 200,
      usage: after,
      result: result.data,
      quality,
      remainingGenerations: after.remaining,
      generationId,
    };
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
  const { call, model, provider, schemas } = await activeCaller();
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
    throw new Error(`The AI generation did not complete (${stopReason ?? "unknown"}). Please try again.`);
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

/**
 * Records one consumed creation against the rolling hourly limit and returns
 * its id. Admins keep the existing bypass; the limit logic itself is unchanged.
 */
async function consumeCreation(supabase: Supa, userId: string) {
  const { data: inserted, error } = await supabase
    .from("ai_generations")
    .insert({ user_id: userId })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`The action could not be recorded (${error.message}). Please try again.`);
  return (inserted as { id?: string } | null)?.id ?? null;
}

const qualityCheckInput = z.object({
  theme: generateInput.shape.theme,
  genre: generateInput.shape.genre,
  mood: generateInput.shape.mood,
  language: generateInput.shape.language,
  result: generationOutput,
  /** Optional: links the check to the originating generation for analytics. */
  generationId: z.string().uuid().nullish(),
});

/**
 * User-triggered Quality Check. Runs exactly one evaluator call through the
 * EXISTING Quality Layer 2A and consumes exactly one creation.
 */
export const checkSongQuality = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => qualityCheckInput.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as Supa;
    const isAdmin = await isAdminUser(supabase, context.userId);
    const usage = await readUsage(supabase, context.userId);
    if (!isAdmin && usage.remaining <= 0) {
      return { error: "rate_limited" as const, quality: null, usage };
    }

    const { call, model, provider, schemas } = await activeCaller();
    const records: PendingUsage[] = [];
    const constraints = {
      theme: data.theme,
      genre: data.genre,
      mood: data.mood,
      language: data.language,
      structure: "",
      production: "",
      instructions: "",
    };


    const quality = await runQualityCheck(call, schemas.quality, constraints, data.result, {
      operation: "quality_check",
      records,
      provider,
      model,
    });

    const consumedId = await consumeCreation(supabase, context.userId);
    await flushUsage(context.userId, data.generationId ?? consumedId, records);
    const after = await usageFor(supabase, context.userId);
    return { error: null, quality, usage: after };
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
    const supabase = context.supabase as unknown as Supa;
    if (!(await isAdminUser(supabase, context.userId))) throw new Error("Not allowed");
    const { getActiveModel } = await import("@/lib/ai-provider.server");
    return { model: await getActiveModel() };
  });

export const setAiModelSetting = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ model: z.enum(AI_MODEL_IDS as [string, ...string[]]) }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as Supa;
    if (!(await isAdminUser(supabase, context.userId))) throw new Error("Not allowed");
    const { setActiveModel } = await import("@/lib/ai-provider.server");
    return setActiveModel(data.model as never, context.userId);
  });
