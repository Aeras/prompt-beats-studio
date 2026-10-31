import { z } from "zod";
import { advancedSetupSchema, type AdvancedGeneratorSetup } from "./advanced-generator-setup";
import { songBlueprintSectionSchema } from "./song-blueprint.shared";

/** Inert v2 staging only. Registry, digests, clock, identity and replay state MUST
 * come from a freshly authenticated server contract, never browser/import data.
 * This module neither verifies signatures nor authorizes generation. No live
 * registry is supplied. Parent must CAS/persist state and consume replay tokens
 * atomically; local snapshots are not evidence of authorization or ownership. */
const id = z.string().trim().min(1).max(120);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const unique = (values: string[]) => new Set(values).size === values.length;
const strings = (max: number) =>
  z.array(z.string().trim().min(1).max(1000)).max(max).refine(unique);
const section = songBlueprintSectionSchema.strict().extend({ sectionId: id });
const arrangementSchema = z
  .object({
    songStructure: z.array(z.string().trim().min(1).max(120)).max(40),
    songBlueprint: z.array(section).max(40),
  })
  .strict()
  .superRefine((pair, ctx) => {
    const seen = new Map<string, number>();
    if (
      pair.songStructure.length !== pair.songBlueprint.length ||
      !unique(pair.songBlueprint.map((s) => s.sectionId))
    )
      ctx.addIssue({ code: "custom", message: "Incomplete or duplicate arrangement identities" });
    pair.songStructure.forEach((label, index) => {
      const key = label.toLowerCase();
      const occurrence = (seen.get(key) ?? 0) + 1;
      seen.set(key, occurrence);
      const s = pair.songBlueprint[index];
      if (
        !s ||
        s.structureIndex !== index ||
        s.sectionType !== label ||
        s.occurrence !== occurrence
      )
        ctx.addIssue({ code: "custom", message: "Arrangement index/type/occurrence mismatch" });
    });
  });
const bpmSchema = z
  .object({
    bpmMode: z.literal("Custom"),
    customBpm: z
      .string()
      .regex(/^\d{2,3}$/)
      .refine((v) => +v >= 20 && +v <= 300),
  })
  .strict();
export const atlasStructuredMappingSchema = z
  .object({
    selectedMusicStyles: strings(24).optional(),
    selectedMoods: strings(24).optional(),
    selectedInstruments: strings(40).optional(),
    productionStyle: z.string().trim().min(1).max(4000).optional(),
    language: z.string().trim().min(1).max(40).optional(),
    additionalInstructions: z.string().trim().min(1).max(2000).optional(),
    bpm: bpmSchema.optional(),
    arrangement: z
      .object({
        mode: z.enum(["initialize", "specific-patch"]),
        before: arrangementSchema,
        after: arrangementSchema,
      })
      .strict()
      .superRefine((patch, ctx) => {
        if (patch.mode === "initialize" && patch.before.songStructure.length)
          ctx.addIssue({ code: "custom", message: "Initialize requires empty arrangement" });
        // Specific patches can change energy/instructions only, retaining exact IDs,
        // order and labels. Structural replacement of manual sections is unsupported.
        if (
          patch.mode === "specific-patch" &&
          !equal(
            patch.before.songBlueprint.map(({ instruction: _i, energy: _e, ...s }) => s),
            patch.after.songBlueprint.map(({ instruction: _i, energy: _e, ...s }) => s),
          )
        )
          ctx.addIssue({ code: "custom", message: "Patch must preserve section identities" });
      })
      .optional(),
  })
  .strict()
  .refine((m) => Object.values(m).some((v) => v !== undefined), "Empty mapping");
export const atlasReviewedProjectionSchema = z
  .object({
    schemaVersion: z.literal(2),
    profileId: id,
    techniqueId: id,
    sourceDigest: digest,
    projectionDigest: digest,
    sourceEvidence: z
      .array(z.object({ sourceId: id, locator: z.string().trim().min(1).max(1000) }).strict())
      .min(1)
      .max(40),
    approval: z
      .object({
        status: z.literal("approved"),
        reviewId: id,
        reviewerId: id,
        reviewedAt: z.number().int().nonnegative(),
        evidenceDigest: digest,
      })
      .strict(),
    conflictsWith: z.array(id).max(123).refine(unique),
    mapping: atlasStructuredMappingSchema,
  })
  .strict();
export const atlasStructuredHandoffSchema = z
  .object({
    format: z.literal("promptbeats-atlas-structured-transfer"),
    schemaVersion: z.literal(2),
    handoffId: id,
    accountId: id,
    sessionId: id,
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().nonnegative(),
    candidates: z.array(atlasReviewedProjectionSchema).min(1).max(24),
  })
  .strict()
  .refine(
    (h) =>
      h.expiresAt > h.issuedAt &&
      h.expiresAt - h.issuedAt <= 15 * 60 * 1000 &&
      unique(h.candidates.map((c) => c.techniqueId)),
    "Invalid lifetime or duplicate selections",
  );
