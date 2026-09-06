import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export const getGenerationUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => readUsage(context.supabase as unknown as Supa, context.userId));

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

async function callAnthropic(apiKey: string, prompt: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (res.ok) {
    const payload = (await res.json()) as {
      stop_reason?: string | null;
      content?: { type: string; text?: string }[];
    };
    const text =
      payload.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("") ?? "";
    return { text, stopReason: payload.stop_reason ?? null };
  }
  throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
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

export const generateSongPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => generateInput.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as Supa;
    const usage = await readUsage(supabase, context.userId);
    if (usage.remaining <= 0) {
      return { error: "rate_limited" as const, status: 429, usage, result: null };
    }

    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

    const { text: raw, stopReason } = await callAnthropic(apiKey, buildPrompt(data));
    if (stopReason === "max_tokens") {
      throw new Error("The AI response was incomplete. Please try again.");
    }
    if (stopReason !== "end_turn" && stopReason !== "stop_sequence") {
      throw new Error(`The AI generation did not complete (${stopReason ?? "unknown"}). Please try again.`);
    }

    const parsed = parseSections(raw);
    const result = generationOutput.safeParse(parsed);
    if (!result.success) {
      throw new Error("The AI returned an incomplete or invalid response. Please try again.");
    }

    await supabase.from("ai_generations").insert({ user_id: context.userId });
    const after = await readUsage(supabase, context.userId);
    return { error: null, status: 200, usage: after, result, remainingGenerations: after.remaining };
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
