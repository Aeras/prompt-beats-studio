import { expect, it } from "bun:test";
import { validateInspirationResearchEvidence } from "./music-inspiration.shared";
// Synthetic offline examples, never historical facts about the named artists.
for (const artist of ["Мираж", "Ласковый май", "Кино"]) {
  for (const request of [
    { kind: "artist", artist, depth: "standard" },
    { kind: "artist", artist, song: "Synthetic fixture song", depth: "extended" },
    {
      kind: "description",
      description: `Synthetic freeform original arrangement for ${artist}`,
      depth: "standard",
    },
  ])
    it(`synthetic fixture only: ${artist} ${request.kind} ${"song" in request ? "song" : ""}`, () => {
      const receipt = {
        documentId: "fixture-doc",
        finalUrl: "https://example.org/synthetic",
        retrievedAt: "2026-10-28T00:00:00.000Z",
        contentSha256: "a".repeat(64),
        accessibility: "accessible",
      } as const;
      const quote = "Synthetic fixture only: an imaginary arrangement uses keyboard.";
      const result = validateInspirationResearchEvidence(
        {
          version: 1,
          researchPromptVersion: "1",
          request,
          sources: [
            {
              id: "s",
              title: "Synthetic fixture, not historical facts",
              url: receipt.finalUrl,
              publisher: null,
              accessedAt: receipt.retrievedAt,
              locator: "Fixture",
              sourceType: "other",
              receipt,
            },
          ],
          evidence: [
            {
              id: "e",
              claim: quote,
              dimension: "instrumentation",
              classification: "bounded",
              sourceIds: ["s"],
              citedPassages: [{ sourceId: "s", quote, locator: "Fixture" }],
              limitation: "Synthetic data, no historical facts.",
            },
          ],
          unresolvedQuestions: ["Actual instrumentation unknown."],
          proposal: {
            musicStyles: ["Pop"],
            moods: [],
            instruments: ["Keyboard"],
            bpm: null,
            productionStyle: "",
            additionalInstructions: "Original song",
            songStructure: ["Chorus", "Chorus"],
            blueprint: [0, 1].map((structureIndex) => ({
              structureIndex,
              sectionType: "Chorus",
              instruction: "",
              energy: null,
            })),
            supportingEvidenceIds: ["e"],
            creativeChoices: ["Keyboard arrangement is a creative choice."],
          },
        },
        [{ sourceId: "s", text: quote, receipt }],
      );
      expect(result.request.kind).toBe(request.kind);
      expect(result.proposal.bpm).toBeNull();
    });
}