const contextSchema = z
  .object({
    accountId: id,
    sessionId: id,
    now: z.number().int().nonnegative(),
    sourceDigest: digest,
    authorizedHandoff: atlasStructuredHandoffSchema,
    completedOwnership: z.lazy(() => ownershipSchema).optional(),
    registry: z
      .array(atlasReviewedProjectionSchema)
      .max(123)
      .refine((r) => unique(r.map((c) => c.techniqueId))),
    consumedHandoffIds: z.array(id).refine(unique),
    activeTechniqueIds: z.array(id).max(123).refine(unique),
  })
  .strict();
export type AtlasStructuredContext = z.infer<typeof contextSchema>;
export type AtlasStructuredHandoff = z.infer<typeof atlasStructuredHandoffSchema>;
export type AtlasReviewedProjection = z.infer<typeof atlasReviewedProjectionSchema>;
const units = [
  "selectedMusicStyles",
  "selectedMoods",
  "selectedInstruments",
  "productionStyle",
  "language",
  "additionalInstructions",
  "bpm",
  "arrangement",
] as const;
type Unit = (typeof units)[number];
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
function equal(a: unknown, b: unknown) {
  return canonical(a) === canonical(b);
}
const strictSetupSchema = advancedSetupSchema.extend({
  songBlueprint: z.array(songBlueprintSectionSchema.strict()).max(40),
});
function cleanSetup(raw: unknown): AdvancedGeneratorSetup {
  // Canonical legacy schema strips section extras: reject them before parsing.
  const setup = strictSetupSchema.parse(raw);
  return setup;
}
function read(setup: AdvancedGeneratorSetup, unit: Unit): unknown {
  if (unit === "bpm") return { bpmMode: setup.bpmMode, customBpm: setup.customBpm };
  if (unit === "arrangement")
    return { songStructure: setup.songStructure, songBlueprint: setup.songBlueprint };
  return setup[unit];
}
function write(setup: AdvancedGeneratorSetup, unit: Unit, value: unknown): AdvancedGeneratorSetup {
  return cleanSetup(
    unit === "bpm" || unit === "arrangement"
      ? { ...setup, ...(value as object) }
      : { ...setup, [unit]: value },
  );
}
function validate(raw: unknown, trusted: AtlasStructuredContext) {
  const h = atlasStructuredHandoffSchema.parse(raw);
  const c = contextSchema.parse(trusted);
  if (!equal(h, c.authorizedHandoff)) throw new Error("handoff-binding");
  if (c.activeTechniqueIds.some((id) => !c.registry.some((r) => r.techniqueId === id)))
    throw new Error("unknown-active-technique");
  if (h.accountId !== c.accountId || h.sessionId !== c.sessionId) throw new Error("identity");
  if (c.now < h.issuedAt || c.now >= h.expiresAt) throw new Error("expired-or-future");
  if (c.consumedHandoffIds.includes(h.handoffId)) throw new Error("replay");
  for (const candidate of h.candidates) {
    const approved = c.registry.find((r) => r.techniqueId === candidate.techniqueId);
    if (
      candidate.sourceDigest !== c.sourceDigest ||
      !approved ||
      !equal(candidate, approved) ||
      candidate.approval.reviewedAt > h.issuedAt
    )
      throw new Error("unapproved-or-stale-projection");
  }
  return { h, c };
}
export type AtlasTransferDecision = {
  techniqueId: string;
  unit: Unit;
  status: "added" | "unchanged" | "skipped";
  reason: string;
};
export type AtlasTransferPreview = {
  before: AdvancedGeneratorSetup;
  after: AdvancedGeneratorSetup;
  decisions: AtlasTransferDecision[];
};
/** Errors reject the entire request without mutating inputs; field conflicts skip. */
export function previewAtlasStructuredTransfer(
  rawSetup: unknown,
  rawHandoff: unknown,
  trusted: AtlasStructuredContext,
): AtlasTransferPreview {
  const { h, c } = validate(rawHandoff, trusted);
  const before = cleanSetup(rawSetup);
  let after = cleanSetup(before);
  const decisions: AtlasTransferDecision[] = [];
  for (const candidate of h.candidates) {
    const selected = [...h.candidates.map((s) => s.techniqueId), ...c.activeTechniqueIds];
    const conflict =
      candidate.conflictsWith.some((id) => selected.includes(id)) ||
      [
        ...h.candidates,
        ...c.registry.filter((r) => c.activeTechniqueIds.includes(r.techniqueId)),
      ].some((other) => other.conflictsWith.includes(candidate.techniqueId));
    for (const unit of units) {
      const desired = candidate.mapping[unit];
      if (desired === undefined) continue;
      const current = read(after, unit);
      let value: unknown = desired;
      let reason = conflict ? "technique-conflict" : "";
      if (unit === "language" && (after.customLanguage !== "" || after.languageVariant !== ""))
        reason ||= "manual-language-detail";
      if (unit === "arrangement") {
        const patch = candidate.mapping.arrangement!;
        value = patch.after;
        if (!equal(current, patch.before)) reason ||= "manual-arrangement";
      } else if (Array.isArray(current) && Array.isArray(desired)) {
        value = [...current, ...desired.filter((v) => !current.includes(v))];
      } else if (unit === "bpm") {
        if (!equal(current, desired) && !(after.bpmMode === "Auto" && after.customBpm === ""))
          reason ||= "manual-bpm";
      } else if (typeof current === "string" && current !== "" && current !== desired)
        reason ||= "manual-field";
      if (!reason) {
        try {
          const next = write(after, unit, value);
          after = next;
        } catch {
          reason = "limit-or-invalid";
        }
      }
      decisions.push({
        techniqueId: candidate.techniqueId,
        unit,
        status: reason ? "skipped" : equal(current, value) ? "unchanged" : "added",
        reason: reason || "validated",
      });
    }
  }
  return { before, after, decisions };
}
export type AtlasTransferOwnership = {
  schemaVersion: 2;
  handoff: AtlasStructuredHandoff;
  before: AdvancedGeneratorSetup;
  after: AdvancedGeneratorSetup;
  units: Unit[];
};
const ownershipSchema = z
  .object({
    schemaVersion: z.literal(2),
    handoff: atlasStructuredHandoffSchema,
    before: strictSetupSchema,
    after: strictSetupSchema,
    units: z.array(z.enum(units)).max(units.length).refine(unique),
  })
  .strict();
