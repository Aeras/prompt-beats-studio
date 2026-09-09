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

type AiOperation = "generate" | "quality_check" | "repair" | "post_repair_quality_check";

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

/** Quality Check 2.0 — a structured, deterministically applicable lyric fix. */
const lyricCorrectionSchema = z.object({
  sectionLabel: z.string().trim().max(80).nullish().transform((v) => v ?? ""),
  originalText: z.string().min(1).max(800),
  occurrenceIndex: z.number().int().min(1).max(50).nullish().transform((v) => v ?? 1),
  reason: z.string().trim().min(1).max(600),
  replacementText: z.string().min(1).max(800),
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
  /** Quality Check 2.0 additions — all optional for backwards compatibility. */
  lyricCorrections: z.array(lyricCorrectionSchema).max(20).nullish().transform((v) => v ?? []),
  creativeSuggestions: suggestionList,
  vocalSuggestions: suggestionList,
  productionSuggestions: suggestionList,
});

export type QualityReport = z.infer<typeof qualityOutput>;
export type LyricCorrectionItem = z.infer<typeof lyricCorrectionSchema>;
export type QualitySuggestion = z.infer<typeof suggestionSchema>;


const QUALITY_SYSTEM_PROMPT = `You are a professional music editor, lyric editor and producer acting as a QUALITY EVALUATOR. You are an EDITOR, never a songwriter: you never rewrite lyrics, never propose replacement lines, never invent content and never change the creative direction. You only identify genuine problems.

You output STRICT JSON ONLY — no markdown fences, no commentary, no reasoning, nothing outside the JSON object. The response must parse with JSON.parse and contain exactly these keys:
{"passed": boolean, "score": number, "issues": string[], "languageIssues": string[], "grammarIssues": string[], "singabilityIssues": string[], "genreIssues": string[], "consistencyIssues": string[], "lyricCorrections": object[], "creativeSuggestions": object[], "vocalSuggestions": object[], "productionSuggestions": object[]}

EVALUATOR ROLE:
- Identify real problems, explain why each is a problem in one concrete sentence, and avoid inventing problems.
- Do NOT rewrite lyrics, do NOT suggest replacement lines, do NOT propose a different creative direction, and do NOT expose your internal reasoning.
- Use empty arrays when there is nothing to report for a category.

SCORE CALIBRATION (0-10):
- 9-10: excellent, essentially clean, only negligible issues or none.
- 8-8.9: strong output with minor, non-material issues.
- 7-7.9: good but with noticeable issues that do not seriously harm the song.
- 5-6.9: significant quality problems that materially affect the result.
- Below 5: serious or multiple major problems.
- The score must reflect the severity and quantity of REAL issues. Do NOT lower the score substantially for a single minor stylistic preference or a false-positive consistency concern.

"passed" is true when the song is sufficiently clean to ship: minor stylistic imperfections, poetic licence or personal taste must NOT fail a good song. Set "passed" to false only for real defects (broken grammar, wrong or contaminated language, unsingable phrasing, wrong genre/mood, true contradictions between sections).

Distinguish carefully between:
A) real errors that should be corrected — broken syntax, incomplete phrases, wrong verb tense that changes the intended meaning, non-idiomatic or nonsensical wording, foreign-script contamination, structural formatting mistakes, genre or mood mismatch, genuine contradictions between Style Prompt, Lyrics and Producer's Note;
B) acceptable creative choices — metaphors, imagery, chorus repetition, slang, dialect, genre conventions, deliberate fragments used as a hook, unconventional but intentional phrasing, multiple time references that describe different things. NEVER flag category B.

CONSISTENCY — REDUCE FALSE POSITIVES:
- Different dates, durations, ages, distances, quantities, or time references are NOT automatically contradictions.
- Before reporting a contradiction, determine whether the two statements refer to the SAME underlying fact, event, person, timeline, setting, or narrative state.
- Example: "a song from a year ago" and "my heart is still stuck three years ago" can coexist; they refer to different things (the song vs. the emotional wound) and must NOT be flagged.
- Only report a consistency issue when one statement clearly makes the other impossible or mutually incompatible about the same thing.
- HARD RULE: If you conclude the details are compatible, explainable, or merely create a minor tension but are NOT actually contradictory, you MUST treat it as NO consistency issue. Do NOT add it to consistencyIssues, do NOT add it to issues, and do NOT lower the score because of it.

LANGUAGE INTEGRITY IS STRICT:
- The sung lyrics must be entirely in the requested language, apart from legitimate unavoidable loanwords or established genre terminology.
- Any accidental foreign script (e.g. Chinese characters such as 音 inside Russian lyrics, Cyrillic inside Greek lyrics, non-Latin script inside English or Spanish lyrics) is always a language issue, including when it appears inside a structural direction.
- Structural production directions inside square brackets [ ] are allowed and are NOT lyric-language contamination by themselves; only flag them if the actual sung content is in the wrong language or the bracket content contains stray foreign script or malformed tags.
- Round parentheses used for structural/non-sung directions instead of square brackets are a structural formatting issue.
- Do NOT flag intentional artist/style terminology, common loanwords, proper nouns, or universally used musical terms unless they genuinely violate the requested language context.

GRAMMAR:
- Remain strict about genuine grammatical errors, incorrect case endings, agreement errors, incorrect verb forms, broken syntax, and clearly non-idiomatic constructions.
- Do NOT flag intentional poetic compression, repetition, colloquial phrasing, or stylistic choices unless they genuinely make the language incorrect or clearly unnatural.

SINGABILITY:
- Only report singability problems when the wording creates a real problem with natural phrasing, cadence, stress, syllable flow, or vocal delivery.
- Do NOT duplicate every grammar issue into singability automatically. A grammar issue may affect singability, but report it as a singability issue only when there is an actual singing/cadence consequence.

GENRE:
- Keep genre evaluation strict but reasonable.
- Do NOT penalize a song simply because it contains common or cross-genre musical elements if the overall musical direction remains coherent with the requested genre.

Report each finding as one short, concrete sentence quoting the offending fragment. Never expose your reasoning process. Use empty arrays where there is nothing to report.

==================================================
QUALITY CHECK 2.0 — STRUCTURED OUTPUT
==================================================

Everything below is returned in the SAME single JSON response. Never ask for another pass.

ACTUAL ISSUES: the six issue arrays above. They are genuine, materially meaningful problems only (unnatural wording, grammar, awkward phrasing, poor singability, forced rhyme, weak or confusing lines, unnecessary repetition, real inconsistency, genre or mood mismatch, structural formatting problems, contradictions between lyrics and Music Style). Never invent issues to make the report longer. If the song is strong, report few or none.

"lyricCorrections": for every lyric issue that CAN be corrected, add one object:
{"sectionLabel": string, "originalText": string, "occurrenceIndex": number, "reason": string, "replacementText": string}
- "sectionLabel" is the existing section the text sits in, without brackets (e.g. "Chorus", "Verse 2"). Use "" only when the text is outside any section.
- "originalText" must be copied EXACTLY, character for character, from the current lyrics. Never paraphrase it.
- "occurrenceIndex" is 1-based within that section when the same text appears more than once; otherwise 1.
- "replacementText" preserves the intended meaning, emotion and language.
- Omit a correction entirely if you cannot quote the original text exactly.

"creativeSuggestions": optional improvements, NOT errors. They must never influence the score.
"vocalSuggestions": vocal arrangement recommendations, only when there is a real creative reason.
"productionSuggestions": instrumentation, arrangement, dynamics, transitions, final chorus, vocal production, atmosphere, rhythm section, bass, drums, harmony — only when genuinely relevant. No generic filler.

Each suggestion object:
{"title": string, "explanation": string, "actionType": "add_to_music_style" | "vocal_arrangement" | "informational", "value": string, "arrangement": object[]}
- "add_to_music_style": "value" is the SHORT text to append to the existing Music Style (it is appended, never replacing it). "arrangement" is [].
- "vocal_arrangement": "value" is the short Music Style addition describing the arrangement (e.g. "Male/Female duet, alternating lead vocals") and "arrangement" lists the tag insertions:
  {"sectionLabel": "Verse 1", "tag": "[Male]"}
  Only reference sections that already exist in the current lyrics; never invent, rename or reorder sections; never change sung text. Tags must be square-bracketed, e.g. [Male], [Female], [Both], [Duet], [Male Backing Vocals], [Female Backing Vocals].
- "informational": nothing can be applied automatically; "value" is "" and "arrangement" is [].

The score reflects ONLY real quality problems. Creative, vocal and production suggestions must never lower it.`;

