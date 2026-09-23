import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import { recordAiUsage } from "@/lib/ai-usage.server";
import { supportsPromptBeatsVisionInput } from "@/lib/ai-model-capabilities.shared";
import { getEffectiveModelAccess } from "@/lib/ai-provider.server";
import {
  inspirationWallCreativeDirectionSchema,
  type InspirationWallCreativeDirection,
} from "@/lib/inspiration-wall.shared";

const wallIdSchema = z.string().uuid();
const MAX_IMAGE_CONTEXT_BYTES = 20 * 1024 * 1024;

const CREATIVE_DIRECTION_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    coreTheme: { type: "STRING" },
    moodPalette: { type: "ARRAY", items: { type: "STRING" } },
    visualLanguage: { type: "ARRAY", items: { type: "STRING" } },
    narrativeAngle: { type: "STRING" },
    musicalCharacter: { type: "STRING" },
    productionTexture: { type: "STRING" },
    vocalPersonality: { type: "STRING" },
    lyricalKeywords: { type: "ARRAY", items: { type: "STRING" } },
    thingsToAvoid: { type: "ARRAY", items: { type: "STRING" } },
    contradictions: { type: "ARRAY", items: { type: "STRING" } },
    openQuestions: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: [
    "coreTheme",
    "moodPalette",
    "visualLanguage",
    "narrativeAngle",
    "musicalCharacter",
    "productionTexture",
    "vocalPersonality",
    "lyricalKeywords",
    "thingsToAvoid",
    "contradictions",
    "openQuestions",
  ],
};

const SYSTEM_PROMPT = `
You are PromptBeats Inspiration Wall Creative Direction Extractor.

Your task is to turn a private pre-song inspiration board into an editable, structured Creative Direction. You are not writing lyrics and you are not generating a song.

PRIORITY ORDER — obey this strictly:
1. Explicit written constraints and instructions.
2. Pinned cards.
3. Written titles, notes, captions and text fragments.
4. Other written content.
5. Visual interpretation of images.
6. Unpinned low-priority material.

TEXT OVERRIDES IMAGE INTERPRETATION.
If a user's words conflict with an image interpretation, follow the user's words and note the tension only when useful.

IMAGE SAFETY / INTERPRETATION RULES:
- Use images only for setting, atmosphere, mood, colors, lighting, visual motifs, objects, textures and broad context.
- Do not identify people.
- Do not infer relationships, private traits, intent, health, ethnicity, religion, politics, sexuality, occupation, criminality, or other sensitive/personal attributes.
- Do not guess a story about real people from appearance alone.
- If an image is ambiguous, keep the interpretation broad and mark uncertainty in Open Questions.

OUTPUT RULES:
- Return only schema-compliant JSON.
- Keep every field useful for later Song Setup handoff.
- Preserve contradictions instead of silently resolving them.
- Things to Avoid must come from explicit user constraints or very strong board-wide negative direction; do not invent prohibitions.
- Open Questions should contain genuine ambiguity that the user may want to resolve.
- Prefer concise, concrete creative language over generic adjectives.
`.trim();

function normalizedGeminiUsage(payload: any) {
  const usage = payload?.usageMetadata;
  if (!usage) return null;
  const inputTokens = usage.promptTokenCount ?? null;
  const outputTokens =
    usage.candidatesTokenCount == null && usage.thoughtsTokenCount == null
      ? null
      : (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  return {
    inputTokens,
    outputTokens,
    totalTokens:
      usage.totalTokenCount ??
      (inputTokens == null && outputTokens == null
        ? null
        : (inputTokens ?? 0) + (outputTokens ?? 0)),
    cachedInputTokens: usage.cachedContentTokenCount ?? null,
    reasoningTokens: usage.thoughtsTokenCount ?? null,
  };
}

async function requireOwnedWall(supabase: any, wallId: string, userId: string) {
  const { data: wall, error } = await supabase
    .from("inspiration_walls")
    .select("id, title, description, selected_theme, connected_project_id, creative_direction")
    .eq("id", wallId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!wall) throw new Error("Inspiration Wall not found.");
  return wall as {
    id: string;
    title: string;
    description: string | null;
    selected_theme: string;
    connected_project_id: string | null;
    creative_direction: InspirationWallCreativeDirection | null;
  };
}

async function resolveMultimodalModel(userId: string, requestedModel?: string | null) {
  const access = await getEffectiveModelAccess(userId, "ai_tools");
  const compatibleOptions = access.modelOptions.filter(supportsPromptBeatsVisionInput);
  const requested = requestedModel
    ? compatibleOptions.find((option) => option.id === requestedModel)
    : null;
  if (requested) return requested;
  const defaultOption = compatibleOptions.find((option) => option.id === access.defaultModel);
  if (defaultOption) return defaultOption;
  const fallback = compatibleOptions[0];
  if (fallback) return fallback;
  throw new Error("No multimodal AI model is available for this account.");
}

function cardPriority(card: {
  type: string;
  is_pinned: boolean;
  title: string | null;
  body: string | null;
}) {
  if (card.type === "constraint") return 0;
  if (card.is_pinned) return 1;
  if ((card.title ?? "").trim() || (card.body ?? "").trim()) return 2;
  if (card.type === "image") return 4;
  return 5;
}

export const listInspirationWallConnectionOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ wallId: wallIdSchema, search: z.string().trim().max(120).optional().default("") })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "inspiration_wall");
    await requireOwnedWall(context.supabase as any, data.wallId, context.userId);

    const { data: projects, error: projectsError } = await (context.supabase as any)
      .from("prompt_projects")
      .select("id, name, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (projectsError) throw new Error(projectsError.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let trackQuery = (supabaseAdmin.from("tracks") as any)
      .select("id, title, cover_url, art_url, is_published, duration_seconds, created_at")
      .eq("user_id", context.userId)
      .eq("source_type", "upload")
      .eq("moderation_status", "active")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.search) trackQuery = trackQuery.ilike("title", `%${data.search}%`);
    const { data: tracks, error: tracksError } = await trackQuery;
    if (tracksError) throw new Error(tracksError.message);

    return {
      projects: (projects ?? []).map((project: any) => ({
        id: project.id as string,
        name: String(project.name ?? "Untitled Project"),
      })),
      tracks: (tracks ?? []).map((track: any) => ({
        id: track.id as string,
        title: String(track.title ?? "Untitled Track"),
        coverUrl: (track.cover_url ?? track.art_url ?? null) as string | null,
        isPublished: track.is_published === true,
        durationSeconds: (track.duration_seconds ?? null) as number | null,
      })),
    };
  });

