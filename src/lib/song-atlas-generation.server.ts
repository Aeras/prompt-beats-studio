import { atlasHandoffSchema, compileAtlasSelection, type AtlasHandoff } from "./song-atlas.shared";
export async function validateAtlasGenerationOrigin(
  origin: AtlasHandoff,
  caller?: { rpc: (...args: any[]) => any },
) {
  const parsed = atlasHandoffSchema.parse(origin);
  if (caller) {
    const { error } = await caller.rpc("atlas_preview_admission");
    if (error) throw new Error("Atlas not available.");
  }
  if (!parsed.selection.optionIds.length)
    throw new Error("Atlas transfer needs validated options.");
  const { readAtlasCatalog } = await import("./song-atlas-data.server");
  return compileAtlasSelection(parsed.selection, readAtlasCatalog());
}
