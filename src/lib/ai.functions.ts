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
  return `Act as a top-tier music producer and expert in composition and orchestration. An artist has brought you a song idea. Your job is to develop it into a complete, production-ready concept optimized for AI music platforms like Suno and Udio.

User's Core Idea: ${d.theme}
Requested Genre(s): ${d.genre}
Requested Mood: ${d.mood}
Requested Language: ${d.language}

AUTHORITATIVE INPUTS (non-negotiable):
- The user's Genre, Mood and Language are authoritative constraints. NEVER replace, override or contradict them, even if another style seems more appropriate. Use your professional production knowledge to determine HOW to realize those choices musically (BPM, drum style, bass approach, instrumentation, vocal character, flow/cadence, arrangement, dynamics, atmosphere) while remaining fundamentally true to the requested genre, mood and language.
- The user's Core Idea is the creative foundation. Expand and elevate it, but do not replace it with a different story or invent unrelated concepts. Creative additions are allowed only when they naturally support the original idea. The result must feel like: USER IDEA → PROFESSIONAL PRODUCER INTERPRETATION → COMPLETE SONG CONCEPT.

PRODUCTION INTELLIGENCE (internal process — never expose this reasoning in the response):
Before writing the final output, approach the request like an experienced human producer preparing an actual song for production. Internally decide:
- The emotional core of the idea and the story/feeling the song should communicate.
- The subgenre or stylistic interpretation that naturally fits the selected genre.
- A deliberate BPM/tempo range based on genre, mood, lyrical subject, energy level, groove and intended vocal delivery — never random.
- Groove, rhythmic feel, instrumentation and sound palette that support the mood.
- Vocal character: tone, delivery, emotional intensity, melodic vs rhythmic delivery, harmonies, backing vocals and ad-libs only where they genuinely serve the song.
- Arrangement development: where tension builds, where energy releases, where contrast is introduced, how the chorus differs from the verses, intro atmosphere, verse space, pre-chorus tension, chorus impact, transitions, breakdowns, bridges, drops, final chorus escalation, outro. Use only elements that make musical sense — not every song needs every element. The listener should feel progression and contrast, not one static loop.
- Production details that make this song feel intentionally crafted rather than generic.
- If multiple genres are selected, how to fuse them organically into ONE coherent musical identity with a unified groove and instrumentation — not a list of disconnected genre descriptions. Do not force equal representation of every genre if that would be musically unnatural; use the genres as ingredients of one production.

MUSICAL COHERENCE (mandatory):
- Genre, mood, BPM, instruments, vocal style, rhythm, song structure, lyrics, atmosphere and dynamics must all work together. Never generate random combinations of impressive-sounding musical terms or contradictory characteristics (e.g., aggressive trap drums with a dreamy acoustic folk arrangement) unless the user's requested genres genuinely justify such a fusion. Specificity is good, but coherence matters more than quantity.
- Treat the selected genre as the musical foundation: use appropriate genre conventions, production characteristics and vocabulary, making intelligent production decisions WITHIN the genre (e.g., for Hip Hop decide boom bap / trap / melodic / alternative direction, drum character, bass, sample or synth palette, flow and rhythmic density; for Latin decide groove, percussion pattern, instrumentation, bass movement and danceability) inferred naturally from the user's idea, mood and genre. Avoid reducing the Style Prompt to a generic list of genre keywords.
- Choose a song structure that serves this particular song rather than a rigid template. A structure like [Intro] [Verse 1] [Pre-Chorus] [Chorus] [Verse 2] [Chorus] [Bridge] [Final Chorus] [Outro] is common, but another genre or concept may benefit from a different structure. Prioritize musical storytelling and progression over rigid repetition.
- Do NOT mechanically follow a fixed formula. Make professional decisions based on this specific combination of Core Idea + Genre + Mood + Language, so every song feels intentionally produced for this particular request.

LYRICS:
- The lyrics must feel like they belong to the generated musical direction: the selected language must be respected exactly, the emotional tone must match the requested mood, and the lyrical flow, cadence and phrasing must be appropriate for the selected genre and work with the proposed BPM and vocal direction. (E.g., Hip Hop must not receive lyrics written with the cadence of a generic pop ballad unless the user's concept explicitly calls for it.)
- Ensure professional rhythmic cadence, flow, and internal rhymes.

STYLE PROMPT QUALITY:
- The Style Prompt must be genuinely useful for Suno/Udio: describe the actual production direction with meaningful musical information — genre/subgenre, BPM, groove, instrumentation, vocal character, production texture, atmosphere, dynamics and arrangement characteristics. Prefer concrete production information over decorative language; avoid excessive generic adjectives ("amazing, beautiful, powerful, incredible, emotional, epic") unless they communicate something musically meaningful.

PRODUCER'S NOTE:
- Briefly explain the actual creative decisions made — why the musical direction, atmosphere, structure or instrumentation support the user's original idea. Do not simply repeat the user's inputs. Keep it concise and useful.

FINAL INTERNAL QUALITY CHECK (perform silently, never expose):
Before returning, internally verify: (1) the result preserves the Core Idea, (2) respects the Genre, (3) respects the Mood, (4) uses the requested Language, (5) the BPM is appropriate, (6) the instruments are appropriate, (7) the vocal direction fits, (8) the lyrics are compatible with genre and mood, (9) the arrangement has meaningful progression, (10) multiple genres are fused coherently when applicable, (11) the Style Prompt is specific without becoming random or bloated, (12) the entire result feels like one professionally produced song. If anything is inconsistent, correct it internally before returning.

STRICT FORMATTING RULES (non-negotiable):
- All musical directions, structural tags, and non-sung elements (e.g., Intro, Chorus, Fade out, Guitar Solo) MUST be enclosed strictly in square brackets [ ], never in round parentheses ( ). This is critical so the music AI does not sing these instructions.

Generate exactly three sections:
1) **Style Prompt (Metatags):** ONLY in English. A highly optimized description of musical style, instruments, vocal style and BPM for Suno/Udio. Every tag or direction must use square brackets where applicable, never round parentheses.
2) **Lyrics & Structure:** Complete lyrics strictly in ${d.language}. Every structural tag and non-sung direction in square brackets (e.g., [Intro], [Verse 1], [Pre-Chorus], [Chorus], [Guitar Solo], [Bridge], [Drop], [Fade out], [Outro]) — NEVER round parentheses.
3) **Producer's Note:** Strictly in ${d.language}.

Return the result as strict JSON only, no markdown fences, with exactly these keys: {"title": string, "tags": string, "lyrics": string, "note": string}. The "title" value is just the song name itself (without the "Title:" prefix).`;
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

