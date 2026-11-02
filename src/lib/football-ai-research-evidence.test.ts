import { describe, expect, it } from "vitest";
import { footballResearchEvidenceSnapshotSchema } from "./football-ai-research.shared";

const reference = (researchIntent: "match_facts" | "external_forecasts") => ({
  title: "Preview",
  url: "https://example.com/fixture",
  accessedAt: "2026-11-02T14:00:00.000Z",
  excerpt: "An unverified match report",
  researchIntent,
});
describe("pre-match reusable evidence snapshot", () => {
  it("keeps the research and forecasts separate and marks them as unverified", () => {
    expect(
      footballResearchEvidenceSnapshotSchema.parse({
        collectedAtUtc: "2026-11-02T14:00:00.000Z",
        matchFacts: [reference("match_facts")],
        externalForecasts: [reference("external_forecasts")],
        evidenceStatus: "unverified_source_extracts",
      }).evidenceStatus,
    ).toBe("unverified_source_extracts");
  });
  it("rejects more than 18 records combined and unsupported verified labels", () => {
    const data = {
      collectedAtUtc: "2026-11-02T14:00:00.000Z",
      matchFacts: Array.from({ length: 18 }, () => reference("match_facts")),
      externalForecasts: [reference("external_forecasts")],
      evidenceStatus: "unverified_source_extracts",
    };
    expect(footballResearchEvidenceSnapshotSchema.safeParse(data).success).toBe(false);
    expect(
      footballResearchEvidenceSnapshotSchema.safeParse({
        ...data,
        matchFacts: [],
        evidenceStatus: "verified",
      }).success,
    ).toBe(false);
  });
});
