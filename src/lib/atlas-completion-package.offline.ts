/** Local review tooling only. Never import this archive/loader into an app entrypoint. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { unzipSync } from "fflate";
import { z } from "zod";
import { validateAtlasV4 } from "./song-atlas-v4";
import { validateAtlasTechniqueReview } from "./atlas-technique-review";

export const ATLAS_COMPLETION_ZIP_SHA =
  "85c42846ed23902a65630af811ff7302a1f4c664bdae7004396610b5292efa20";
export const ATLAS_STEP4C_SHA = "3a0f8c079b6be50d27f9e461cfc7b370ff61f41429173de80500bdc12c59b0dc";
const text = z.string().min(1);
const field = z.enum(["additionalInstructions", "customInstruments", "productionStyle"]);
const technique = z
  .object({
    techniqueId: text,
    profileId: text,
    qualityRevisionStep2: z
      .object({
        originalUnmodified: z.literal(true),
        generatorEnabled: z.literal(false),
        ownerApproval: z.literal(false),
        updatedInstructionEN: z.string().nullable(),
      })
      .passthrough(),
    generatorMappingStep3: z
      .object({
        mappingStatus: z.enum([
          "manual_import_candidate_unverified",
          "hold_example_required",
          "context_only_no_injection",
          "hold_pilot_redesign",
        ]),
        primaryDimension: text,
        inputField: field.nullable(),
        candidateInstructionEN: z.string().nullable(),
        syntheticManualImportOnly: z.boolean(),
      })
      .passthrough(),
  })
  .passthrough();
const pair = z
  .object({
    leftTechniqueId: text,
    rightTechniqueId: text,
    leftProfileId: text,
    rightProfileId: text,
    sameProfile: z.boolean(),
    reviewState: z.enum(["editorial_screened_same_profile", "not_semantically_reviewed"]),
    editorialCandidateDecision: z.enum([
      "conditional_coexistence_candidate",
      "overlapping_redundancy_candidate",
      "unknown_needs_pair_specific_review",
    ]),
    hardConflictVerified: z.literal(false),
    compatibleVerified: z.literal(false),
    requiresExplicitOptIn: z.literal(true),
    requiresPairSpecificFixture: z.literal(true),
  })
  .passthrough();
const pilot = z
  .object({
    caseId: text,
    techniqueId: text,
    targetInputField: field,
    instructionEN: text,
    paidCalls: z.literal(0),
    audioGenerated: z.literal(false),
  })
  .passthrough();
const documentSchema = z
  .object({
    globallyApproved: z.literal(false),
    generatorTransfer: z.literal(false),
    techniques: z.array(technique).length(123),
    compatibilityCompletionStep4c: z
      .object({
        candidateTechniques: z.literal(107),
        allCandidatePairs: z.literal(5671),
        sameProfileEditorialScreened: z.literal(57),
        otherPairsNotSemanticallyReviewed: z.literal(5614),
        previousPriorityCrossProfileNotSemanticallyReviewed: z.literal(975),
        confirmedConflicts: z.literal(0),
        confirmedCompatible: z.literal(0),
        pairs: z.array(pair).length(5671),
        pilotFixtures: z.array(pilot).length(10),
        offlinePolicyChecks: z.array(z.object({ name: text, pass: z.literal(true) })).length(16),
        providerCalls: z.literal(0),
        productionActivation: z.literal(false),
      })
      .passthrough(),
  })
  .passthrough();
export type OfflineAtlasTechnique = z.infer<typeof technique>;
export type OfflineAtlasPilot = z.infer<typeof pilot>;
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const key = (a: string, b: string) => [a, b].sort().join("\0");
const json = (bytes: Uint8Array): unknown =>
  JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));

/** Byte identity is integrity evidence, not musical or production approval. */
export function validateAtlasCompletionArchive(bytes: Uint8Array) {
  if (bytes.length > 4 * 1024 * 1024 || sha(bytes) !== ATLAS_COMPLETION_ZIP_SHA)
    throw new Error("completion_archive_integrity");
  const files = unzipSync(bytes);
  const manifest = z
    .object({
      files: z
        .array(
          z.object({
            filename: text.regex(/^PromptBeats_[A-Za-z0-9_.-]+$/),
            bytes: z
              .number()
              .int()
              .positive()
              .max(10 * 1024 * 1024),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          }),
        )
        .length(12),
    })
    .parse(json(files["MANIFEST.sha256.json"]!));
  if (
    Object.keys(files).length !== 13 ||
    new Set(manifest.files.map((f) => f.filename)).size !== 12
  )
    throw new Error("completion_archive_members");
  for (const f of manifest.files)
    if (
      !files[f.filename] ||
      files[f.filename]!.length !== f.bytes ||
      sha(files[f.filename]!) !== f.sha256
    )
      throw new Error("completion_member_integrity");
  const read = (suffix: string) => {
    const name = manifest.files.find((f) => f.filename.endsWith(suffix))?.filename;
    if (!name) throw new Error("completion_member_missing");
    return json(files[name]!);
  };
  const stages = [
    "Quality_Revision_Step2_20261031.json",
    "Generator_Mapping_Step3_20261031.json",
    "Compatibility_Screening_Step4_20261031.json",
    "Compatibility_Semantic_Step4b_20261031.json",
    "Compatibility_Completion_Step4c_20261031.json",
  ].map(read);
  const finalRaw = stages.at(-1)!;
  const final = documentSchema.parse(finalRaw);
  const library = validateAtlasV4(
    JSON.parse(
      readFileSync(new URL("../data/song-atlas/v4/library.json", import.meta.url), "utf8"),
    ),
  );
  const worksheet = JSON.parse(
    readFileSync(
      new URL("../../research/atlas-v4-123-technique-review.json", import.meta.url),
      "utf8",
    ),
  );
  validateAtlasTechniqueReview(library, worksheet, finalRaw);
  for (const stage of stages.slice(0, -1)) {
    const old = z
      .object({ techniques: z.array(z.record(z.string(), z.unknown())).length(123) })
      .parse(stage);
    const current = z
      .object({ techniques: z.array(z.record(z.string(), z.unknown())) })
      .parse(finalRaw);
    old.techniques.forEach((entry, index) => {
      for (const [name, value] of Object.entries(entry))
        if (!isDeepStrictEqual(value, current.techniques[index]![name]))
          throw new Error("mutated_delivered_technique");
    });
  }
  const ids = new Map(final.techniques.map((t) => [t.techniqueId, t]));
  const candidates = final.techniques.filter(
    (t) => t.generatorMappingStep3.mappingStatus === "manual_import_candidate_unverified",
  );
  if (ids.size !== 123 || candidates.length !== 107) throw new Error("candidate_identity_count");
  for (const t of candidates)
    if (
      !t.generatorMappingStep3.inputField ||
      !t.generatorMappingStep3.candidateInstructionEN ||
      t.generatorMappingStep3.candidateInstructionEN !==
        t.qualityRevisionStep2.updatedInstructionEN ||
      !t.generatorMappingStep3.syntheticManualImportOnly
    )
      throw new Error("candidate_mapping_provenance");
  const universe = new Set<string>();
  const candidateIds = new Set(candidates.map((t) => t.techniqueId));
  let screened = 0;
  for (const p of final.compatibilityCompletionStep4c.pairs) {
    const k = key(p.leftTechniqueId, p.rightTechniqueId);
    if (
      p.leftTechniqueId === p.rightTechniqueId ||
      !candidateIds.has(p.leftTechniqueId) ||
      !candidateIds.has(p.rightTechniqueId) ||
      universe.has(k)
    )
      throw new Error("pair_universe_identity");
    universe.add(k);
    if (
      p.leftProfileId !== ids.get(p.leftTechniqueId)!.profileId ||
      p.rightProfileId !== ids.get(p.rightTechniqueId)!.profileId ||
      p.sameProfile !== (p.leftProfileId === p.rightProfileId)
    )
      throw new Error("pair_profile_identity");
    if (p.reviewState === "editorial_screened_same_profile") {
      if (!p.sameProfile || p.editorialCandidateDecision === "unknown_needs_pair_specific_review")
        throw new Error("false_screening_scope");
      screened++;
    } else if (p.editorialCandidateDecision !== "unknown_needs_pair_specific_review")
      throw new Error("false_compatibility_claim");
  }
  if (screened !== 57 || universe.size !== 5671) throw new Error("pair_accounting");
  const prior = z
    .object({
      semanticPairReviewStep4b: z.object({
        pairs: z
          .array(
            z
              .object({
                leftTechniqueId: text,
                rightTechniqueId: text,
                editorialScreening: text,
                provenConflict: z.literal(false),
                provenCompatible: z.literal(false),
              })
              .passthrough(),
          )
          .length(57),
      }),
      compatibilityStep4: z.object({
        reviewPairs: z
          .array(z.object({ leftTechniqueId: text, rightTechniqueId: text }).passthrough())
          .length(1032),
      }),
    })
    .parse(finalRaw);
  const pairs = new Map(
    final.compatibilityCompletionStep4c.pairs.map((p) => [
      key(p.leftTechniqueId, p.rightTechniqueId),
      p,
    ]),
  );
  for (const p of prior.semanticPairReviewStep4b.pairs)
    if (
      pairs.get(key(p.leftTechniqueId, p.rightTechniqueId))?.editorialCandidateDecision !==
      p.editorialScreening
    )
      throw new Error("prior_screening_changed");
  const cross = prior.compatibilityStep4.reviewPairs.filter(
    (p) => ids.get(p.leftTechniqueId)!.profileId !== ids.get(p.rightTechniqueId)!.profileId,
  );
  if (
    cross.length !== 975 ||
    cross.some(
      (p) =>
        pairs.get(key(p.leftTechniqueId, p.rightTechniqueId))?.reviewState !==
        "not_semantically_reviewed",
    )
  )
    throw new Error("priority_pair_overclaim");
  const nested = files["PromptBeats_Atlas_V4_10_Offline_Pilot_AB_Setups_20261031.zip"]!;
  const fixtures = unzipSync(nested);
  if (Object.keys(fixtures).length !== 21) throw new Error("pilot_members");
  return {
    final,
    fixtures,
    memberHashes: manifest.files,
    summary: {
      techniques: 123,
      candidates: 107,
      held: 16,
      candidatePairs: 5671,
      preliminaryPairs: 57,
      unknownPairs: 5614,
      priorityUnknownPairs: 975,
      verifiedCompatible: 0,
      verifiedConflicts: 0,
    },
  };
}
let cached: ReturnType<typeof validateAtlasCompletionArchive> | undefined;
function loaded() {
  return (cached ??= validateAtlasCompletionArchive(
    readFileSync(new URL("../../research/atlas-v4-completion-20261031.zip", import.meta.url)),
  ));
}
export function readOfflineAtlasCandidates() {
  return structuredClone(loaded().final.techniques);
}
export function readOfflineAtlasPilots() {
  const d = loaded();
  return d.final.compatibilityCompletionStep4c.pilotFixtures.map((p, i) => {
    const n = String(i + 1).padStart(2, "0");
    return {
      ...structuredClone(p),
      suppliedA: new TextDecoder().decode(d.fixtures[`Atlas_Offline_Pilot_${n}_A.json`]!),
      suppliedB: new TextDecoder().decode(d.fixtures[`Atlas_Offline_Pilot_${n}_B.json`]!),
    };
  });
}
export function atlasCompletionSummary() {
  return structuredClone(loaded().summary);
}
