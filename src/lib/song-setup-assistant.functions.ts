import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import {
  ADVANCED_MOODS,
  ADVANCED_MUSIC_STYLES,
  BPM_OPTIONS,
  INSTRUMENTS,
  SONG_LANGUAGES,
  SONG_STRUCTURE_TAGS,
} from "@/catalog/generator-options";
import { AI_TARGET_PLATFORMS, type AITargetPlatform } from "@/lib/ai-target-platforms";
import {
  auxiliaryRequestKeySchema,
  executeDurableAuxiliaryAiRequest,
} from "@/lib/ai-auxiliary-idempotency.server";
import { getSongSetupRoleFlags } from "@/lib/song-setup-role.server";

const SONG_SETUP_DESCRIPTION_LIMIT = 2500;

const setupInput = z.object({
  description: z.string().trim().min(10),
  targetPlatform: z.enum([...AI_TARGET_PLATFORMS] as [AITargetPlatform, ...AITargetPlatform[]]),
  model: z.string().trim().min(1).max(240).optional(),
  requestKey: auxiliaryRequestKeySchema,
});

export const songSetupDraftSchema = z.object({
  theme: z.string().trim().min(3).max(500),
  musicStyle: z.string().trim().min(1).max(150),
  mood: z.string().trim().min(1).max(120),
  instruments: z.string().trim().max(200),
  bpm: z.string().trim().min(1).max(8),
  songStructure: z.string().trim().min(1).max(600),
  productionStyle: z.string().trim().max(2000),
  additionalInstructions: z.string().trim().max(2000),
  language: z.string().trim().min(1).max(80),
});

// PB-009: normal admins bypass only the four Advanced authoring ceilings.
// Unrelated Song Setup constraints remain identical to the normal schema.
const adminSongSetupDraftSchema = z.object({
  theme: z.string().trim().min(3),
  musicStyle: z.string().trim().min(1),
  mood: z.string().trim().min(1),
  instruments: z.string().trim(),
  bpm: z.string().trim().min(1).max(8),
  songStructure: z.string().trim().min(1).max(600),
  productionStyle: z.string().trim().max(2000),
  additionalInstructions: z.string().trim().max(2000),
  language: z.string().trim().min(1).max(80),
});

const superAdminSongSetupDraftSchema = z.object({
  theme: z.string().trim().min(3),
  musicStyle: z.string().trim().min(1),
  mood: z.string().trim().min(1),
  instruments: z.string().trim(),
  bpm: z.string().trim().min(1),
  songStructure: z.string().trim().min(1),
  productionStyle: z.string().trim(),
  additionalInstructions: z.string().trim(),
  language: z.string().trim().min(1),
});

export type SongSetupDraft = z.infer<typeof songSetupDraftSchema>;

const SETUP_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    theme: { type: "STRING" },
    musicStyle: { type: "STRING" },
    mood: { type: "STRING" },
    instruments: { type: "STRING" },
    bpm: { type: "STRING" },
    songStructure: { type: "STRING" },
    productionStyle: { type: "STRING" },
    additionalInstructions: { type: "STRING" },
    language: { type: "STRING" },
  },
  required: [
    "theme",
    "musicStyle",
    "mood",
    "instruments",
    "bpm",
    "songStructure",
    "productionStyle",
    "additionalInstructions",
    "language",
  ],
};

function values(items: readonly { value: string }[]) {
  return items
    .map((item) => item.value)
    .filter((value) => value !== "Custom…" && value !== "Custom");
}

const SYSTEM_PROMPT = `You are the PromptBeats Song Setup Assistant, a professional music brief architect and pre-production assistant.

Your ONLY job is to turn a user's informal song idea into a complete Advanced Mode setup. You do NOT write lyrics, a song title, or a producer note. You create the planning brief that will later be sent to a separate songwriting model.

CORE SEPARATION RULES:
1. THEME is lyrical subject matter only: story, situation, characters, setting, emotional premise, perspective, and concrete narrative direction. Never put genre names, instruments, BPM, production terminology, platform terminology, artist names, song titles, or sonic references in Theme.
2. MUSIC STYLE contains the requested genres/styles and compatible stylistic refinements. If the user explicitly asks for Reggaeton, Cumbia, Soft Rock, etc., preserve those requested styles here. Do not silently replace them with unrelated genres.
3. MOOD contains emotional/vibe descriptors, not plot.
4. INSTRUMENTS contains requested and musically appropriate instrumentation.
5. BPM is Auto or one integer from 40 to 260. Choose a useful tempo when the brief supports one; otherwise use Auto.
6. SONG STRUCTURE uses only the supplied canonical section labels and should be written as a sequence separated by " → ". Repetition is allowed when musically useful.
7. PRODUCTION STYLE describes arrangement, groove, dynamics, vocal treatment, mix texture, energy curve, and production choices.
8. ADDITIONAL INSTRUCTIONS gives useful songwriting/vocal constraints that do not belong in Theme. Keep it practical and specific.
9. LANGUAGE is the requested song language as a canonical English language name. Infer it from the user's request when clear; otherwise use English.

REFERENCE SAFETY / INTERPRETATION:
- References influence the SOUND, never the lyrical content.
- If the user mentions an artist, band, existing song, album, or era as a reference, do not copy, quote, translate, paraphrase, or imitate existing lyrics, distinctive phrases, titles, melodies, or other protected expression.
- Do not include artist names, band names, or existing song titles in the final setup. Instead translate the reference into broad musical characteristics such as genre family, tempo feel, instrumentation, vocal intensity, groove, dynamics, arrangement, and production texture.
- Never turn words such as "rock", "cumbia", "guitar", "cinematic", "upbeat", or similar production/style terms into lyrical subject matter unless the user explicitly says those words are part of the story.

QUALITY RULES:
- Respect the user's requested story and musical choices. Fill missing musical details intelligently rather than changing the concept.
- Theme and Additional Instructions should normally be written in the requested song language so the downstream songwriter receives natural-language narrative guidance.
- Music Style, Mood, Instruments, Production Style, and Song Structure should normally use clear English music-production terminology.
- Keep the setup coherent: genre, instrumentation, BPM, structure, production, and mood should work together.
- Do not overstuff the setup. Prefer a strong, intentional combination over a random list.
- Return JSON only and exactly the requested fields.`;

