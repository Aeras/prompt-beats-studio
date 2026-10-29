import { ADVANCED_MUSIC_STYLES, ADVANCED_MOODS, INSTRUMENTS } from "../catalog/generator-options";
import { advancedSetupSchema, type AdvancedGeneratorSetup } from "./advanced-generator-setup";
import { buildSongBlueprint } from "./song-blueprint.shared";
import { z } from "zod";
import { inspirationProposalSchema, type InspirationResearch } from "./music-inspiration.shared";

// Exact catalog membership only. Do not use splitKnownValues here: its legacy
// substring de-duplication can discard a short suggestion inside a longer one.
function visibleInspirationValues(values: string[], known: readonly string[], custom: string) {
  const selected = values.filter((value) => known.includes(value));
  const extra = values.filter((value) => !known.includes(value));
  return { selected, custom: [custom, ...extra].filter((value) => value.length > 0).join(", ") };
}
/** Deterministic enrichment for discrete catalog values.
 * Keeps all creator values in order, appends only new case/space-equivalent items.
 * Never guesses synonyms or silently rewrites conflicting free-form instructions.
 * A bounded planner must validate the final Generator setup before committing.
 */
export function mergeInspirationList(current: readonly string[], incoming: readonly string[]): string[] {
  const result = [...current];
  const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\\s+/g, " ").toLocaleLowerCase("en");
  const seen = new Set(result.map(normalize));
  for (const value of incoming) {
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

const inspirationStyles = ADVANCED_MUSIC_STYLES.filter((option) => option.id !== "custom").map(
  (option) => option.value,
);
const inspirationMoods = ADVANCED_MOODS.map((option) => option.value);
const inspirationInstruments = INSTRUMENTS.map((option) => option.value);

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
  "selectedMusicStyles",
  "selectedMoods",
  "selectedInstruments",
  "bpm",
  "productionStyle",
  "additionalInstructions",
  "arrangement",
];

export type InspirationApplyMode = "fill_empty" | "replace_selected";
export type InspirationApplyResult = {
  setup: AdvancedGeneratorSetup;
  appliedFields: InspirationApplyField[];
  skippedFields: InspirationApplyField[];
  receipt?: InspirationApplyReceipt;
};

export function applyInspirationProposal(
  current: AdvancedGeneratorSetup,
  proposal: InspirationResearch["proposal"],
  selected: readonly InspirationApplyField[] = INSPIRATION_APPLY_FIELDS,
  mode: InspirationApplyMode = "fill_empty",
): InspirationApplyResult {
  proposal = inspirationProposalSchema.parse(proposal);
  z.enum(["fill_empty", "replace_selected"]).parse(mode);
  z.array(z.enum(INSPIRATION_APPLY_FIELDS as [InspirationApplyField, ...InspirationApplyField[]]))
    .refine((v) => new Set(v).size === v.length)
    .parse(selected);
  const original = advancedSetupSchema.parse(current);
  const next: AdvancedGeneratorSetup = structuredClone(original);
  const appliedFields: InspirationApplyField[] = [];
  const skippedFields: InspirationApplyField[] = [];
  const enabled = new Set(selected);
  const permitted = (key: InspirationApplyField, isEmpty: boolean): boolean =>
    enabled.has(key) && (mode === "replace_selected" || isEmpty);
  const check = (
    key: InspirationApplyField,
    empty: boolean,
    hasProposal: boolean,
    apply: () => void,
  ) => {
    if (!enabled.has(key)) return;
    if (hasProposal && permitted(key, empty)) {
      apply();
      appliedFields.push(key);
    } else {
      skippedFields.push(key);
    }
  };

  check(
    "selectedMusicStyles",
    next.selectedMusicStyles.length === 0 && !next.customMusicStyle.trim(),
    proposal.musicStyles.length > 0,
    () => {
      const visible = visibleInspirationValues(
        proposal.musicStyles,
        inspirationStyles,
        mode === "replace_selected" ? "" : next.customMusicStyle,
      );
      next.selectedMusicStyles = visible.selected;
      next.customMusicStyle = visible.custom;
    },
  );
  check(
    "selectedMoods",
    next.selectedMoods.length === 0 && !next.customMood.trim(),
    proposal.moods.length > 0,
    () => {
      const visible = visibleInspirationValues(
        proposal.moods,
        inspirationMoods,
        mode === "replace_selected" ? "" : next.customMood,
      );
      next.selectedMoods = visible.selected;
      next.customMood = visible.custom;
    },
  );
  check(
    "selectedInstruments",
    next.selectedInstruments.length === 0 && !next.customInstruments.trim(),
    proposal.instruments.length > 0,
    () => {
      const visible = visibleInspirationValues(
        proposal.instruments,
        inspirationInstruments,
        mode === "replace_selected" ? "" : next.customInstruments,
      );
      next.selectedInstruments = visible.selected;
      next.customInstruments = visible.custom;
    },
  );
  check(
    "bpm",
    !next.customBpm.trim() && ["", "auto", "Auto"].includes(next.bpmMode),
    proposal.bpm != null,
    () => {
      next.bpmMode = "Custom";
      next.customBpm = String(proposal.bpm);
    },
  );
  check("productionStyle", !next.productionStyle.trim(), !!proposal.productionStyle.trim(), () => {
    next.productionStyle = proposal.productionStyle;
  });
  check(
    "additionalInstructions",
    !next.additionalInstructions.trim(),
    !!proposal.additionalInstructions.trim(),
    () => {
      next.additionalInstructions = proposal.additionalInstructions;
    },
  );
  const validArrangement =
    proposal.songStructure.length > 0 &&
    proposal.songStructure.length === proposal.blueprint.length &&
    proposal.songStructure.every(
      (sectionType, i) =>
        proposal.blueprint[i]?.structureIndex === i &&
        proposal.blueprint[i]?.sectionType === sectionType,
    );
  check(
    "arrangement",
    next.songStructure.length === 0 && next.songBlueprint.length === 0,
    validArrangement,
    () => {
      next.songStructure = [...proposal.songStructure];
      next.songBlueprint = buildSongBlueprint(
        proposal.songStructure,
        proposal.blueprint.map((entry) => ({
          structureIndex: entry.structureIndex,
          sectionType: entry.sectionType,
          occurrence: proposal.songStructure
            .slice(0, entry.structureIndex + 1)
            .filter(
              (label) => label.trim().toLowerCase() === entry.sectionType.trim().toLowerCase(),
            ).length,
          instruction: entry.instruction,
          energy: entry.energy as 1 | 2 | 3 | 4 | 5 | null,
          sectionId:
            original.songBlueprint.find(
              (s) =>
                s.sectionType === entry.sectionType &&
                s.occurrence ===
                  proposal.songStructure
                    .slice(0, entry.structureIndex + 1)
                    .filter(
                      (label) =>
                        label.trim().toLowerCase() === entry.sectionType.trim().toLowerCase(),
                    ).length,
            )?.sectionId ?? `inspiration-${crypto.randomUUID()}`,
        })),
      );
    },
  );
  // Strictly validate and do not ever mutate the supplied setup on failure.
  const setup = advancedSetupSchema.parse(next);
  return {
    setup,
    appliedFields,
    skippedFields,
    receipt: {
      version: 1,
      before: original,
      after: structuredClone(setup),
      appliedFields: [...appliedFields],
    },
  };
}

