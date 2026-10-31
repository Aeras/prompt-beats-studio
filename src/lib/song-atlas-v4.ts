/** Offline editorial contract only. Never imported by a route, worker or compiler. */
import { z } from "zod";

const id = z
  .string()
  .regex(/^[a-zA-Z0-9_.:-]+$/)
  .max(200);
const text = z.string().trim().min(1).max(6000);
const bilingual = z.strictObject({
  el: text,
  en: text,
  review: z.literal("draft_translation_requires_independent_review"),
});
export const V4_DIMENSIONS = [
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
] as const;
const dimension = z.enum(V4_DIMENSIONS);
// Archival fields are deliberately inert JSON, not executable, translated or certified.
const archive = z.json();
const taxonomy = z.strictObject({
  profileId: id,
  continentId: id,
  countryId: id,
  genreId: id,
  romanizedName: text,
  sourceEntityType: text,
  classification: z.strictObject({
    subgenre: z.array(id),
    form: z.array(id),
    scene: z.array(id),
    context: z.array(id),
    style: z.array(id),
    general: z.array(id),
  }),
  evidence: z.strictObject({ field: z.literal("name_ru"), quote: text }),
});
const knowledge = z.strictObject({
  dimension,
  status: z.enum(["bounded_evidence", "specific_unknown"]),
  evidenceIds: z.array(id),
  unknown: bilingual.nullable(),
  automaticInference: z.literal(false),
});
const profile = z.strictObject({
  id,
  rc1ProfileId: id,
  name: bilingual,
  nameRu: text,
  latin: text,
  summary: bilingual,
  taxonomy,
  knowledge: z.array(knowledge).length(12),
  eraRelations: z.array(
    z.strictObject({
      eraId: id,
      basis: z.enum(["explicit_inherited_profile_scope", "bounded_source_report"]),
      evidenceId: id.nullable(),
      scope: text,
    }),
  ),
  eraCoverage: z.enum(["bounded_not_exhaustive", "not_assigned_without_evidence"]),
  techniqueIds: z.array(id),
  historicalClaimIds: z.array(id),
  review: z.strictObject({
    identity: z.literal("stable_rc1_identity_preserved"),
    musicology: z.literal("desk_review_with_explicit_gaps_no_audio_certification"),
    localization: z.literal("draft_bilingual_independent_review_required"),
    generator: z.literal("blocked"),
  }),
  inheritedKnowledge: archive,
  inheritedCreativePalette: archive,
});
const technique = z.strictObject({
  id,
  profileId: id,
  origin: z.enum(["rc1", "v4"]),
  kind: z.literal("creative_hypothesis"),
  purpose: bilingual,
  instruction: z.strictObject({
    el: text.nullable(),
    en: text,
    review: z.enum([
      "draft_translation_requires_independent_review",
      "inherited_english_greek_translation_pending",
    ]),
  }),
  evidenceIds: z.array(id),
  sourceSupport: z.enum(["not_claimed", "inspiration_only_not_validation_of_instruction"]),
  review: z.enum([
    "context_only_not_a_sound_instruction",
    "retain_as_unvalidated_creative_hypothesis",
    "authored_for_independent_editorial_review",
  ]),
  constraints: z.array(text).min(1),
  conflicts: z.array(id),
  conflictReview: text,
  supersededBy: id.nullable(),
  pilot: z.enum(["not_shortlisted", "offline_editorial_shortlist"]),
  executable: z.literal(false),
});
const evidence = z.strictObject({
  id,
  profileId: id,
  sourceIds: z.array(id).min(1),
  access: text,
  locator: text,
  reviewedDate: z.iso.date(),
  kind: z.literal("attributed_source_report"),
  text: bilingual,
  scope: text,
  dimensions: z.array(dimension).min(1),
  independentMusicologicalSignoff: z.literal(false),
  executable: z.literal(false),
});
export const atlasV4StructuralSchema = z.strictObject({
  format: z.literal("promptbeats-russian-cultural-song-library"),
  schemaVersion: z.literal(4),
  libraryVersion: z.literal("4.0.0-review.1"),
  status: z.literal("independent_editorial_review_required"),
  source: z.strictObject({
    rc1Sha256: z.literal("fa363996a89fe2b475bd75330f4eaa01531c8ed4f7a32669ebe64e2e963d925a"),
    rc1Path: text,
    baseMain: z.string().regex(/^[a-f0-9]{40}$/),
    reviewDate: z.iso.date(),
  }),
  safety: z.strictObject({
    researchOnly: z.literal(true),
    generatorTransfer: z.literal(false),
    techniqueActivation: z.literal(false),
    runtimeAtlasReplacement: z.literal(false),
    narrativeDefault: z.literal(false),
  }),
  localizationPolicy: z.strictObject({
    runtimeTranslation: z.literal(false),
    draftMayBeDisplayedAsApproved: z.literal(false),
    originalRuAndLatinAlwaysRetained: z.literal(true),
    missingTranslation: z.literal("explicit_source_language_with_lang_attribute"),
  }),
  eraDefinition: text,
  eras: z
    .array(
      z.strictObject({
        id,
        startYear: z.number().int(),
        endYear: z.number().int().nullable(),
        label: bilingual,
      }),
    )
    .length(4),
  profiles: z.array(profile).length(58),
  techniques: z.array(technique),
  sources: z.array(
    z.strictObject({
      id,
      inheritedMetadata: archive,
      url: z.string().nullable(),
      identityReview: text,
      claimCertification: z.literal(false),
      documentId: id,
    }),
  ),
  evidence: z.array(evidence),
  inheritedClaimReviews: z
    .array(
      z.strictObject({
        id,
        profileId: id,
        original: archive,
        disposition: text,
        replacementEvidenceIds: z.array(id),
        reason: text,
      }),
    )
    .length(85),
  excludedCandidates: z
    .array(
      z.strictObject({ id, reason: z.literal("rc1_candidate_not_promoted"), original: archive }),
    )
    .length(14),
  unresolvedEvidence: z.array(
    z.strictObject({
      id,
      profileId: id,
      kind: z.literal("musical_evidence_gap"),
      dimension,
      resolution: text,
    }),
  ),
  decisions: z.array(z.strictObject({ id, decision: text })),
  documentGroups: z.array(
    z.strictObject({ id, identityKey: text, sourceIds: z.array(id).min(1), identityBasis: text }),
  ),
});
export type AtlasV4 = z.infer<typeof atlasV4StructuralSchema>;