export const generateSongSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setupInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "ai_generator");
    await requireFeatureAccess(context.supabase, "song_setup_assistant");

    const { isAdminLevel, isSuperAdmin } = await getSongSetupRoleFlags(context.supabase);
    if (!isSuperAdmin && data.description.length > SONG_SETUP_DESCRIPTION_LIMIT) {
      throw new Error(
        `Song description must be ${SONG_SETUP_DESCRIPTION_LIMIT} characters or fewer.`,
      );
    }

    return executeDurableAuxiliaryAiRequest({
      supabase: context.supabase,
      userId: context.userId,
      operation: "song_setup_assistant",
      requestKey: data.requestKey,
      execute: async (markProviderStarted) => {
        const musicStyles = values(ADVANCED_MUSIC_STYLES);
        const moods = values(ADVANCED_MOODS);
        const instruments = values(INSTRUMENTS);
        const structures = values(SONG_STRUCTURE_TAGS);
        const languages = values(SONG_LANGUAGES);
        const bpmOptions = values(BPM_OPTIONS);

        const prompt = `TARGET PLATFORM: ${data.targetPlatform.toUpperCase()}

USER DESCRIPTION:
${data.description}

PROMPTBEATS ADVANCED OPTIONS:
- Canonical music-style options: ${musicStyles.join(", ")}. You may also use a concise custom style when the user's requested style is not represented exactly (for example Soft Rock), while preserving explicit user-requested genres.
- Canonical mood options: ${moods.join(", ")}. Custom concise mood wording is allowed when useful.
- Canonical instruments: ${instruments.join(", ")}. Custom instruments are allowed when genuinely needed.
- Canonical song sections: ${structures.join(", ")}.
- Common BPM choices: ${bpmOptions.join(", ")}; a custom integer 40-260 is also allowed.
- Known language options: ${languages.join(", ")}; other real languages are allowed.

Platform-aware guidance: tailor the setup for ${data.targetPlatform === "udio" ? "Udio, favoring concise, information-dense musical direction" : "Suno, allowing clear production and arrangement direction"}, but do not mention the platform in Theme.

Build the strongest coherent Advanced Mode setup from the user's intent. Keep Theme strictly about what the song is about, and put all sonic/style information in the appropriate non-Theme fields.`;

        const { modelCaller, resolveAiModelForUser } = await import("@/lib/ai-provider.server");
        const { recordAiUsage } = await import("@/lib/ai-usage.server");
        const resolved = await resolveAiModelForUser(context.userId, "ai_tools", data.model);
        const caller = modelCaller(resolved.model, resolved.provider, {
          userId: context.userId,
          operation: "song_setup_assistant",
        });
        const provider = resolved.provider;

        let result: Awaited<ReturnType<typeof caller>> | null = null;
        try {
          await markProviderStarted(resolved.model);
          result = await caller({
            system: SYSTEM_PROMPT,
            prompt,
            maxTokens: isSuperAdmin ? 4096 : 1800,
            schema: SETUP_SCHEMA,
          });
          await recordAiUsage({
            executionId: caller.executionId,
            userId: context.userId,
            provider: result.provider,
            model: result.model,
            operation: "song_setup_assistant",
            usage: result.usage,
            success: result.stopReason === "end_turn",
          });

          if (result.stopReason !== "end_turn") {
            throw new Error(
              "The Song Setup Assistant did not finish its response. Please try again.",
            );
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(result.text);
          } catch {
            throw new Error(
              "The Song Setup Assistant returned an invalid response. Please try again.",
            );
          }
          const setup = isSuperAdmin
            ? superAdminSongSetupDraftSchema.parse(parsed)
            : isAdminLevel
              ? adminSongSetupDraftSchema.parse(parsed)
              : songSetupDraftSchema.parse(parsed);

          const bpmValid =
            setup.bpm === "Auto" ||
            (/^\d{2,3}$/.test(setup.bpm) && Number(setup.bpm) >= 40 && Number(setup.bpm) <= 260);
          if (!bpmValid)
            throw new Error(
              "The Song Setup Assistant returned an invalid BPM. Please regenerate the setup.",
            );

          return { setup, model: result.model };
        } catch (error) {
          if (!result) {
            await recordAiUsage({
              executionId: caller.executionId,
              userId: context.userId,
              provider,
              model: resolved.model,
              operation: "song_setup_assistant",
              usage: null,
              success: false,
            });
          }
          throw error;
        }
      },
    });
  });