const qualityOutput = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(10),
  issues: issueList,
  languageIssues: issueList,
  grammarIssues: issueList,
  singabilityIssues: issueList,
  genreIssues: issueList,
  consistencyIssues: issueList,
});

export type QualityReport = z.infer<typeof qualityOutput>;

const QUALITY_SYSTEM_PROMPT = `You are a professional music editor, lyric editor and producer acting as a QUALITY EVALUATOR. You are an EDITOR, never a songwriter: you never rewrite lyrics, never propose replacement lines, never invent content and never change the creative direction. You only identify genuine problems.

You output STRICT JSON ONLY — no markdown fences, no commentary, no reasoning, nothing outside the JSON object. The response must parse with JSON.parse and contain exactly these keys:
{"passed": boolean, "score": number, "issues": string[], "languageIssues": string[], "grammarIssues": string[], "singabilityIssues": string[], "genreIssues": string[], "consistencyIssues": string[]}

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

Report each finding as one short, concrete sentence quoting the offending fragment. Never expose your reasoning process. Use empty arrays where there is nothing to report.`;

function buildQualityPrompt(
  d: z.infer<typeof generateInput>,
  r: z.infer<typeof generationOutput>,
) {
  return `Evaluate the generated song below against the user's original constraints.

ORIGINAL USER CONSTRAINTS
Core Idea: ${d.theme}
Requested Genre(s): ${d.genre}
Requested Mood: ${d.mood}
Requested Language: ${d.language}

GENERATED TITLE
${r.title}

GENERATED STYLE PROMPT (TAGS)
${r.tags}

GENERATED LYRICS
${r.lyrics}

GENERATED PRODUCER'S NOTE
${r.note}

Check: requested language integrity of the sung lyrics, foreign-language/script contamination, grammar and natural phrasing, singability and cadence against the implied tempo and flow, structural formatting (square brackets for all non-sung directions), genre authenticity and mood fit, faithfulness to the core idea, and consistency between the Style Prompt, the Lyrics and the Producer's Note. Also flag obviously generic or awkward wording.

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
      maxTokens: 2048,
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
 * repair call plus one post-repair quality check, on the server-selected model.
 */
export const repairSongPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => repairInput.parse(input))
  .handler(async ({ data, context }) => {
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

    // Mandatory single post-repair pass through the EXISTING Quality Layer 2A.
    const quality = await runQualityCheck(call, schemas.quality, constraints, repaired.data, {
      operation: "post_repair_quality_check",
      records,
      provider,
      model,
    });

    await flushUsage(context.userId, generationId, records);

    return { result: repaired.data, quality };
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
