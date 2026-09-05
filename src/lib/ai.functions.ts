import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const HOURLY_LIMIT = 10;

const generateInput = z.object({
  theme: z.string().trim().min(3).max(300),
  genre: z.string().trim().min(1).max(60),
  mood: z.string().trim().min(1).max(60),
  language: z.string().trim().min(1).max(40),
});

const savedInput = z.object({
  theme: z.string().trim().max(300).default(""),
  genre: z.string().trim().max(60).default(""),
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

function buildPrompt(d: z.infer<typeof generateInput>) {
  return `Act as a top-tier music producer and expert in composition and orchestration. Your goal is to take the user's simple idea and transform it into a professional, structured, and optimized output for AI music platforms like Suno and Udio. Incorporate precise musical characteristics (genre, bpm, instruments, mood, song structure, and vocal style) while fully preserving the user's original intent.

User's Core Idea: ${d.theme}
Requested Genre: ${d.genre}
Requested Mood: ${d.mood}
Requested Language: ${d.language}

Based on this, generate exactly three sections, formatted cleanly so the frontend can parse them:
1) **Style Prompt (Metatags):** Provide this ONLY in English. Output a highly optimized list of musical tags, instruments, vocal styles, and BPM (e.g., atmospheric synth-pop, melancholic male vocals, 115 BPM) optimized for Suno/Udio.
2) **Lyrics & Structure:** Provide the complete lyrics strictly in ${d.language}. You must use precise structural brackets (e.g., [Intro], [Verse 1], [Pre-Chorus], [Chorus], [Bridge], [Drop], [Outro]). Ensure professional rhythmic cadence, flow, and internal rhymes.
3) **Producer's Note:** Provide a brief explanation strictly in ${d.language} explaining the musical, structural, and atmospheric choices you made to elevate the user's original idea.

Return the result as strict JSON only, no markdown fences, with exactly these keys: {"tags": string, "lyrics": string, "note": string}.`;
}

async function callGemini(apiKey: string, prompt: string) {
  const models = ["gemini-1.5-flash", "gemini-2.0-flash"];
  let lastError = "AI request failed";
  for (const model of models) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, responseMimeType: "application/json" },
        }),
      },
    );
    if (res.ok) {
      const payload = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      return payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    }
    lastError = `${res.status}: ${(await res.text()).slice(0, 300)}`;
    if (res.status !== 404 && res.status !== 400) break;
  }
  throw new Error(lastError);
}

function parseSections(raw: string) {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as { tags?: string; lyrics?: string; note?: string };
    if (parsed.tags || parsed.lyrics || parsed.note) {
      return { tags: parsed.tags ?? "", lyrics: parsed.lyrics ?? "", note: parsed.note ?? "" };
    }
  } catch {
    /* fall through to text parsing */
  }
  const grab = (start: RegExp, end: RegExp | null) => {
    const s = cleaned.search(start);
    if (s === -1) return "";
    const rest = cleaned.slice(s).replace(start, "");
    if (!end) return rest.trim();
    const e = rest.search(end);
    return (e === -1 ? rest : rest.slice(0, e)).trim();
  };
  return {
    tags: grab(/1\)\s*\*{0,2}Style Prompt[^\n]*\n?/i, /2\)\s*\*{0,2}Lyrics/i),
    lyrics: grab(/2\)\s*\*{0,2}Lyrics[^\n]*\n?/i, /3\)\s*\*{0,2}Producer/i),
    note: grab(/3\)\s*\*{0,2}Producer[^\n]*\n?/i, null),
  };
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

    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const raw = await callGemini(apiKey, buildPrompt(data));
    const result = parseSections(raw);
    if (!result.tags && !result.lyrics && !result.note) {
      throw new Error("The AI returned an empty response. Try again.");
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
      .select("id, theme, genre, mood, language, tags, lyrics, note, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { prompts: data ?? [] };
  });
