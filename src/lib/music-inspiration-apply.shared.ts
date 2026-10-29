import { ADVANCED_MUSIC_STYLES, ADVANCED_MOODS, INSTRUMENTS } from "../catalog/generator-options";
import {
  advancedSetupSchema,
  ADVANCED_SETUP_MAX_BYTES,
  type AdvancedGeneratorSetup,
} from "./advanced-generator-setup";
import { buildSongBlueprint } from "./song-blueprint.shared";
import { z } from "zod";
import { inspirationProposalSchema, type InspirationResearch } from "./music-inspiration.shared";

const equivalent = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
/** Exact Unicode/case/space equivalence only; never substring/synonym deduplication. */
export function mergeInspirationList(
  current: readonly string[],
  incoming: readonly string[],
): string[] {
  const result = [...current],
    seen = new Set(current.map(equivalent));
  for (const value of incoming) {
    const key = equivalent(value);
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}
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
export type InspirationGroupAction = "keep" | "fill" | "add" | "replace";
export type InspirationApplyActions = Partial<
  Record<InspirationApplyField, InspirationGroupAction>
>;
export type InspirationGroupPlan = {
  field: InspirationApplyField;
  action: InspirationGroupAction;
  available: boolean;
  changed: boolean;
  destructive: boolean;
  current: Record<string, unknown>;
  proposed: Record<string, unknown>;
  next: Record<string, unknown>;
  issue: "length" | "conflict" | "unsupported" | null;
};
export type InspirationApplyPlan = {
  setup: AdvancedGeneratorSetup;
  groups: InspirationGroupPlan[];
  appliedFields: InspirationApplyField[];
  skippedFields: InspirationApplyField[];
  destructiveFields: InspirationApplyField[];
  blocked: boolean;
  receipt?: InspirationApplyReceipt;
};
export type InspirationApplyResult = Pick<
  InspirationApplyPlan,
  "setup" | "appliedFields" | "skippedFields" | "receipt"
>;
export const inspirationOwnedKeys: Record<
  InspirationApplyField,
  readonly (keyof AdvancedGeneratorSetup)[]
> = {
  selectedMusicStyles: ["selectedMusicStyles", "customMusicStyle"],
  selectedMoods: ["selectedMoods", "customMood"],
  selectedInstruments: ["selectedInstruments", "customInstruments"],
  bpm: ["bpmMode", "customBpm"],
  productionStyle: ["productionStyle"],
  additionalInstructions: ["additionalInstructions"],
  arrangement: ["songStructure", "songBlueprint"],
};
const pick = (setup: AdvancedGeneratorSetup, field: InspirationApplyField) =>
  Object.fromEntries(inspirationOwnedKeys[field].map((key) => [key, setup[key]]));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function populated(setup: AdvancedGeneratorSetup, field: InspirationApplyField): boolean {
  if (field === "bpm")
    return !!setup.customBpm.trim() || !["", "auto"].includes(setup.bpmMode.toLowerCase());
  return Object.values(pick(setup, field)).some((v) =>
    Array.isArray(v) ? v.length > 0 : typeof v === "string" && !!v.trim(),
  );
}
const catalogs = {
  selectedMusicStyles: ADVANCED_MUSIC_STYLES.filter((o) => o.id !== "custom").map((o) => o.value),
  selectedMoods: ADVANCED_MOODS.map((o) => o.value),
  selectedInstruments: INSTRUMENTS.map((o) => o.value),
};
const customs = {
  selectedMusicStyles: "customMusicStyle",
  selectedMoods: "customMood",
  selectedInstruments: "customInstruments",
} as const;
/** Only exact opposing clauses are identified. No semantic rewriting or silent conflict resolution. */
function contrary(current: string, incoming: string): boolean {
  const clauses = (s: string) =>
    s
      .split(/[\n.;]+/)
      .map(equivalent)
      .filter(Boolean)
      .map((s) => {
        const negative =
          /^(?:no |without |avoid |do not use |χωρίς |όχι |без |не использовать )/u.test(s);
        return {
          negative,
          body: s.replace(
            /^(?:no |without |avoid |do not use |use |add |χωρίς |όχι |без |не использовать )/u,
            "",
          ),
        };
      });
  return clauses(current).some((a) =>
    clauses(incoming).some((b) => a.body && a.body === b.body && a.negative !== b.negative),
  );
}
function enrichText(current: string, incoming: string): string {
  if (equivalent(current) === equivalent(incoming)) return current;
  const existing = new Set([equivalent(current), ...current.split(/\r?\n/).map(equivalent)]);
  const additions = incoming.split(/\r?\n/).filter((line) => {
    const key = equivalent(line);
    if (!key || existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  return additions.length
    ? [current, additions.join("\n")].filter((s) => s.length > 0).join("\n")
    : current;
}
/** The only planner: preview, confirmation, commit and receipt all consume this exact projection. */
export function planInspirationApplication(
  current: AdvancedGeneratorSetup,
  input: InspirationResearch["proposal"],
  actions: InspirationApplyActions,
): InspirationApplyPlan {
  const original = advancedSetupSchema.parse(current),
    proposal = inspirationProposalSchema.parse(input);
  z.partialRecord(
    z.enum(INSPIRATION_APPLY_FIELDS as [InspirationApplyField, ...InspirationApplyField[]]),
    z.enum(["keep", "fill", "add", "replace"]),
  ).parse(actions);
  const next = structuredClone(original);
  const values = {
    selectedMusicStyles: proposal.musicStyles,
    selectedMoods: proposal.moods,
    selectedInstruments: proposal.instruments,
  };
  const groups: InspirationGroupPlan[] = [];
  for (const field of INSPIRATION_APPLY_FIELDS) {
    const action = actions[field] ?? "keep",
      before = pick(original, field);
    const proposed = structuredClone(original);
    let available = false;
    if (field in catalogs) {
      const key = field as keyof typeof catalogs,
        incoming = values[key];
      available = incoming.some((v) => v.trim());
      proposed[key] = incoming.filter((v) => catalogs[key].includes(v));
      proposed[customs[key]] = incoming.filter((v) => !catalogs[key].includes(v)).join(", ");
    } else if (field === "bpm") {
      available = proposal.bpm !== null;
      if (
        available &&
        !(
          original.customBpm.trim() === String(proposal.bpm) &&
          original.bpmMode.toLowerCase() === "custom"
        )
      ) {
        proposed.bpmMode = "Custom";
        proposed.customBpm = String(proposal.bpm);
      }
    } else if (field === "arrangement") {
      available = proposal.songStructure.length > 0;
      proposed.songStructure = [...proposal.songStructure];
      proposed.songBlueprint = buildSongBlueprint(
        proposal.songStructure,
        proposal.blueprint.map((s, i) => {
          const previous = original.songBlueprint.find(
            (p) => p.structureIndex === i && p.sectionType === s.sectionType,
          );
          return {
            ...s,
            occurrence: proposal.songStructure
              .slice(0, i + 1)
              .filter((label) => equivalent(label) === equivalent(s.sectionType)).length,
            ...(previous
              ? previous.sectionId
                ? { sectionId: previous.sectionId }
                : {}
              : { sectionId: "inspiration-section-" + i }),
            energy: s.energy as 1 | 2 | 3 | 4 | 5 | null,
          };
        }),
      );
    } else if (field === "productionStyle" || field === "additionalInstructions") {
      available = !!proposal[field].trim();
      proposed[field] = proposal[field];
    }
    const group: InspirationGroupPlan = {
      field,
      action,
      available,
      changed: false,
      destructive: false,
      current: before,
      proposed: pick(proposed, field),
      next: before,
      issue: null,
    };
    const candidate = structuredClone(next);
    if (action !== "keep" && available && !(action === "fill" && populated(original, field))) {
      if (action === "add" && (field === "bpm" || field === "arrangement"))
        group.issue = "unsupported";
      else if (action === "add" && field in catalogs) {
        const key = field as keyof typeof catalogs,
          custom = customs[key];
        if (contrary([...original[key], original[custom]].join("\n"), values[key].join("\n")))
          group.issue = "conflict";
        const seen = [...original[key], ...original[custom].split(",")];
        const additions = mergeInspirationList(seen, values[key]).slice(seen.length);
        candidate[key] = [...original[key], ...additions.filter((v) => catalogs[key].includes(v))];
        candidate[custom] = [
          original[custom],
          ...additions.filter((v) => !catalogs[key].includes(v)),
        ]
          .filter((s) => s.length > 0)
          .join(", ");
      } else if (
        action === "add" &&
        (field === "productionStyle" || field === "additionalInstructions")
      ) {
        if (contrary(original[field], proposal[field])) group.issue = "conflict";
        else candidate[field] = enrichText(original[field], proposal[field]);
      } else Object.assign(candidate, pick(proposed, field));
      if (!group.issue) {
        if (
          !advancedSetupSchema.safeParse(candidate).success ||
          new TextEncoder().encode(JSON.stringify(candidate)).length > ADVANCED_SETUP_MAX_BYTES
        )
          group.issue = "length";
        else {
          group.next = pick(candidate, field);
          group.changed = !same(before, group.next);
          group.destructive = group.changed && action === "replace" && populated(original, field);
          Object.assign(next, group.next);
        }
      }
    }
    groups.push(group);
  }
  const appliedFields = groups.filter((g) => g.changed).map((g) => g.field),
    blocked = groups.some((g) => !!g.issue);
  return {
    setup: next,
    groups,
    appliedFields,
    skippedFields: groups.filter((g) => g.action !== "keep" && !g.changed).map((g) => g.field),
    destructiveFields: groups.filter((g) => g.destructive).map((g) => g.field),
    blocked,
    ...(!blocked && appliedFields.length
      ? {
          receipt: {
            version: 1 as const,
            before: original,
            after: structuredClone(next),
            appliedFields: [...appliedFields],
          },
        }
      : {}),
  };
}
export function applyInspirationProposal(
  current: AdvancedGeneratorSetup,
  proposal: InspirationResearch["proposal"],
  selected: readonly InspirationApplyField[] = INSPIRATION_APPLY_FIELDS,
  mode: InspirationApplyMode = "fill_empty",
): InspirationApplyResult {
  z.enum(["fill_empty", "replace_selected"]).parse(mode);
  z.array(z.enum(INSPIRATION_APPLY_FIELDS as [InspirationApplyField, ...InspirationApplyField[]]))
    .refine((v) => new Set(v).size === v.length)
    .parse(selected);
  const plan = planInspirationApplication(
    current,
    proposal,
    Object.fromEntries(selected.map((f) => [f, mode === "fill_empty" ? "fill" : "replace"])),
  );
  if (plan.blocked) throw new Error("inspiration_apply_conflict");
  return plan;
}

const ownedKeys = inspirationOwnedKeys;
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

/** Confirmation binds real consequences and target-group edit epochs, including ABA. */
export function inspirationPlanSignature(
  source: unknown,
  plan: InspirationApplyPlan,
  versions: Record<InspirationApplyField, number>,
): string {
  return JSON.stringify({
    source,
    groups: plan.groups
      .filter((g) => g.changed)
      .map((g) => ({
        field: g.field,
        action: g.action,
        current: g.current,
        next: g.next,
        version: versions[g.field],
      })),
    blocked: plan.blocked,
  });
}
