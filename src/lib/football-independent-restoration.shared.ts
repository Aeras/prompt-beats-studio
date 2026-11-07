import { z } from "zod";
import {
  researchMarketSchema,
  researchMarketKey,
  researchMarketFamily,
  type ResearchMarket,
} from "./football-independent-markets.shared";

export const restoredCandidateSchema = z
  .object({
    id: z.number().int().nonnegative(),
    sourceId: z.string().max(80),
    quote: z.string().min(1).max(1200),
    market: researchMarketSchema,
    originalMarket: researchMarketSchema,
    originalRationale: z.string().max(300).optional(),
    authorshipContext: z.string().min(1).max(200).optional(),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    quoteStartUtf16: z.number().int().min(-1),
    kind: z.enum(["editorial", "algorithm", "odds", "statistics", "uncertain"]),
    quoteVerified: z.boolean(),
    fixtureVerified: z.boolean(),
    independenceConfirmed: z.boolean(),
    eligibleForConsensus: z.boolean(),
    publisherFamily: z.string().max(100).nullable(),
    reasons: z.array(z.string().max(60)).max(12),
  })
  .strict();
export type RestoredCandidate = z.infer<typeof restoredCandidateSchema>;
const supportSchema = z
  .object({
    market: researchMarketSchema,
    evidenceUrls: z.array(z.string().url().max(2000)).min(1).max(25),
    rationale: z.string().trim().min(12).max(500),
    quote: z.string().min(8).max(1200),
  })
  .strict();
export const restoredChoiceSchema = z
  .object({
    market: researchMarketSchema,
    rationale: z.string().trim().min(12).max(700),
    risk: z.string().trim().min(8).max(400),
    evidenceUrls: z.array(z.string().url().max(2000)).min(1).max(25),
    evidenceSourceIds: z.array(z.string().max(80)).max(20).optional(),
    jointRationale: z.string().trim().min(25).max(500).optional(),
    legEvidence: z.tuple([supportSchema, supportSchema]).optional(),
  })
  .strict();
export const restoredAssessmentSchema = z
  .object({
    decision: z.enum(["lean", "abstain"]),
    primary: restoredChoiceSchema.optional(),
    alternative: restoredChoiceSchema.optional(),
    rationale: z.string().trim().min(12).max(700),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      (v.decision === "lean" && !v.primary) ||
      (v.decision === "abstain" && (v.primary || v.alternative))
    )
      c.addIssue({ code: "custom", message: "Decision requires primary or abstention" });
    if (
      v.primary &&
      v.alternative &&
      researchMarketKey(v.primary.market) === researchMarketKey(v.alternative.market)
    )
      c.addIssue({ code: "custom", message: "Alternative must differ" });
  });
export type RestoredAssessment = z.infer<typeof restoredAssessmentSchema>;
export function aggregateVerifiedMarkets(candidates: RestoredCandidate[]) {
  const eligible = candidates.filter((c) => c.eligibleForConsensus && c.publisherFamily);
  const conflicts = new Set<string>();
  for (const c of eligible)
    for (const d of eligible) {
      if (
        c.publisherFamily !== d.publisherFamily ||
        researchMarketFamily(c.market) !== researchMarketFamily(d.market) ||
        researchMarketKey(c.market) === researchMarketKey(d.market)
      )
        continue;
      // Distinct double chances can overlap; they are not mutually exclusive by default.
      if (c.market.kind === "and" && d.market.kind === "and") {
        const incompatible = c.market.legs.some(
          (x) =>
            d.market.kind === "and" &&
            d.market.legs.some(
              (y) =>
                x.kind !== "dc" &&
                researchMarketFamily(x) === researchMarketFamily(y) &&
                researchMarketKey(x) !== researchMarketKey(y),
            ),
        );
        if (incompatible) conflicts.add(`${c.publisherFamily}:${researchMarketFamily(c.market)}`);
        continue;
      }
      if (c.market.kind !== "dc" && c.market.kind !== "and" && c.market.kind !== "other")
        conflicts.add(`${c.publisherFamily}:${researchMarketFamily(c.market)}`);
    }
  const usable = eligible.filter(
    (c) => !conflicts.has(`${c.publisherFamily}:${researchMarketFamily(c.market)}`),
  );
  const rows = new Map<
    string,
    {
      marketKey: string;
      market: ResearchMarket;
      count: number;
      denominator: number;
      publisherFamilyIds: string[];
      sourceIds: string[];
      candidateIds: number[];
    }
  >();
  for (const c of usable) {
    const key = researchMarketKey(c.market);
    const row = rows.get(key) ?? {
      marketKey: key,
      market: c.market,
      count: 0,
      denominator: 0,
      publisherFamilyIds: [],
      sourceIds: [],
      candidateIds: [],
    };
    if (!row.publisherFamilyIds.includes(c.publisherFamily!))
      row.publisherFamilyIds.push(c.publisherFamily!);
    if (!row.sourceIds.includes(c.sourceId)) row.sourceIds.push(c.sourceId);
    row.candidateIds.push(c.id);
    rows.set(key, row);
  }
  for (const row of rows.values()) {
    row.publisherFamilyIds.sort();
    row.sourceIds.sort();
    row.count = row.publisherFamilyIds.length;
    // Comparable-family denominator, not all search URLs or all unrelated markets.
    row.denominator = new Set(
      usable
        .filter((c) => researchMarketFamily(c.market) === researchMarketFamily(row.market))
        .map((c) => c.publisherFamily),
    ).size;
  }
  return {
    rows: [...rows.values()].sort(
      (a, b) =>
        b.count - a.count || (a.marketKey < b.marketKey ? -1 : a.marketKey > b.marketKey ? 1 : 0),
    ),
    conflicts: [...conflicts].sort(),
  };
}
export const restorationSchema = z
  .object({
    version: z.literal(2),
    candidates: z.array(restoredCandidateSchema).max(160),
    assessment: restoredAssessmentSchema.optional(),
    onlineComparisonStatus: z.enum(["verified", "not_verified"]),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.candidates.some(
        (x, i) =>
          x.id !== i ||
          (x.eligibleForConsensus &&
            (!x.quoteVerified ||
              !x.fixtureVerified ||
              !x.independenceConfirmed ||
              !x.publisherFamily ||
              x.kind !== "editorial" ||
              x.market.kind === "other" ||
              x.reasons.length)),
      )
    )
      c.addIssue({ code: "custom", message: "Invalid restored provenance" });
    if (
      aggregateVerifiedMarkets(v.candidates).rows.length > 0 !==
      (v.onlineComparisonStatus === "verified")
    )
      c.addIssue({ code: "custom", message: "Invalid comparison status" });
  });
export type FootballRestoration = z.infer<typeof restorationSchema>;
