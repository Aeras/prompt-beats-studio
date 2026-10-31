/** Metadata-only review overlay. The supplied research archive is never rewritten. */
import { z } from "zod";
import {
  ATLAS_RESEARCH_SHA,
  atlasResearchCitationSchema,
  atlasResearchTaskSchema,
} from "./atlas-research";

const text = z.string().trim().min(1);
export const atlasCitationCorrectionsSchema = z.strictObject({
  format: z.literal("promptbeats-atlas-v4-citation-corrections"),
  schemaVersion: z.literal(1),
  revision: z.literal("2026-10-31.1"),
  sourceSha256: z.literal(ATLAS_RESEARCH_SHA),
  reviewScope: z.literal("metadata_normalization_only_not_claim_certification"),
  independentHumanApproval: z.literal(false),
  executable: z.literal(false),
  corrections: z
    .array(
      z.strictObject({
        gapId: text,
        changes: z
          .array(
            z.strictObject({
              citationIndex: z.number().int().nonnegative(),
              field: z.enum(["authors", "year", "accessedEvidence"]),
              expected: z.string(),
              value: z.union([text, z.number().int().positive()]),
              basis: text,
              verificationUrl: z.url().refine((value) => {
                const u = new URL(value);
                return u.protocol === "https:" && !u.username && !u.password;
              }),
            }),
          )
          .min(1),
      }),
    )
    .length(18),
});

/** Caller must pin the original archive AND correction fingerprint before applying.
 * Successful correction means valid metadata, never independently certified claims. */
export function applyAtlasCitationCorrections(input: unknown, rawCorrections: unknown): unknown {
  const corrections = atlasCitationCorrectionsSchema.parse(rawCorrections);
  const archive = z
    .object({ tasks: z.array(z.record(z.string(), z.unknown())) })
    .passthrough()
    .parse(structuredClone(input));
  const tasks = new Map(archive.tasks.map((task) => [task["gapId"], task]));
  if (tasks.size !== archive.tasks.length) throw new Error("Duplicate research task identity");
  const seen = new Set<string>();
  for (const correction of corrections.corrections) {
    if (seen.has(correction.gapId)) throw new Error("Duplicate correction identity");
    seen.add(correction.gapId);
    const task = tasks.get(correction.gapId);
    if (!task) throw new Error("Unknown corrected task");
    const citations = z.array(z.record(z.string(), z.unknown())).parse(task["citations"]);
    const fields = new Set<string>();
    for (const change of correction.changes) {
      const key = `${change.citationIndex}:${change.field}`;
      if (fields.has(key)) throw new Error("Duplicate corrected field");
      fields.add(key);
      const citation = citations[change.citationIndex];
      if (!citation || citation[change.field] !== change.expected)
        throw new Error("Stale citation correction");
      if (change.field === "year") {
        if (!/^\d{4}$/.test(change.expected) || change.value !== Number(change.expected))
          throw new Error("Year correction must preserve the supplied year");
      } else if (change.field === "authors") {
        if (change.expected !== "" || typeof change.value !== "string")
          throw new Error("Author correction must address missing metadata only");
      } else if (
        change.value !== "extract" ||
        atlasResearchCitationSchema.shape.accessedEvidence.safeParse(change.expected).success
      ) {
        throw new Error(
          "Access correction cannot increase or rewrite an established evidence level",
        );
      }
      citation[change.field] = change.value;
      atlasResearchCitationSchema.parse(citation);
    }
    task["citations"] = citations;
    atlasResearchTaskSchema.parse(task);
  }
  return archive;
}
