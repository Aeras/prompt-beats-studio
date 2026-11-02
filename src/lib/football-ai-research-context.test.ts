import { describe, expect, it } from "vitest";
import { footballResearchContextSchema, filterResearchContextUrls } from "./football-ai-research.shared";
describe("source-bound football research context", () => {
  it("drops claims about unknown source URLs", () => {
    const data = footballResearchContextSchema.parse({
      claims: [
        { category: "standings", claim: "Reported standings context from a real source", sourceUrl: "https://news.example.com/league", status: "reported" },
        { category: "rest_rotation", claim: "Possible rotation without grounded source reference", sourceUrl: "https://fake.example.com/", status: "scenario" },
      ],
      missing: ["Predicted starting lineups"], conflicts: [],
    });
    const filtered = filterResearchContextUrls(data, ["https://news.example.com/league"]);
    expect(filtered.claims).toHaveLength(1);
    expect(filtered.claims[0]?.category).toBe("standings");
  });
  it("rejects unsupported context categories and extra JSON fields", () => {
    expect(footballResearchContextSchema.safeParse({
      claims: [{ category: "guaranteed_bet", claim: "This is not a legitimate evidence category", sourceUrl: "https://example.com", status: "confirmed" }],
      missing: [], conflicts: [],
    }).success).toBe(false);
  });
});