const ownedKeys: Record<InspirationApplyField, (keyof AdvancedGeneratorSetup)[]> = {
  selectedMusicStyles: ["selectedMusicStyles", "customMusicStyle"],
  selectedMoods: ["selectedMoods", "customMood"],
  selectedInstruments: ["selectedInstruments", "customInstruments"],
  bpm: ["bpmMode", "customBpm"],
  productionStyle: ["productionStyle"],
  additionalInstructions: ["additionalInstructions"],
  arrangement: ["songStructure", "songBlueprint"],
};
export type InspirationApplyReceipt = {
  version: 1;
  before: AdvancedGeneratorSetup;
  after: AdvancedGeneratorSetup;
  appliedFields: InspirationApplyField[];
};
/** Atomic field-group undo: a differing snapshot preserves the whole group.
 * Snapshot comparison cannot detect ABA edits (manual change then return to after).
 * Callers must invalidate receipt ownership on EVERY manual edit, including edits
 * outside the research panel, imports and presets. Apply receipt.after exactly;
 * further normalization would invalidate the snapshot used for undo.
 */
export function undoInspirationProposal(
  current: AdvancedGeneratorSetup,
  receipt: InspirationApplyReceipt,
): {
  setup: AdvancedGeneratorSetup;
  restoredFields: InspirationApplyField[];
  ambiguousFields: InspirationApplyField[];
} {
  const parsed = z
    .object({
      version: z.literal(1),
      before: advancedSetupSchema,
      after: advancedSetupSchema,
      appliedFields: z
        .array(
          z.enum(INSPIRATION_APPLY_FIELDS as [InspirationApplyField, ...InspirationApplyField[]]),
        )
        .refine((v) => new Set(v).size === v.length),
    })
    .strict()
    .parse(receipt);
  const setup = structuredClone(advancedSetupSchema.parse(current));
  const restoredFields: InspirationApplyField[] = [],
    ambiguousFields: InspirationApplyField[] = [];
  for (const field of parsed.appliedFields) {
    const keys = ownedKeys[field];
    if (keys.some((key) => JSON.stringify(setup[key]) !== JSON.stringify(parsed.after[key]))) {
      ambiguousFields.push(field);
      continue;
    }
    for (const key of keys) Object.assign(setup, { [key]: structuredClone(parsed.before[key]) });
    restoredFields.push(field);
  }
  return { setup: advancedSetupSchema.parse(setup), restoredFields, ambiguousFields };
}
