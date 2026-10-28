import { describe, expect, it } from "bun:test";
import {
  assertInspirationEvidenceMatchesSources,
  inspirationRequestSchema,
  inspirationResearchSchema,
  isPublicInspirationUrl,
  validateInspirationResearchEvidence,
} from "./music-inspiration.shared";

const base = {
  version: 1 as const,
  researchPromptVersion: "1" as const,
  request: { kind: "artist" as const, artist: "Example Group", depth: "standard" as const },
  sources: [
    {
      id: "src-1",
      title: "Credits",
      url: "https://example.org/credits",
      publisher: null,
      accessedAt: "2026-10-28T00:00:00.000Z",
      locator: "Credits",
      sourceType: "credits" as const,
      receipt: {
        documentId: "doc-1",
        finalUrl: "https://example.org/credits",
        retrievedAt: "2026-10-28T00:00:00.000Z",
        contentSha256: "a".repeat(64),
        accessibility: "accessible" as const,
      },
    },
  ],
  evidence: [
    {
      id: "ev-1",
      claim: "Synthesizers were used.",
      dimension: "instrumentation" as const,
      classification: "supported" as const,
      sourceIds: ["src-1"],
      citedPassages: [{ sourceId: "src-1", quote: "Synthesizers were used.", locator: "Credits" }],
      limitation: "",
    },
  ],
  unresolvedQuestions: [],
  proposal: {
    musicStyles: ["Pop"],
    moods: ["Nostalgic"],
    instruments: ["Synth"],
    bpm: 120,
    productionStyle: "Electronic",
    additionalInstructions: "Write an original song.",
    songStructure: ["Intro", "Verse", "Chorus"],
    blueprint: [
      { structureIndex: 0, sectionType: "Intro", instruction: "Sparse synth.", energy: 2 },
      { structureIndex: 1, sectionType: "Verse", instruction: "Warm pads.", energy: 3 },
      { structureIndex: 2, sectionType: "Chorus", instruction: "Fuller drums.", energy: 4 },
    ],
    supportingEvidenceIds: ["ev-1"],
    creativeChoices: ["120 BPM is a creative suggestion."],
  },
};

describe("music inspiration research contract", () => {
  it("accepts supported research with consistent blueprint", () => {
    expect(inspirationResearchSchema.safeParse(base).success).toBe(true);
  });
  it("rejects invented source links", () => {
    expect(
      inspirationResearchSchema.safeParse({
        ...base,
        evidence: [{ ...base.evidence[0], sourceIds: ["invented"] }],
      }).success,
    ).toBe(false);
  });
  it("requires attribution for supported claims", () => {
    expect(
      inspirationResearchSchema.safeParse({
        ...base,
        evidence: [{ ...base.evidence[0], sourceIds: [] }],
      }).success,
    ).toBe(false);
  });
  it("rejects a shifted blueprint", () => {
    expect(
      inspirationResearchSchema.safeParse({
        ...base,
        proposal: {
          ...base.proposal,
          blueprint: [
            { ...base.proposal.blueprint[0], structureIndex: 1 },
            ...base.proposal.blueprint.slice(1),
          ],
        },
      }).success,
    ).toBe(false);
  });
  it("does not allow theme or language to be supplied in proposals", () => {
    expect(
      inspirationResearchSchema.safeParse({
        ...base,
        proposal: { ...base.proposal, theme: "Override", language: "Russian" },
      }).success,
    ).toBe(false);
  });
  it("rejects duplicate source and evidence IDs", () => {
    expect(
      inspirationResearchSchema.safeParse({
        ...base,
        sources: [base.sources[0]!, base.sources[0]!],
      }).success,
    ).toBe(false);
    expect(
      inspirationResearchSchema.safeParse({
        ...base,
        evidence: [base.evidence[0], base.evidence[0]],
      }).success,
    ).toBe(false);
  });
  it("rejects non-HTTPS citation schemes and URL credentials", () => {
    for (const url of [
      "http://example.org/a",
      "https://user:pass@example.org/a",
      "https://localhost/a",
    ]) {
      expect(
        inspirationResearchSchema.safeParse({
          ...base,
          sources: [{ ...base.sources[0]!, url }],
        }).success,
      ).toBe(false);
    }
  });
  it("requires a source for a bounded claim", () => {
    expect(
      inspirationResearchSchema.safeParse({
        ...base,
        evidence: [{ ...base.evidence[0], classification: "bounded", sourceIds: [] }],
      }).success,
    ).toBe(false);
  });
  it("requires substantive descriptions, rejects extra keys", () => {
    expect(
      inspirationRequestSchema.safeParse({
        kind: "description",
        description: "pop",
        depth: "standard",
      }).success,
    ).toBe(false);
    expect(
      inspirationRequestSchema.safeParse({
        kind: "artist",
        artist: "A",
        modelOverride: "admin-model",
      }).success,
    ).toBe(false);
  });
});

