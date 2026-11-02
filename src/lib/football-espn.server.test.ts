import { describe, expect, test } from "bun:test";
import { ESPN_LEAGUE_CODES, parseEspnScoreboard, fetchEspnFootballWeek } from "./football-espn.server";

const fixture = {
  events: [{
    id: "123456",
    date: "2026-11-07T17:00:00Z",
    competitions: [{
      competitors: [
        { homeAway: "home", team: { displayName: "Home" } },
        { homeAway: "away", team: { displayName: "Away" } },
      ],
      status: { type: { name: "STATUS_SCHEDULED", state: "pre" } },
    }],
  }],
};

describe("ESPN football schedule adapter", () => {
  test("has 11 competitions, excluding Switzerland", () => {
    expect(Object.keys(ESPN_LEAGUE_CODES)).toHaveLength(11);
    expect(ESPN_LEAGUE_CODES["GR-SL"]).toBe("gre.1");
    expect(ESPN_LEAGUE_CODES["CH-SL"]).toBeUndefined();
  });
  test("parses the fixture without external corroboration", () => {
    const rows = parseEspnScoreboard(fixture, "EN-PL", "2026-11-02", "2026-11-08", "2026-11-02T10:00:00Z");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceFixtureId).toBe("123456");
    expect(rows[0]?.homeTeam).toBe("Home");
    expect(rows[0]?.state).toBe("scheduled");
  });
  test("filters dates and rejects malformed payload", () => {
    expect(parseEspnScoreboard(fixture, "EN-PL", "2026-11-08", "2026-11-14", "2026-11-02T10:00:00Z")).toEqual([]);
    expect(() => parseEspnScoreboard({ events: [{ id: "x" }] }, "EN-PL", "2026-11-02", "2026-11-08", "2026-11-02T10:00:00Z")).toThrow();
  });
  test("requests each day once without an AI key", async () => {
    const urls: string[] = [];
    const fetcher = (async (input: URL | RequestInfo) => {
      urls.push(String(input));
      return new Response(JSON.stringify(fixture), { status: 200 });
    }) as typeof fetch;
    const result = await fetchEspnFootballWeek("EN-PL", "2026-11-07", fetcher);
    expect(result).toHaveLength(1);
    expect(urls).toHaveLength(7);
    expect(urls.every((url) => url.includes("/eng.1/scoreboard?dates="))).toBe(true);
  });
  test("does not admit unsupported ESPN league", async () => {
    await expect(fetchEspnFootballWeek("CH-SL", "2026-11-07")).rejects.toThrow("Unsupported ESPN");
  });
});
