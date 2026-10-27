import { z } from "zod";
export const ATLAS_SOURCE_SHA = "fa363996a89fe2b475bd75330f4eaa01531c8ed4f7a32669ebe64e2e963d925a";
export const ATLAS_HANDOFF_KEY = "pb:atlas-handoff:v1";
export const ATLAS_DIMENSIONS = [
  "lyrics_language",
  "cultural_scope",
  "genre",
  "era",
  "instruments",
  "mood",
  "vocals",
  "groove",
  "creative_technique",
  "narrative",
] as const;
export type AtlasDimension = (typeof ATLAS_DIMENSIONS)[number];
const id = z.string().min(1).max(160);
export const atlasSelectionSchema = z
  .object({ profileIds: z.array(id).max(8), optionIds: z.array(id).max(24) })
  .strict()
  .superRefine((s, ctx) => {
    if (
      new Set(s.profileIds).size !== s.profileIds.length ||
      new Set(s.optionIds).size !== s.optionIds.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate selection" });
  });
export type AtlasSelection = z.infer<typeof atlasSelectionSchema>;
export type AtlasOption = {
  id: string;
  profileId: string | null;
  dimension: AtlasDimension;
  label: string;
  instruction: string;
  approved: boolean;
  exclusiveGroup: string | null;
  lyricsLanguage: string | null;
};
export type AtlasCard = {
  id: string;
  name: string;
  summary: string;
  entityType: string;
  contextOnly: boolean;
  families: string[];
  knowledge: { dimension: string; text: string | null; evidence: string }[];
  claims: {
    id: string;
    text: string;
    sourceIds: string[];
    review: string;
    scopeWarning: boolean;
  }[];
  techniqueIds: string[];
};
export type AtlasCatalog = {
  sourceSha: string;
  researchOnly: true;
  cards: AtlasCard[];
  options: AtlasOption[];
  sources: { id: string; title: string; url: string | null }[];
  candidateCount: number;
};
export const atlasHandoffSchema = z
  .object({
    format: z.literal("promptbeats-atlas-handoff"),
    schemaVersion: z.literal(1),
    id: z.string().guid(),
    sourceSha: z.literal(ATLAS_SOURCE_SHA),
    selection: atlasSelectionSchema,
  })
  .strict();
export type AtlasHandoff = z.infer<typeof atlasHandoffSchema>;
export function inspectAtlasSelection(selection: AtlasSelection, catalog: AtlasCatalog) {
  const s = atlasSelectionSchema.parse(selection);
  if (s.profileIds.some((id) => !catalog.cards.some((c) => c.id === id)))
    throw new Error("Unknown Atlas profile");
  const options = s.optionIds.map((id) => {
    const o = catalog.options.find((o) => o.id === id);
    if (!o || (o.profileId && !s.profileIds.includes(o.profileId)))
      throw new Error("Unknown or unselected Atlas option");
    return o;
  });
  const groups = new Set<string>();
  const conflicts: string[] = [];
  for (const o of options) {
    if (o.exclusiveGroup) {
      if (groups.has(o.exclusiveGroup)) conflicts.push(o.exclusiveGroup);
      groups.add(o.exclusiveGroup);
    }
  }
  const language = options.find((o) => o.dimension === "lyrics_language")?.label;
  if (options.some((o) => o.lyricsLanguage && o.lyricsLanguage !== language))
    conflicts.push("lyrics_language");
  return {
    options,
    conflicts: [...new Set(conflicts)],
    unapproved: options.filter((o) => !o.approved).map((o) => o.id),
  };
}
/** No profile/category DNA is compiled. Only individually approved, selected options. */
export function compileAtlasSelection(selection: AtlasSelection, catalog: AtlasCatalog) {
  const checked = inspectAtlasSelection(selection, catalog);
  if (checked.conflicts.length) throw new Error("Conflicting Atlas selections");
  if (checked.unapproved.length) throw new Error("Atlas options await independent validation");
  if (checked.options.some((o) => !o.instruction.trim()))
    throw new Error("Atlas option has no validated instruction");
  const instructions = checked.options.map((o) => o.instruction).join("\n");
  if (instructions.length > 1600) throw new Error("Atlas selection exceeds instruction limit");
  return {
    instructions,
    creativeTechniques: checked.options
      .filter((o) => o.dimension === "creative_technique")
      .map((o) => o.label)
      .join("\n"),
  };
}
/** Explicit confirmation is required; preserve all existing instructions and other fields. */
export function mergeAtlasInstructions(existing: string, addition: string) {
  if (!addition || existing.includes(addition)) return existing;
  const next = existing ? existing + "\n\n" + addition : addition;
  if (next.length > 2000)
    throw new Error("Existing instructions and Atlas selection exceed the limit");
  return next;
}
