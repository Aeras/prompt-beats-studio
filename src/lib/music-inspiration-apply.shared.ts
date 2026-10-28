import { advancedSetupSchema, type AdvancedGeneratorSetup } from "./advanced-generator-setup";
import { buildSongBlueprint } from "./song-blueprint.shared";
import type { InspirationResearch } from "./music-inspiration.shared";

/** This function only prepares a local draft; it does not authorize research or generation. */
export type InspirationApplyField =
  | "selectedMusicStyles"
  | "selectedMoods"
  | "selectedInstruments"
  | "bpm"
  | "productionStyle"
  | "additionalInstructions"
  | "arrangement";

export const INSPIRATION_APPLY_FIELDS: readonly InspirationApplyField[] = [
  "selectedMusicStyles", "selectedMoods", "selectedInstruments",
  "bpm", "productionStyle", "additionalInstructions", "arrangement",
];

export type InspirationApplyMode = "fill_empty" | "replace_selected";
export type InspirationApplyResult = {
  setup: AdvancedGeneratorSetup;
  appliedFields: InspirationApplyField[];
  skippedFields: InspirationApplyField[];
};

export function applyInspirationProposal(
  current: AdvancedGeneratorSetup,
  proposal: InspirationResearch["proposal"],
  selected: readonly InspirationApplyField[] = INSPIRATION_APPLY_FIELDS,
  mode: InspirationApplyMode = "fill_empty",
): InspirationApplyResult {
  const original = advancedSetupSchema.parse(current);
  const next: AdvancedGeneratorSetup = structuredClone(original);
  const appliedFields: InspirationApplyField[] = [];
  const skippedFields: InspirationApplyField[] = [];
  const enabled = new Set(selected);
  const permitted = (key: InspirationApplyField, isEmpty: boolean): boolean =>
    enabled.has(key) && (mode === "replace_selected" || isEmpty);
  const check = (key: InspirationApplyField, empty: boolean, hasProposal: boolean, apply: () => void) => {
    if (!enabled.has(key)) return;
    if (hasProposal && permitted(key, empty)) {
      apply();
      appliedFields.push(key);
    } else {
      skippedFields.push(key);
    }
  };

  check("selectedMusicStyles", next.selectedMusicStyles.length === 0 && !next.customMusicStyle.trim(),
    proposal.musicStyles.length > 0, () => { next.selectedMusicStyles = [...proposal.musicStyles]; });
  check("selectedMoods", next.selectedMoods.length === 0 && !next.customMood.trim(),
    proposal.moods.length > 0, () => { next.selectedMoods = [...proposal.moods]; });
  check("selectedInstruments", next.selectedInstruments.length === 0 && !next.customInstruments.trim(),
    proposal.instruments.length > 0, () => { next.selectedInstruments = [...proposal.instruments]; });
  check("bpm", !next.customBpm.trim() && next.bpmMode !== "custom",
    proposal.bpm != null, () => {
      next.bpmMode = "custom";
      next.customBpm = String(proposal.bpm);
    });
  check("productionStyle", !next.productionStyle.trim(),
    !!proposal.productionStyle.trim(), () => { next.productionStyle = proposal.productionStyle; });
  check("additionalInstructions", !next.additionalInstructions.trim(),
    !!proposal.additionalInstructions.trim(), () => {
      next.additionalInstructions = proposal.additionalInstructions;
    });
  const validArrangement = proposal.songStructure.length > 0 &&
    proposal.songStructure.length === proposal.blueprint.length &&
    proposal.songStructure.every((sectionType, i) =>
      proposal.blueprint[i]?.structureIndex === i && proposal.blueprint[i]?.sectionType === sectionType);
  check("arrangement", next.songStructure.length === 0 && next.songBlueprint.length === 0,
    validArrangement, () => {
      next.songStructure = [...proposal.songStructure];
      next.songBlueprint = buildSongBlueprint(
        proposal.songStructure,
        proposal.blueprint.map((entry) => ({
          structureIndex: entry.structureIndex,
          sectionType: entry.sectionType,
          occurrence: proposal.songStructure
            .slice(0, entry.structureIndex + 1)
            .filter((label) => label.trim().toLowerCase() === entry.sectionType.trim().toLowerCase()).length,
          instruction: entry.instruction,
          energy: entry.energy as 1 | 2 | 3 | 4 | 5,
        })),
      );
    });
  // Strictly validate and do not ever mutate the supplied setup on failure.
  return { setup: advancedSetupSchema.parse(next), appliedFields, skippedFields };
}
