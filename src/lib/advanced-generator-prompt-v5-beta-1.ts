import type { z } from "zod";
import { type songBlueprintSchema } from "@/lib/song-blueprint.shared";
import { V5_BETA_1_MASTER_PROMPT_TEMPLATE } from "./advanced-generator-prompt-v5-beta-1.template";
import { normalizeV4Platform, serializeV4Blueprint } from "./advanced-generator-prompt-v4-beta";

export const V5_BETA_1_PLACEHOLDERS = [
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
export type V5Beta1Placeholder = (typeof V5_BETA_1_PLACEHOLDERS)[number];

export interface V5Beta1Input {
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

function field(value: string | undefined) {
  const v = (value ?? "").trim();
  return v ? v : NOT_PROVIDED;
}

/**
 * Builds the V5 BETA 1 generation prompt: the frozen master prompt verbatim with
 * each known placeholder replaced in a single pass. Inserted user text is never
 * re-scanned, so user-supplied `{{...}}` cannot trigger further substitution.
 */
export function buildAdvancedGeneratorPromptV5Beta1(input: V5Beta1Input): string {
  const required = {
    theme: input.theme,
    genre: input.genre,
    mood: input.mood,
    language: input.language,
  };
  for (const [key, value] of Object.entries(required)) {
    if (!value || !value.trim()) throw new Error(`V5 BETA 1 requires a non-empty ${key}.`);
  }
  const values: Record<V5Beta1Placeholder, string> = {
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
  return V5_BETA_1_MASTER_PROMPT_TEMPLATE.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) =>
    key in values ? values[key as V5Beta1Placeholder] : match,
  );
}