/** JSON Schema supplies structure; this second pass supplies relational invariants. */
export function validateAtlasV4(input: unknown): AtlasV4 {
  const d = atlasV4StructuralSchema.parse(input);
  const ids = new Set<string>();
  const unique = (value: string) => {
    if (ids.has(value)) throw new Error(`Duplicate V4 ID: ${value}`);
    ids.add(value);
  };
  [
    d.profiles,
    d.techniques,
    d.sources,
    d.evidence,
    d.inheritedClaimReviews,
    d.excludedCandidates,
    d.unresolvedEvidence,
    d.decisions,
    d.documentGroups,
    d.eras,
  ].forEach((xs) => xs.forEach((x) => unique(x.id)));
  const requireRef = (values: readonly { id: string }[], value: string) => {
    if (!values.some((x) => x.id === value)) throw new Error(`Unknown V4 reference: ${value}`);
  };
  const uniqueRefs = (values: string[]) => {
    if (new Set(values).size !== values.length) throw new Error("Duplicate V4 references");
  };
  if (d.techniques.filter((t) => t.origin === "rc1").length !== 65)
    throw new Error("RC1 technique coverage changed");
  for (const p of d.profiles) {
    if (
      p.id !== p.rc1ProfileId ||
      p.id !== p.taxonomy.profileId ||
      p.nameRu !== p.taxonomy.evidence.quote
    )
      throw new Error("V4 identity drift");
    uniqueRefs(p.knowledge.map((k) => k.dimension));
    uniqueRefs(p.techniqueIds);
    uniqueRefs(p.historicalClaimIds);
    for (const k of p.knowledge) {
      uniqueRefs(k.evidenceIds);
      if (
        (k.status === "specific_unknown") !== (k.unknown !== null) ||
        (k.status === "bounded_evidence") !== k.evidenceIds.length > 0
      )
        throw new Error("Unstated V4 evidence gap");
      for (const ref of k.evidenceIds) {
        requireRef(d.evidence, ref);
        const e = d.evidence.find((e) => e.id === ref)!;
        if (e.profileId !== p.id || !e.dimensions.includes(k.dimension))
          throw new Error("V4 evidence scope mismatch");
      }
    }
    for (const ref of p.techniqueIds) {
      requireRef(d.techniques, ref);
      if (d.techniques.find((t) => t.id === ref)!.profileId !== p.id)
        throw new Error("Cross-profile V4 technique");
    }
    for (const ref of p.historicalClaimIds) {
      requireRef(d.inheritedClaimReviews, ref);
      if (d.inheritedClaimReviews.find((c) => c.id === ref)!.profileId !== p.id)
        throw new Error("Cross-profile V4 claim");
    }
    for (const r of p.eraRelations) {
      requireRef(d.eras, r.eraId);
      if (r.basis === "bounded_source_report") {
        if (!r.evidenceId) throw new Error("Unsourced V4 era");
        requireRef(d.evidence, r.evidenceId);
        const e = d.evidence.find((e) => e.id === r.evidenceId)!;
        if (e.profileId !== p.id || !e.dimensions.includes("era"))
          throw new Error("V4 era scope mismatch");
      } else if (r.evidenceId !== null)
        throw new Error("Period label masquerading as sourced history");
    }
  }
  for (const e of d.evidence) {
    requireRef(d.profiles, e.profileId);
    uniqueRefs(e.sourceIds);
    for (const ref of e.sourceIds) requireRef(d.sources, ref);
  }
  for (const t of d.techniques) {
    requireRef(d.profiles, t.profileId);
    if (!d.profiles.find((p) => p.id === t.profileId)!.techniqueIds.includes(t.id))
      throw new Error("Orphan V4 technique");
    for (const ref of t.evidenceIds) requireRef(d.evidence, ref);
    for (const ref of t.conflicts) requireRef(d.techniques, ref);
    if (t.supersededBy) {
      requireRef(d.techniques, t.supersededBy);
      if (t.supersededBy === t.id) throw new Error("Self-superseding V4 technique");
    }
    if (t.origin === "v4" && !t.instruction.el) throw new Error("Missing V4 translation");
  }
  for (const c of d.inheritedClaimReviews) {
    requireRef(d.profiles, c.profileId);
    for (const ref of c.replacementEvidenceIds) requireRef(d.evidence, ref);
  }
  for (const s of d.sources) {
    if (s.url) {
      const url = new URL(s.url);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
        throw new Error("Unsafe V4 bibliography URL");
    }
    requireRef(d.documentGroups, s.documentId);
    if (!d.documentGroups.find((g) => g.id === s.documentId)!.sourceIds.includes(s.id))
      throw new Error("V4 document membership mismatch");
  }
  for (const g of d.documentGroups) {
    uniqueRefs(g.sourceIds);
    for (const ref of g.sourceIds) {
      requireRef(d.sources, ref);
      if (d.sources.find((s) => s.id === ref)!.documentId !== g.id)
        throw new Error("V4 alias mismatch");
    }
  }
  for (const gap of d.unresolvedEvidence) {
    requireRef(d.profiles, gap.profileId);
    if (
      !d.profiles
        .find((p) => p.id === gap.profileId)!
        .knowledge.some((k) => k.dimension === gap.dimension && k.status === "specific_unknown")
    )
      throw new Error("Stale V4 gap");
  }
  for (const p of d.profiles) {
    for (const k of p.knowledge.filter((k) => k.status === "specific_unknown")) {
      if (
        d.unresolvedEvidence.filter(
          (gap) => gap.profileId === p.id && gap.dimension === k.dimension,
        ).length !== 1
      )
        throw new Error("Missing or repeated V4 evidence gap");
    }
  }
  return d;
}

/** Review projection contains no executable instruction or automatic translation. */
export function projectAtlasV4ForReview(input: unknown, locale: "el" | "en") {
  const d = validateAtlasV4(input);
  return {
    format: "promptbeats-atlas-v4-review" as const,
    sourceSha: d.source.rc1Sha256,
    executable: false as const,
    cards: d.profiles.map((p) => ({
      id: p.id,
      name: p.name[locale],
      nameRu: p.nameRu,
      latin: p.latin,
      summary: p.summary[locale],
      lang: locale,
      review: p.name.review,
      eraRelations: p.eraRelations,
    })),
  };
}
