/** Inert research contracts. No filesystem, Node imports, fetching or execution. */
import { z } from "zod";

const text = z.string().refine((s) => s.trim().length > 0, "Must contain non-whitespace text");
const url = text.refine((s) => {
  try {
    const u = new URL(s);
    return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
}, "Unsafe citation URL");
export const ATLAS_RESEARCH_SHA =
  "0d2aa2f20e5645c69a26e054de77bc8a821baf1406c910644754bf19222cdd56";
export const atlasResearchDecisionSchema = z.enum([
  "source_supported_bounded",
  "supported_no_universal_rule",
  "insufficient_evidence",
  "not_applicable_with_reason",
]);
export const atlasResearchCitationSchema = z.strictObject({
  title: text,
  authors: z.union([text, z.array(text).min(1)]),
  year: z.number().int().positive().nullable(),
  url,
  sourceType: z.enum([
    "peer-reviewed",
    "primary_archive",
    "score",
    "recording",
    "institutional",
    "secondary",
  ]),
  accessedEvidence: z.enum(["full_text", "extract", "abstract", "catalog_record", "listening"]),
  locator: text,
  supports: text,
});
export const atlasResearchTaskSchema = z
  .strictObject({
    gapId: text,
    profileId: text,
    profileNameRu: text,
    profileNameEl: text,
    profileNameEn: text,
    dimension: z.enum([
      "structure",
      "melody",
      "harmony",
      "rhythm",
      "groove",
      "instrumentation",
      "vocals",
      "production",
      "lyrics",
      "dynamics",
      "era",
      "cultural_context",
    ]),
    existingSummaryEl: text,
    currentStatus: z.literal("specific_unknown"),
    currentUnknownEl: text,
    relatedEvidenceIds: z.array(text),
    knownHistoricalClaimIds: z.array(text),
    relatedTechniqueIds: z.array(text),
    eraRelations: z.array(text),
    researchDecision: atlasResearchDecisionSchema,
    suggestedStatementEl: text.nullable(),
    suggestedStatementEn: text.nullable(),
    validityScope: text,
    exceptionsAndCounterexamples: z.array(text),
    citations: z.array(atlasResearchCitationSchema),
    musicologistReview: z.literal("not_reviewed"),
    creativeTechniqueCandidate: z.null(),
  })
  .superRefine((t, ctx) => {
    if (t["researchDecision"] === "insufficient_evidence") {
      if (t.suggestedStatementEl !== null || t.suggestedStatementEn !== null)
        ctx.addIssue({
          code: "custom",
          message: "Insufficient evidence must have null statements",
        });
    } else if (!t.suggestedStatementEl || !t.suggestedStatementEn || !t.citations.length) {
      ctx.addIssue({
        code: "custom",
        message: "Positive decisions require bilingual statements and citations",
      });
    }
  });
export const atlasResearchSchema = z.strictObject({
  format: z.literal("promptbeats-atlas-v4-independent-evidence-research-template"),
  schemaVersion: z.literal(1),
  generatedFrom: text,
  libraryVersion: z.literal("4.0.0-review.1"),
  canonicalProfileCount: z.literal(58),
  taskCount: z.literal(636),
  notice: text,
  allowedResearchDecisions: z.array(atlasResearchDecisionSchema).length(4),
  citationSchema: z.strictObject({
    title: text,
    authors: text,
    year: text,
    url: text,
    sourceType: text,
    accessedEvidence: text,
    locator: text,
    supports: text,
  }),
  tasks: z.array(atlasResearchTaskSchema).length(636),
});
type StrictAtlasResearch = z.infer<typeof atlasResearchSchema>;
type Decision = z.infer<typeof atlasResearchDecisionSchema>;
type ReviewFields = Pick<
  StrictAtlasResearch["tasks"][number],
  | "gapId"
  | "dimension"
  | "suggestedStatementEl"
  | "suggestedStatementEn"
  | "validityScope"
  | "exceptionsAndCounterexamples"
  | "citations"
>;
export type AtlasResearchTask = ReviewFields &
  (
    | {
        quarantined: false;
        researchDecision: Decision;
        originalResearchDecision: Decision;
        validationIssues: string[];
      }
    | {
        quarantined: true;
        researchDecision: null;
        originalResearchDecision: Decision;
        validationIssues: string[];
      }
  );
export type AtlasResearch = Omit<StrictAtlasResearch, "tasks"> & {
  tasks: Array<AtlasResearchTask & { profileId: string }>;
  validation: {
    quarantinedGapIds: string[];
    eligibleTaskCount: number;
    originalDecisionCounts: Record<Decision, number>;
    eligibleDecisionCounts: Record<Decision, number>;
  };
};
export type AtlasResearchProfile = {
  profileId: string;
  sourceSha: typeof ATLAS_RESEARCH_SHA;
  executable: false;
  tasks: AtlasResearchTask[];
};
const answerKeys = new Set([
  "researchDecision",
  "suggestedStatementEl",
  "suggestedStatementEn",
  "validityScope",
  "exceptionsAndCounterexamples",
  "citations",
]);
type Reference = { tasks: readonly Record<string, unknown>[] };
type Gaps = { unresolvedEvidence: readonly { id: string; profileId: string; dimension: string }[] };
/** Validates identity/context against the trusted template and current V4 gap register. */
export function validateAtlasResearch(
  input: unknown,
  template: Reference,
  library: Gaps,
): AtlasResearch {
  // Validate the envelope independently: invalid answers cannot bypass identity checks.
  const d = atlasResearchSchema
    .extend({ tasks: z.array(z.record(z.string(), z.unknown())).length(636) })
    .parse(input);
  const errors: string[] = [];
  const seen = new Set<unknown>();
  const same = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const aa = a as Record<string, unknown>,
      bb = b as Record<string, unknown>;
    return (
      Object.keys(aa).length === Object.keys(bb).length &&
      Object.keys(aa).every((k) => Object.hasOwn(bb, k) && same(aa[k], bb[k]))
    );
  };
  for (const [key, value] of Object.entries(d)) {
    if (key !== "tasks" && !same(value, (template as unknown as Record<string, unknown>)[key]))
      errors.push(key + ": template metadata changed");
  }
  if (template.tasks.length !== 636 || library.unresolvedEvidence.length !== 636)
    errors.push("Reference task/gap count must be 636");
  const gaps = new Map(library.unresolvedEvidence.map((g) => [g.id, g]));
  if (gaps.size !== 636) errors.push("Duplicate V4 gap IDs");
  d.tasks.forEach((t, i) => {
    const path = "tasks[" + i + "] (" + t["gapId"] + ")";
    if (seen.has(t["gapId"])) errors.push(path + ": duplicate gapId");
    seen.add(t["gapId"]);
    for (const [key, value] of Object.entries(template.tasks[i] ?? {})) {
      if (!answerKeys.has(key) && !same(value, t[key]))
        errors.push(path + "." + key + ": template identity/order/context changed");
    }
    const gap = typeof t["gapId"] === "string" ? gaps.get(t["gapId"]) : undefined;
    if (!gap || gap.profileId !== t["profileId"] || gap.dimension !== t["dimension"])
      errors.push(path + ": V4 gap identity/profile/dimension mismatch");
  });
  const expected = {
    source_supported_bounded: 396,
    supported_no_universal_rule: 20,
    insufficient_evidence: 220,
    not_applicable_with_reason: 0,
  };
  for (const [decision, count] of Object.entries(expected)) {
    if (d.tasks.filter((t) => t["researchDecision"] === decision).length !== count)
      errors.push("researchDecision." + decision + ": expected " + count);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const originalDecisionCounts = { ...expected };
  const eligibleDecisionCounts = {
    source_supported_bounded: 0,
    supported_no_universal_rule: 0,
    insufficient_evidence: 0,
    not_applicable_with_reason: 0,
  };
  const quarantinedGapIds: string[] = [];
  const tasks = d.tasks.map((raw, i): AtlasResearch["tasks"][number] => {
    const identity = template.tasks[i]!;
    const profileId = z.string().parse(identity["profileId"]);
    const gapId = z.string().parse(identity["gapId"]);
    const dimension = atlasResearchTaskSchema.shape.dimension.parse(identity["dimension"]);
    const decision = atlasResearchDecisionSchema.parse(raw["researchDecision"]);
    const result = atlasResearchTaskSchema.safeParse(raw);
    if (!result.success) {
      quarantinedGapIds.push(gapId);
      return {
        profileId,
        gapId,
        dimension,
        quarantined: true,
        researchDecision: null,
        originalResearchDecision: decision,
        suggestedStatementEl: null,
        suggestedStatementEn: null,
        citations: [],
        validityScope: text.safeParse(raw["validityScope"]).success
          ? (raw["validityScope"] as string)
          : "Quarantined research; independent review required.",
        exceptionsAndCounterexamples: [],
        validationIssues: result.error.issues.map(
          (issue) =>
            "tasks." +
            i +
            (issue.path.length ? "." + issue.path.join(".") : "") +
            ": " +
            issue.message,
        ),
      };
    }
    eligibleDecisionCounts[decision]++;
    return {
      ...result.data,
      quarantined: false,
      originalResearchDecision: decision,
      validationIssues: [],
    };
  });
  return {
    ...d,
    tasks,
    validation: {
      quarantinedGapIds,
      eligibleTaskCount: tasks.length - quarantinedGapIds.length,
      originalDecisionCounts,
      eligibleDecisionCounts,
    },
  };
}
/** Explicit allowlist projection: no technique, instruction or approval fields. */
export function projectAtlasResearchProfile(
  d: AtlasResearch,
  profileId: string,
): AtlasResearchProfile {
  const tasks = d.tasks.filter((t) => t["profileId"] === profileId);
  if (!tasks.length) throw new Error("Unknown Atlas research profile: " + profileId);
  return {
    profileId,
    sourceSha: ATLAS_RESEARCH_SHA,
    executable: false,
    tasks: tasks.map(({ profileId: _profileId, ...task }) => ({
      gapId: task.gapId,
      dimension: task.dimension,
      researchDecision: task.researchDecision,
      originalResearchDecision: task.originalResearchDecision,
      quarantined: task.quarantined,
      validationIssues: [...task.validationIssues],
      suggestedStatementEl: task.suggestedStatementEl,
      suggestedStatementEn: task.suggestedStatementEn,
      validityScope: task.validityScope,
      exceptionsAndCounterexamples: [...task.exceptionsAndCounterexamples],
      citations: task.citations.map((c) => ({
        ...c,
        authors: Array.isArray(c.authors) ? [...c.authors] : c.authors,
      })),
    })) as AtlasResearchTask[],
  };
}
