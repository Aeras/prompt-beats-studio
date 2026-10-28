import { describe, expect, it } from "vitest";
import { inspirationRequestSchema, inspirationResearchSchema } from "./music-inspiration.shared";

const base = {
  version: 1 as const,
  researchPromptVersion: "1" as const,
  request: { kind: "artist" as const, artist: "Example Group", depth: "standard" as const },
  sources: [{
    id: "src-1", title: "Credits", url: "https://example.org/credits",
    publisher: null, accessedAt: "2026-10-28T00:00:00.000Z", locator: "Credits",
    sourceType: "credits" as const,
  }],
  evidence: [{
    id: "ev-1", claim: "Synthesizers were used.", dimension: "instrumentation" as const,
    classification: "supported" as const, sourceIds: ["src-1"], limitation: "",
  }],
  unresolvedQuestions: [],
  proposal: {
    musicStyles: ["Pop"], moods: ["Nostalgic"], instruments: ["Synth"],
    bpm: 120, productionStyle: "Electronic", additionalInstructions: "Write an original song.",
    songStructure: ["Intro", "Verse", "Chorus"],
    blueprint: [
      { structureIndex: 0, sectionType: "Intro", instruction: "Sparse synth.", energy: 2 },
      { structureIndex: 1, sectionType: "Verse", instruction: "Warm pads.", energy: 3 },
      { structureIndex: 2, sectionType: "Chorus", instruction: "Fuller drums.", energy: 4 },
    ],
    supportingEvidenceIds: ["ev-1"], creativeChoices: ["120 BPM is a creative suggestion."],
  },
};

describe("music inspiration research contract", () => {
  it("accepts supported research with consistent blueprint", () => {
    expect(inspirationResearchSchema.safeParse(base).success).toBe(true);
  });
  it("rejects invented source links", () => {
    expect(inspirationResearchSchema.safeParse({
      ...base, evidence: [{ ...base.evidence[0], sourceIds: ["invented"] }],
    }).success).toBe(false);
  });
  it("requires attribution for supported claims", () => {
    expect(inspirationResearchSchema.safeParse({
      ...base, evidence: [{ ...base.evidence[0], sourceIds: [] }],
    }).success).toBe(false);
  });
  it("rejects a shifted blueprint", () => {
    expect(inspirationResearchSchema.safeParse({
      ...base, proposal: { ...base.proposal, blueprint: [
        { ...base.proposal.blueprint[0], structureIndex: 1 },
        ...base.proposal.blueprint.slice(1),
      ] },
    }).success).toBe(false);
  });
  it("does not allow theme or language to be supplied in proposals", () => {
    expect(inspirationResearchSchema.safeParse({
      ...base, proposal: { ...base.proposal, theme: "Override", language: "Russian" },
    }).success).toBe(false);
  });
  it("requires substantive descriptions, rejects extra keys", () => {
    expect(inspirationRequestSchema.safeParse({
      kind: "description", description: "pop", depth: "standard",
    }).success).toBe(false);
    expect(inspirationRequestSchema.safeParse({
      kind: "artist", artist: "A", modelOverride: "admin-model",
    }).success).toBe(false);
  });
});
