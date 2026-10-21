import type { z } from "zod";
import { activeSongBlueprint, type songBlueprintSchema } from "@/lib/song-blueprint.shared";
import { V4_BETA_MASTER_PROMPT_TEMPLATE } from "./advanced-generator-prompt-v4-beta.template";

export const V4_BETA_PLACEHOLDERS = [
  "CORE_IDEA",
  "GENRES",
  "MOOD",
  "LANGUAGE",
  "TARGET_PLATFORM",
  "SONG_STRUCTURE",
  "PRODUCTION_STYLE",
  "ADDITIONAL_INSTRUCTIONS",
  "SONG_BLUEPRINT",
] as const;
export type V4BetaPlaceholder = (typeof V4_BETA_PLACEHOLDERS)[number];

export interface V4BetaInput {
  theme: string;
  genre: string;
  mood: string;
  language: string;
  targetPlatform: string;
  structure?: string;
  production?: string;
  instructions?: string;
  songBlueprint?: z.infer<typeof songBlueprintSchema>;
}

const NOT_PROVIDED = "(not provided)";

/** Normalizes to exactly `suno` or `udio`, as required by the frozen spec. */
export function normalizeV4Platform(value: string): "suno" | "udio" {
  return value.trim().toLowerCase() === "udio" ? "udio" : "suno";
}

/** Ordered, occurrence-specific Blueprint serialization (same item form as V1–V3). */
export function serializeV4Blueprint(input: z.infer<typeof songBlueprintSchema> | undefined) {
  if (!input) return NOT_PROVIDED;
  const items = activeSongBlueprint(input);
  if (!items.length) return NOT_PROVIDED;
  return items
    .map((item) => {
      const details = [
        item.energy != null ? `Energy target: ${item.energy}/5` : "",
        item.instruction.trim() ? `Direction: ${item.instruction.trim()}` : "",
      ].filter(Boolean);
      return `- Structure position ${item.structureIndex + 1}: ${item.sectionType} #${item.occurrence} — ${details.join(" — ")}`;
    })
    .join("\n");
}

function field(value: string | undefined) {
  const v = (value ?? "").trim();
  return v ? v : NOT_PROVIDED;
}

/**
 * Builds the V4 BETA generation prompt: the frozen master prompt verbatim with
 * each known placeholder replaced in a single pass. Inserted user text is never
 * re-scanned, so user-supplied `{{...}}` cannot trigger further substitution.
 */
export function buildAdvancedGeneratorPromptV4Beta(input: V4BetaInput): string {
  const required = { theme: input.theme, genre: input.genre, mood: input.mood, language: input.language };
  for (const [key, value] of Object.entries(required)) {
    if (!value || !value.trim()) throw new Error(`V4 BETA requires a non-empty ${key}.`);
  }
  const values: Record<V4BetaPlaceholder, string> = {
    CORE_IDEA: input.theme.trim(),
    GENRES: input.genre.trim(),
    MOOD: input.mood.trim(),
    LANGUAGE: input.language.trim(),
    TARGET_PLATFORM: normalizeV4Platform(input.targetPlatform),
    SONG_STRUCTURE: field(input.structure),
    PRODUCTION_STYLE: field(input.production),
    ADDITIONAL_INSTRUCTIONS: field(input.instructions),
    SONG_BLUEPRINT: serializeV4Blueprint(input.songBlueprint),
  };
  return V4_BETA_MASTER_PROMPT_TEMPLATE.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) =>
    key in values ? values[key as V4BetaPlaceholder] : match,
  );
}