export const extractInspirationWallCreativeDirection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ wallId: wallIdSchema, model: z.string().trim().max(240).nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "inspiration_wall");
    const { requireAuxiliaryAiAdmission } = await import("@/lib/ai-admission.server");
    await requireAuxiliaryAiAdmission(context.supabase, "inspiration_wall");

    const supabase = context.supabase as any;
    const wall = await requireOwnedWall(supabase, data.wallId, context.userId);
    const { data: cards, error: cardsError } = await supabase
      .from("inspiration_wall_cards")
      .select("id, type, title, body, color_value, image_object_key, is_pinned, sort_order")
      .eq("wall_id", data.wallId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (cardsError) throw new Error(cardsError.message);

    const orderedCards = [...(cards ?? [])].sort((a: any, b: any) => {
      const priority = cardPriority(a) - cardPriority(b);
      return priority || Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    });

    const textCards = orderedCards.map((card: any, index: number) => ({
      priorityRank: cardPriority(card) + 1,
      order: index + 1,
      type: card.type,
      pinned: card.is_pinned === true,
      title: card.title ?? "",
      body: card.body ?? "",
      color: card.color_value ?? null,
      hasImage: Boolean(card.image_object_key),
    }));

    const parts: Array<Record<string, unknown>> = [
      {
        text: [
          `WALL TITLE: ${wall.title}`,
          wall.description ? `WALL DESCRIPTION: ${wall.description}` : "",
          `THEME: ${wall.selected_theme}`,
          "",
          "ORDERED CARD EVIDENCE (already sorted by semantic priority):",
          JSON.stringify(textCards),
          "",
          "Extract the structured Creative Direction now.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];

    let imageBytes = 0;
    let imagesIncluded = 0;
    for (const card of orderedCards as any[]) {
      if (!card.image_object_key) continue;
      const { data: blob, error } = await context.supabase.storage
        .from("inspiration-wall-images")
        .download(card.image_object_key);
      if (error || !blob) continue;
      const bytes = Buffer.from(await blob.arrayBuffer());
      if (imageBytes + bytes.byteLength > MAX_IMAGE_CONTEXT_BYTES) continue;
      imageBytes += bytes.byteLength;
      imagesIncluded += 1;
      parts.push({
        inlineData: {
          mimeType: blob.type || "image/jpeg",
          data: bytes.toString("base64"),
        },
      });
      parts.push({
        text: `Image context for card ${card.id}. Interpret only under the image rules.`,
      });
    }

    const selected = await resolveMultimodalModel(context.userId, data.model);
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("The multimodal AI service is not configured.");

    let usage: ReturnType<typeof normalizedGeminiUsage> = null;
    let success = false;
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selected.id)}:generateContent`,
        {
          method: "POST",
          signal: AbortSignal.timeout(5 * 60 * 1000),
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: CREATIVE_DIRECTION_RESPONSE_SCHEMA,
              maxOutputTokens: 4096,
              temperature: 0.2,
            },
          }),
        },
      );
      const payload = (await response.json()) as any;
      usage = normalizedGeminiUsage(payload);
      if (!response.ok) {
        throw new Error(
          payload?.error?.message || `Creative Direction extraction failed (${response.status}).`,
        );
      }
      const candidate = payload?.candidates?.[0];
      const finishReason = candidate?.finishReason ?? null;
      if (finishReason && finishReason !== "STOP") {
        throw new Error(`Creative Direction extraction stopped before completion: ${finishReason}`);
      }
      const text = (candidate?.content?.parts ?? [])
        .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
        .join("")
        .trim();
      if (!text) throw new Error("Creative Direction extraction returned no JSON.");
      const parsed = inspirationWallCreativeDirectionSchema.parse(JSON.parse(text));

      const { error: saveError } = await supabase
        .from("inspiration_walls")
        .update({ creative_direction: parsed })
        .eq("id", data.wallId)
        .eq("owner_id", context.userId);
      if (saveError) throw new Error(saveError.message);
      success = true;

      return {
        direction: parsed,
        model: selected.id,
        modelLabel: selected.label,
        imagesIncluded,
      };
    } finally {
      await recordAiUsage({
        userId: context.userId,
        provider: "gemini",
        model: selected.id,
        operation: "inspiration_wall_extraction",
        usage,
        success,
      });
    }
  });