it("rejects private addresses, encoded IPs and suspicious ports", () => {
  for (const url of [
    "https://127.0.0.1",
    "https://2130706433",
    "https://0x7f000001",
    "https://[::1]",
    "https://10.1.2.3",
    "https://foo.local",
    "https://example.org:8443",
    "https://example.org.",
  ])
    expect(isPublicInspirationUrl(url)).toBe(false);
});
it("validates exact quote substrings and trusted receipt identity", () => {
  const documents = [
    {
      sourceId: "src-1",
      text: "Credits: Synthesizers were used.",
      receipt: base.sources[0]!.receipt,
    },
  ];
  expect(validateInspirationResearchEvidence(base, documents).evidence).toHaveLength(1);
  expect(() =>
    validateInspirationResearchEvidence(base, [{ ...documents[0]!, text: "Search snippet only" }]),
  ).toThrow();
  expect(() =>
    validateInspirationResearchEvidence(base, [
      { ...documents[0]!, receipt: { ...documents[0]!.receipt, contentSha256: "b".repeat(64) } },
    ]),
  ).toThrow();
  expect(() => validateInspirationResearchEvidence(base, [...documents, ...documents])).toThrow();
});
it("does not promote disputed evidence or duplicate citations", () => {
  expect(
    inspirationResearchSchema.safeParse({
      ...base,
      evidence: [{ ...base.evidence[0], classification: "disputed" }],
    }).success,
  ).toBe(false);
  expect(
    inspirationResearchSchema.safeParse({
      ...base,
      evidence: [{ ...base.evidence[0], sourceIds: ["src-1", "src-1"] }],
    }).success,
  ).toBe(false);
  expect(
    inspirationResearchSchema.safeParse({
      ...base,
      sources: [{ ...base.sources[0]!, accessedEvidence: "search_snippet" }],
    }).success,
  ).toBe(false);
});

it("canonical retriever API binds exact source metadata and mandatory quotes", () => {
  const parsed = inspirationResearchSchema.parse(base);
  const docs = [{ source: parsed.sources[0]!, text: "Credits: Synthesizers were used." }];
  expect(() => assertInspirationEvidenceMatchesSources(parsed, docs)).not.toThrow();
  expect(() =>
    assertInspirationEvidenceMatchesSources(parsed, [{ ...docs[0]!, text: "Different text" }]),
  ).toThrow();
  expect(() =>
    assertInspirationEvidenceMatchesSources(parsed, [
      { ...docs[0]!, source: { ...docs[0]!.source, title: "Fabricated title" } },
    ]),
  ).toThrow();
  expect(() =>
    assertInspirationEvidenceMatchesSources(
      { ...parsed, evidence: [{ ...parsed.evidence[0]!, citedPassages: [] }] },
      docs,
    ),
  ).toThrow();
});

it("allows a selected source subset but rejects missing or snippet-only source evidence", () => {
  const parsed = inspirationResearchSchema.parse(base);
  const source = parsed.sources[0]!;
  const docs = [
    { source, text: "Synthesizers were used." },
    { source: { ...source, id: "extra" }, text: "Unused source" },
  ];
  expect(() => assertInspirationEvidenceMatchesSources(parsed, docs)).not.toThrow();
  expect(() => assertInspirationEvidenceMatchesSources(parsed, [])).toThrow();
  expect(() =>
    assertInspirationEvidenceMatchesSources(
      { ...parsed, sources: [{ ...source, accessedEvidence: "search_snippet" }] },
      [
        {
          source: { ...source, accessedEvidence: "search_snippet" },
          text: "Synthesizers were used.",
        },
      ],
    ),
  ).toThrow();
});
