import { z } from "zod";

import { AI_TARGET_PLATFORMS } from "@/lib/ai-target-platforms";
import { generatorInputSnapshotSchema } from "@/lib/generator-revision.shared";
import { buildSongBlueprint, songBlueprintSectionSchema } from "@/lib/song-blueprint.shared";

export const ADVANCED_SETUP_FORMAT = "promptbeats-advanced-generator";
export const ADVANCED_SETUP_SCHEMA_VERSION = 1;
export const ADVANCED_SETUP_MAX_BYTES = 256 * 1024;

const s = generatorInputSnapshotSchema.shape;

// Reuses the persisted snapshot field bounds, but every field is required and
// unknown keys are rejected so arbitrary JSON cannot be imported.
export const advancedSetupSchema = z
  .object({
    targetPlatform: z.enum(AI_TARGET_PLATFORMS),
    theme: z.string().max(500),
    selectedMusicStyles: z.array(z.string().max(150)).max(24),
    customMusicStyle: z.string().max(4000),
    selectedMoods: z.array(z.string().max(120)).max(24),
    customMood: z.string().max(2000),
    selectedInstruments: z.array(z.string().max(1000)).max(40),
    customInstruments: z.string().max(32000),
    bpmMode: z.string().max(40),
    customBpm: z.string().max(20),
    songStructure: z.array(z.string().max(120)).max(40),
    songBlueprint: z.array(songBlueprintSectionSchema).max(40),
    productionStyle: z.string().max(4000),
    additionalInstructions: z.string().max(4000),
    language: z.string().max(80),
    languageVariant: z.string().max(80),
    customLanguage: z.string().max(80),
    smartPresetId: z.string().max(80),
    culturalStyleId: z.string().max(80),
  })
  .strict();
void s;

export type AdvancedGeneratorSetup = z.infer<typeof advancedSetupSchema>;

const envelopeSchema = z
  .object({
    format: z.literal(ADVANCED_SETUP_FORMAT),
    schemaVersion: z.literal(ADVANCED_SETUP_SCHEMA_VERSION),
    exportedAt: z.string().max(64),
    setup: advancedSetupSchema,
  })
  .strict();

export function serializeAdvancedSetup(setup: AdvancedGeneratorSetup, now = new Date()): string {
  const clean = advancedSetupSchema.parse(setup);
  return JSON.stringify(
    {
      format: ADVANCED_SETUP_FORMAT,
      schemaVersion: ADVANCED_SETUP_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      setup: clean,
    },
    null,
    2,
  );
}

export function advancedSetupFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `promptbeats-advanced-setup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export type AdvancedSetupParseError = "invalid" | "version";

export function parseAdvancedSetup(
  text: string,
): { ok: true; setup: AdvancedGeneratorSetup } | { ok: false; error: AdvancedSetupParseError } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "invalid" };
  const obj = raw as Record<string, unknown>;
  if (obj.format !== ADVANCED_SETUP_FORMAT) return { ok: false, error: "invalid" };
  if (obj.schemaVersion !== ADVANCED_SETUP_SCHEMA_VERSION) return { ok: false, error: "version" };
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const setup = parsed.data.setup;
  return {
    ok: true,
    setup: {
      ...setup,
      songBlueprint: buildSongBlueprint(setup.songStructure, setup.songBlueprint),
    },
  };
}

/** Splits selected values into known chips and a merged custom string so no user data is dropped. */
export function splitKnownValues(
  selected: string[],
  known: readonly string[],
  custom: string,
): { selected: string[]; custom: string } {
  const keep = selected.filter((v) => known.includes(v));
  const extra = selected.filter((v) => !known.includes(v) && v.trim());
  const existing = custom.trim();
  const missing = extra.filter((v) => !existing.includes(v));
  return {
    selected: keep,
    custom: [existing, ...missing].filter(Boolean).join(", "),
  };
}
