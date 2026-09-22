import { z } from "zod";

export const songBlueprintSectionSchema = z.object({
  // Legacy snapshots do not have sectionId/energy. They stay optional at the
  // persisted-input boundary; normalized arrangement runtime state makes both
  // fields explicit before any identity-sensitive operation.
  sectionId: z.string().trim().min(1).max(120).optional(),
  structureIndex: z.number().int().min(0).max(39),
  sectionType: z.string().trim().min(1).max(80),
  occurrence: z.number().int().positive().max(40),
  instruction: z.string().max(800).default(""),
  energy: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]).nullable().optional(),
});

export const songBlueprintSchema = z.array(songBlueprintSectionSchema).max(40).default([]);

export type SongBlueprintSection = z.infer<typeof songBlueprintSectionSchema>;

export function buildSongBlueprint(
  structure: string[],
  previous: SongBlueprintSection[] = [],
): SongBlueprintSection[] {
  const seen = new Map<string, number>();
  return structure.slice(0, 40).map((sectionType, structureIndex) => {
    const normalized = sectionType.trim().toLowerCase();
    const occurrence = (seen.get(normalized) ?? 0) + 1;
    seen.set(normalized, occurrence);
    const existing = previous.find(
      (item) =>
        item.structureIndex === structureIndex &&
        item.sectionType === sectionType,
    );
    return {
      ...(existing?.sectionId ? { sectionId: existing.sectionId } : {}),
      structureIndex,
      sectionType,
      occurrence,
      instruction: existing?.instruction ?? "",
      ...(existing?.energy !== undefined ? { energy: existing.energy } : {}),
    };
  });
}

export function removeBlueprintSection(
  blueprint: SongBlueprintSection[],
  structureIndex: number,
): SongBlueprintSection[] {
  const next = blueprint
    .filter((item) => item.structureIndex !== structureIndex)
    .map((item) => ({
      ...item,
      structureIndex:
        item.structureIndex > structureIndex
          ? item.structureIndex - 1
          : item.structureIndex,
    }));
  return buildSongBlueprint(
    next.map((item) => item.sectionType),
    next,
  );
}

export function appendBlueprintSection(
  blueprint: SongBlueprintSection[],
  sectionType: string,
): SongBlueprintSection[] {
  return buildSongBlueprint(
    [...blueprint.map((item) => item.sectionType), sectionType],
    blueprint,
  );
}

export function updateBlueprintInstruction(
  blueprint: SongBlueprintSection[],
  structureIndex: number,
  instruction: string,
): SongBlueprintSection[] {
  return blueprint.map((item) =>
    item.structureIndex === structureIndex
      ? { ...item, instruction: instruction.slice(0, 800) }
      : item,
  );
}

export function applyInstructionToAllRegularChoruses(
  blueprint: SongBlueprintSection[],
  instruction: string,
): SongBlueprintSection[] {
  return blueprint.map((item) =>
    item.sectionType === "Chorus"
      ? { ...item, instruction: instruction.slice(0, 800) }
      : item,
  );
}

export function activeSongBlueprint(
  blueprint: SongBlueprintSection[],
): SongBlueprintSection[] {
  return blueprint.filter(
    (item) => item.instruction.trim().length > 0 || item.energy != null,
  );
}