/** Caller must retain this receipt in trusted session state, not accept imports.
 * A completed retry is a read-only acknowledgement: consumeHandoffId is null.
 * It may acknowledge an expired/revoked transfer but never reapplies mappings.
 * No durable CAS, token consumption or signature verification happens here. */
export function applyAtlasStructuredTransfer(
  rawSetup: unknown,
  rawHandoff: unknown,
  trusted: AtlasStructuredContext,
  expectedPreview: AtlasTransferPreview,
  existing?: AtlasTransferOwnership,
): {
  setup: AdvancedGeneratorSetup;
  ownership: AtlasTransferOwnership;
  consumeHandoffId: string | null;
} {
  if (existing) {
    const c = contextSchema.parse(trusted);
    const h = atlasStructuredHandoffSchema.parse(rawHandoff);
    if (c.consumedHandoffIds.includes(h.handoffId)) {
      if (
        !c.completedOwnership ||
        !equal(existing, c.completedOwnership) ||
        !equal(h, c.authorizedHandoff) ||
        !equal(h, existing.handoff) ||
        h.accountId !== c.accountId ||
        h.sessionId !== c.sessionId
      )
        throw new Error("replay");
      return {
        setup: cleanSetup(rawSetup),
        ownership: ownershipSchema.parse(existing),
        consumeHandoffId: null,
      };
    }
    validate(rawHandoff, trusted);
    const original = applyAtlasStructuredTransfer(
      existing.before,
      rawHandoff,
      trusted,
      expectedPreview,
    );
    if (!equal(existing, original.ownership)) throw new Error("invalid-ownership");
    return { ...original, setup: cleanSetup(rawSetup), ownership: structuredClone(existing) };
  }
  const preview = previewAtlasStructuredTransfer(rawSetup, rawHandoff, trusted);
  if (!equal(preview, expectedPreview)) throw new Error("stale-preview");
  const handoff = atlasStructuredHandoffSchema.parse(rawHandoff);
  const ownership: AtlasTransferOwnership = {
    schemaVersion: 2,
    handoff,
    before: preview.before,
    after: preview.after,
    units: units.filter((u) => !equal(read(preview.before, u), read(preview.after, u))),
  };
  return {
    setup: preview.after,
    ownership: structuredClone(ownership),
    consumeHandoffId: handoff.handoffId,
  };
}
/** Whole-unit CAS is deliberately conservative: even an unrelated edit in an
 * owned array/pair is ambiguous. Never infer ownership by substring/value match.
 * Value snapshots cannot detect edit-then-restore (ABA) or identical-value manual
 * adoption; parent must track edits/invalidate ownership for those cases.
 * Removal remains possible after expiry/revocation, but only in the same session. */
export function removeAtlasStructuredTransfer(
  rawSetup: unknown,
  receipt: AtlasTransferOwnership,
  identity: { accountId: string; sessionId: string },
) {
  const owned = ownershipSchema.parse(receipt);
  z.object({ accountId: id, sessionId: id }).strict().parse(identity);
  if (
    owned.handoff.accountId !== identity.accountId ||
    owned.handoff.sessionId !== identity.sessionId
  )
    throw new Error("identity");
  const before = cleanSetup(owned.before),
    after = cleanSetup(owned.after);
  if (
    !equal(
      owned.units,
      units.filter((u) => !equal(read(before, u), read(after, u))),
    )
  )
    throw new Error("invalid-ownership");
  let setup = cleanSetup(rawSetup);
  const ambiguous: Unit[] = [];
  for (const unit of owned.units) {
    const current = read(setup, unit);
    if (equal(current, read(before, unit))) continue; // repeated removal
    if (!equal(current, read(after, unit))) {
      ambiguous.push(unit);
      continue;
    }
    setup = write(setup, unit, read(before, unit));
  }
  return {
    setup,
    status: ambiguous.length ? ("manual-remove-ambiguity" as const) : ("removed" as const),
    ambiguous,
  };
}