function buildQualityPrompt(
  d: z.infer<typeof generateInput>,
  r: z.infer<typeof generationOutput>,
) {
  return `Evaluate the CURRENT state of the song below against the user's original constraints. This is exactly what the user sees right now, including any manual edits — analyse this text only.

ORIGINAL USER CONSTRAINTS
Core Idea: ${d.theme}
Requested Genre(s): ${d.genre}
Requested Mood: ${d.mood}
Requested Language: ${d.language}

CURRENT TITLE
${r.title}

CURRENT STYLE PROMPT (TAGS)
${r.tags}

CURRENT LYRICS
${r.lyrics}

CURRENT PRODUCER'S NOTE
${r.note}

Check: requested language integrity of the sung lyrics, foreign-language/script contamination, grammar and natural phrasing, singability and cadence against the implied tempo and flow, structural formatting (square brackets for all non-sung directions), genre authenticity and mood fit, faithfulness to the core idea, and consistency between the Style Prompt, the Lyrics and the Producer's Note. Also flag obviously generic or awkward wording.

Then produce, in the SAME response: lyricCorrections for the fixable lyric issues (quoting the current lyrics exactly), plus any genuinely worthwhile creativeSuggestions, vocalSuggestions and productionSuggestions. Section labels and quoted text must come from the CURRENT lyrics above.

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
  /** Distinguishes a first check from a check run after a repair. */
  afterRepair: z.boolean().default(false),
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
    };

    const quality = await runQualityCheck(call, schemas.quality, constraints, data.result, {
      operation: data.afterRepair ? "post_repair_quality_check" : "quality_check",
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
// Package 2C — Manual AI Repair (never automatic).
// One click = exactly one repair call + one mandatory post-repair quality check.
// No retries, no loops, no persistence, no schema changes.
// ─────────────────────────────────────────────────────────────────────────────



const REPAIR_SYSTEM_PROMPT = `You are a professional song EDITOR performing a targeted repair pass. You are not a new songwriter.

Rules:
- Fix ONLY the problems listed in the quality report. Everything else stays byte-for-byte as provided.
- Preserve the core idea, genre identity, mood, language, narrative, song structure, section markers, and every line that has no reported problem.
- Prefer the smallest possible edit: repair the offending phrase or line, not the whole verse or song.
- For grammar issues, correct only the faulty wording. For consistency issues, adjust the minimal detail that resolves the contradiction. For language contamination, replace only the unintended foreign-language content with correct wording in the requested language.
- Never change the requested language. Never add new sections. Never invent an unrelated storyline.
- Keep the same tone and register of the original writing.

You output STRICT JSON ONLY — no markdown fences, no commentary, nothing outside the JSON object. The response must parse with JSON.parse and contain exactly these keys: {"title": string, "tags": string, "lyrics": string, "note": string}.`;

function buildRepairPrompt(
  d: z.infer<typeof generateInput>,
  r: z.infer<typeof generationOutput>,
  q: QualityReport,
) {
  const list = (label: string, items: string[]) =>
    items.length ? `${label}:\n${items.map((i) => `- ${i}`).join("\n")}` : `${label}: none`;
  return `Repair the generated song below using the quality report. Change only what the report identifies.

ORIGINAL USER CONSTRAINTS
Core Idea: ${d.theme}
Requested Genre(s): ${d.genre}
Requested Mood: ${d.mood}
Requested Language: ${d.language}

CURRENT TITLE
${r.title}

CURRENT STYLE PROMPT (TAGS)
${r.tags}

CURRENT LYRICS
${r.lyrics}

CURRENT PRODUCER'S NOTE
${r.note}

QUALITY REPORT
Passed: ${q.passed}
Score: ${q.score}/10
${list("General issues", q.issues)}
${list("Language issues", q.languageIssues)}
${list("Grammar issues", q.grammarIssues)}
${list("Singability issues", q.singabilityIssues)}
${list("Genre issues", q.genreIssues)}
${list("Consistency issues", q.consistencyIssues)}

Return the full repaired song as strict JSON only, with exactly these keys: {"title": string, "tags": string, "lyrics": string, "note": string}. Unchanged parts must be returned exactly as they are now.`;
}

const repairInput = z.object({
  theme: generateInput.shape.theme,
  genre: generateInput.shape.genre,
  mood: generateInput.shape.mood,
  language: generateInput.shape.language,
  result: generationOutput,
  quality: qualityOutput,
  /** Optional: links repair usage to the originating generation for analytics. */
  generationId: z.string().uuid().nullish(),
});

/**
 * Manual repair, available to every authenticated user. Runs exactly one
 * repair call on the server-selected model and consumes one creation.
 * The post-repair quality check is user-triggered (see checkSongQuality).
 */
export const repairSongPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => repairInput.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as Supa;
    const isAdmin = await isAdminUser(supabase, context.userId);
    const preUsage = await readUsage(supabase, context.userId);
    if (!isAdmin && preUsage.remaining <= 0) {
      return { error: "rate_limited" as const, result: null, quality: null };
    }

    const { call, model, provider, schemas } = await activeCaller();
    const generationId = data.generationId ?? null;
    const records: PendingUsage[] = [];


    const constraints = {
      theme: data.theme,
      genre: data.genre,
      mood: data.mood,
      language: data.language,
    };

    let repairRes: ModelResult;
    try {
      repairRes = await call({
        system: REPAIR_SYSTEM_PROMPT,
        prompt: buildRepairPrompt(constraints, data.result, data.quality),
        maxTokens: 8192,
        schema: schemas.song,
      });
    } catch (err) {
      await flushUsage(context.userId, generationId, [
        { operation: "repair", provider, model, usage: null, success: false },
      ]);
      throw err;
    }

    const { text, stopReason } = repairRes;
    const repairOk = stopReason === "end_turn";
    records.push({
      operation: "repair",
      provider: repairRes.provider,
      model: repairRes.model,
      usage: repairRes.usage,
      success: repairOk,
    });

    if (!repairOk) {
      await flushUsage(context.userId, generationId, records);
      if (stopReason === "max_tokens") throw new Error("The repair response was incomplete. Please try again.");
      throw new Error(`The repair did not complete (${stopReason ?? "unknown"}). Please try again.`);
    }

    const repaired = generationOutput.safeParse(parseSections(text));
    if (!repaired.success) {
      await flushUsage(context.userId, generationId, records);
      throw new Error("The repair returned an invalid response. Please try again.");
    }

    // The post-repair quality check is now user-triggered ("Check Again").
    const consumedId = await consumeCreation(supabase, context.userId);
    await flushUsage(context.userId, generationId ?? consumedId, records);

    return { error: null as null | "rate_limited", result: repaired.data, quality: null as QualityReport | null };
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
