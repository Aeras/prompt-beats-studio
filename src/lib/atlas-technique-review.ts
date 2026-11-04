/** Offline cross-register audit. A matching worksheet does not authorize a technique. */
import { z } from "zod";
import type { AtlasV4 } from "./song-atlas-v4";

const original = z
  .object({
    techniqueId: z.string(),
    profileId: z.string(),
    origin: z.enum(["rc1", "v4"]),
    editorialState: z.string(),
    pilot: z.string(),
    supersededBy: z.string().nullable(),
    englishInstruction: z.string(),
    greekInstruction: z.string().nullable(),
    sourceSupport: z.string(),
    numberOfEvidenceLinks: z.number().int().nonnegative(),
    explicitConflictLinks: z.number().int().nonnegative(),
  })
  .passthrough();
const worksheetSchema = z
  .object({
    format: z.literal("promptbeats-atlas-v4-independent-technique-triage"),
    techniqueCount: z.literal(123),
    techniques: z.array(original).length(123),
  })
  .passthrough();
const reviewSchema = z
  .object({
    format: z.literal("promptbeats-atlas-v4-123-technique-independent-review"),
    independentHumanMusicologistReview: z.literal("not_performed"),
    globallyApproved: z.literal(false),
    generatorTransfer: z.literal(false),
    techniqueCount: z.literal(123),
    uniqueIds: z.literal(123),
    compatibilityMatrix: z
      .object({
        status: z.literal("not_assessed"),
        validatedPairs: z.array(z.never()),
        exclusivePairs: z.array(z.never()),
        conditionalPairs: z.array(z.never()),
      })
      .passthrough(),
    techniques: z
      .array(
        z
          .object({
            techniqueId: z.string(),
            profileId: z.string(),
            immutableOriginal: original,
            review: z
              .object({
                verdict: z.enum([
                  "experimental_needs_pilot",
                  "insufficient_evidence_to_decide",
                  "needs_revision",
                ]),
                independentApproval: z.literal(false),
                executable: z.literal(false),
                approved: z.literal(false),
                musicologicalCertification: z.literal("not_performed"),
                conflicts: z
                  .object({
                    assessed: z.array(z.never()),
                    unassessed: z.literal(true),
                    unknownPairRelations: z.literal("not_assessed"),
                  })
                  .passthrough(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .length(123),
  })
  .passthrough();

export function validateAtlasTechniqueReview(
  library: AtlasV4,
  rawWorksheet: unknown,
  rawReview: unknown,
) {
  const worksheet = worksheetSchema.parse(rawWorksheet);
  const review = reviewSchema.parse(rawReview);
  const seen = new Set<string>();
  const sameJSON = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const verdicts = {
    experimental_needs_pilot: 0,
    insufficient_evidence_to_decide: 0,
    needs_revision: 0,
  };
  for (let index = 0; index < library.techniques.length; index++) {
    const canonical = library.techniques[index]!;
    const w = worksheet.techniques[index],
      r = review.techniques[index];
    if (
      seen.has(canonical.id) ||
      !w ||
      !r ||
      w.techniqueId !== canonical.id ||
      r.techniqueId !== canonical.id
    )
      throw new Error("Technique identity/order mismatch");
    seen.add(canonical.id);
    if (!sameJSON(w, r.immutableOriginal)) throw new Error("Immutable review worksheet changed");
    if (
      w.profileId !== canonical.profileId ||
      r.profileId !== canonical.profileId ||
      w.origin !== canonical.origin ||
      w.editorialState !== canonical.review ||
      w.pilot !== canonical.pilot ||
      w.supersededBy !== canonical.supersededBy ||
      w.englishInstruction !== canonical.instruction.en ||
      w.greekInstruction !== canonical.instruction.el ||
      w.sourceSupport !== canonical.sourceSupport ||
      w.numberOfEvidenceLinks !== canonical.evidenceIds.length ||
      w.explicitConflictLinks !== canonical.conflicts.length ||
      canonical.executable
    )
      throw new Error("Canonical technique field parity mismatch: " + canonical.id);
    verdicts[r.review.verdict]++;
  }
  if (seen.size !== 123) throw new Error("Expected all 123 canonical techniques");
  let sameProfilePairs = 0;
  for (let i = 0; i < library.techniques.length; i++)
    for (let j = i + 1; j < library.techniques.length; j++)
      if (library.techniques[i]!.profileId === library.techniques[j]!.profileId) sameProfilePairs++;
  return {
    canonicalMatched: seen.size,
    verdicts,
    pairs: {
      total: 7503,
      sameProfile: sameProfilePairs,
      crossProfile: 7503 - sameProfilePairs,
      independentlyAssessed: 0,
    },
    supersessionReferences: library.techniques.filter((t) => t.supersededBy !== null).length,
    musicalCompatibility: "not_inferred_from_empty_arrays" as const,
    sourceClaimsCertified: false,
    approvedForGenerator: false,
  };
}
