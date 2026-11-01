import { describe, expect, it } from "bun:test";
import { validateAiFixtureBatch } from "./football-ai-fixture-validation.shared";
import { FOOTBALL_AI_DISCOVERY_LEAGUES, FOOTBALL_AI_REFRESH_QUOTA } from "./football-research.shared";

const now = new Date("2026-11-03T00:00:00Z");
const fx = (over: Record<string, unknown> = {}) => ({
  leagueId: "EN-PL",
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  kickoffUtc: "2026-11-07T15:00:00Z",
  sources: [],
  ...over,
});

describe("AI fixture validation", () => {
  it("has the 12 agreed competitions with flags or cup icons", () => {
    expect(FOOTBALL_AI_DISCOVERY_LEAGUES).toHaveLength(12);
    expect(FOOTBALL_AI_DISCOVERY_LEAGUES.filter((l) => l.kind === "cup").map((l) => l.id)).toEqual([
      "UEFA-CL",
      "UEFA-EL",
    ]);
  });
  it("per-user refresh quota is 3 per hour and 10 per day", () => {
    expect(FOOTBALL_AI_REFRESH_QUOTA).toEqual({ perHour: 3, perDay: 10 });
  });
  it("normalizes kickoff to UTC and drops invalid items instead of failing the batch", () => {
    const out = validateAiFixtureBatch(
      {
        fixtures: [
          fx({ kickoffUtc: "2026-11-07T16:00:00+01:00" }),
          fx({ leagueId: "ES-LL", homeTeam: "A1", awayTeam: "B1" }),
          fx({ homeTeam: "Same", awayTeam: "same" }),
          fx({ homeTeam: "Old", awayTeam: "Past", kickoffUtc: "2026-11-02T10:00:00Z" }),
          fx({ homeTeam: "Late", awayTeam: "Week", kickoffUtc: "2026-11-09T10:00:00Z" }),
          fx({ kickoffUtc: "2026-11-07T15:00:00Z" }),
        ],
      },
      "EN-PL",
      "2026-11-04",
      now,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.kickoffUtc).toBe("2026-11-07T15:00:00.000Z");
  });
  it("rejects non-https source URLs from the model", () => {
    expect(() =>
      validateAiFixtureBatch({ fixtures: [fx({ sources: [{ url: "http://x.com/a", title: "t" }] })] }, "EN-PL", "2026-11-04", now),
    ).toThrow();
  });
});
