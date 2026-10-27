import { z } from "zod";
import { atlasHandoffSchema, type AtlasHandoff } from "./song-atlas.shared";
import {
  advancedSetupSchema,
  serializeAdvancedSetup,
  type AdvancedGeneratorSetup,
} from "./advanced-generator-setup";

/** Ownership is structural, never inferred from text equality or substring matching.
 * Imported/local provenance is not authorization: server/SQL/worker revalidation still applies. */
export const atlasInstructionLayerSchema = z
  .object({
    format: z.literal("promptbeats-atlas-instructions"),
    schemaVersion: z.literal(1),
    origin: atlasHandoffSchema,
    text: z.string().min(1).max(1600),
    verifiedText: z.string().min(1).max(1600),
    creativeTechniques: z.string().max(1600),
  })
  .strict()
  .refine(
    (layer) => layer.text === layer.verifiedText,
    "Edited Atlas text has ambiguous ownership; retain it as manual text instead.",
  );
export type AtlasInstructionLayer = z.infer<typeof atlasInstructionLayerSchema>;
export function createAtlasInstructionLayer(verified: {
  handoff: AtlasHandoff;
  instructions: string;
  creativeTechniques: string;
}): AtlasInstructionLayer {
  return atlasInstructionLayerSchema.parse({
    format: "promptbeats-atlas-instructions",
    schemaVersion: 1,
    origin: verified.handoff,
    text: verified.instructions,
    verifiedText: verified.instructions,
    creativeTechniques: verified.creativeTechniques,
  });
}
export function restoreAtlasInstructionLayer(raw: unknown): AtlasInstructionLayer | null {
  if (raw == null) return null;
  return atlasInstructionLayerSchema.parse(raw);
}
export function composeAtlasInstructions(
  manual: string,
  layer: AtlasInstructionLayer | null,
): string {
  if (!layer) return manual;
  const valid = atlasInstructionLayerSchema.parse(layer);
  const composed = manual ? manual + "\n\n" + valid.text : valid.text;
  if (composed.length > 2000)
    throw new Error(
      "Manual and Atlas instructions exceed 2000 characters. Shorten your selections; nothing was removed.",
    );
  return composed;
}
export function replaceAtlasInstructionLayer(
  current: AtlasInstructionLayer | null,
  next: AtlasInstructionLayer,
): AtlasInstructionLayer {
  const valid = atlasInstructionLayerSchema.parse(next);
  return current && JSON.stringify(current) === JSON.stringify(valid) ? current : valid;
}
const atlasSetupSchema = z
  .object({
    format: z.literal("promptbeats-advanced-generator-atlas"),
    schemaVersion: z.literal(1),
    exportedAt: z.string().max(64),
    setup: advancedSetupSchema,
    atlas: atlasInstructionLayerSchema,
  })
  .strict();
export function serializeAtlasAwareSetup(
  setup: AdvancedGeneratorSetup,
  layer: AtlasInstructionLayer | null,
  now = new Date(),
): string {
  if (!layer) return serializeAdvancedSetup(setup, now);
  return JSON.stringify(
    atlasSetupSchema.parse({
      format: "promptbeats-advanced-generator-atlas",
      schemaVersion: 1,
      exportedAt: now.toISOString(),
      setup,
      atlas: layer,
    }),
    null,
    2,
  );
}
export function parseAtlasAwareSetup(
  text: string,
):
  | { kind: "ordinary" }
  | { kind: "atlas"; setup: AdvancedGeneratorSetup; layer: AtlasInstructionLayer }
  | { kind: "invalid" } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: "ordinary" };
  }
  if (
    !raw ||
    typeof raw !== "object" ||
    !("format" in raw) ||
    raw.format !== "promptbeats-advanced-generator-atlas"
  )
    return { kind: "ordinary" };
  const result = atlasSetupSchema.safeParse(raw);
  return result.success
    ? { kind: "atlas", setup: result.data.setup, layer: result.data.atlas }
    : { kind: "invalid" };
}
