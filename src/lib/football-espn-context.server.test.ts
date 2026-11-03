import { describe, expect, it } from "bun:test";
import {
  fetchEspnMatchContext,
  parseEspnRecentResults,
  parseEspnStandings,
} from "./football-espn-context.server";
import type { FootballFixture } from "./football-research.shared";

const kickoffUtc = "2026-11-09T20:00:00.000Z";
const fixture: FootballFixture = {
  source: "espn",
  sourceFixtureId: "999999",
  leagueId: "EN-PL",
  homeTeam: "Home United",
  awayTeam: "Away City",
  kickoffUtc,
  state: "scheduled",
  fetchedAtUtc: "2026-11-03T08:00:00.000Z",
};
const standings = {
  children: [
    {
      standings: {
        entries: [
          {
            team: { id: "10", displayName: "Home United" },
            rank: 2,
            stats: [
              { name: "points", displayValue: "25" },
              { name: "wins", displayValue: "8" },
            ],
          },
          {
            team: { id: "20", displayName: "Away City" },
            rank: 5,
            stats: [{ name: "points", displayValue: "19" }],
          },
        ],
      },
    },
  ],
};
const summary = {
  header: {
    competitions: [
      {
        competitors: [
          { homeAway: "home", team: { id: "10", displayName: "Home United" } },
          { homeAway: "away", team: { id: "20", displayName: "Away City" } },
        ],
      },
    ],
  },
};
const resultEvent = {
  id: "123",
  date: "2026-11-01T15:00:00Z",
  status: { type: { completed: true } },
  competitions: [
    {
      competitors: [
        { homeAway: "home", team: { id: "10" }, score: "2" },
        { homeAway: "away", team: { id: "11", displayName: "Rivals" }, score: "1" },
      ],
    },
  ],
};

describe("ESPN provider-first pre-match data", () => {
  it("extracts the standings metrics without treating absent stats as zero", () => {
    const result = parseEspnStandings(standings);
    expect(result.find((x) => x.teamId === "10")?.rank).toBe(2);
    expect(result.find((x) => x.teamId === "10")?.metrics).toEqual([
      { name: "points", value: "25" },
      { name: "wins", value: "8" },
    ]);
    expect(parseEspnStandings({}).length).toBe(0);
  });

  it("takes only completed pre-kickoff results, ordered and bounded", () => {
    const results = parseEspnRecentResults(
      {
        events: [
          resultEvent,
          { ...resultEvent, id: "124", date: "2026-11-10T15:00:00Z" },
        ],
      },
      "10",
      kickoffUtc,
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.opponent).toBe("Rivals");
    expect(results[0]?.goalsFor).toBe(2);
  });

  it("retrieves structured ESPN data and marks unsupported fields as missing", async () => {
    const requested: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());
      requested.push(url.pathname);
      if (url.pathname.endsWith("/standings")) return new Response(JSON.stringify(standings));
      if (url.pathname.endsWith("/summary")) return new Response(JSON.stringify(summary));
      if (url.pathname.endsWith("/scoreboard"))
        return new Response(JSON.stringify({ events: [] }));
      if (url.pathname.endsWith("/teams/10/schedule"))
        return new Response(JSON.stringify({ events: [resultEvent] }));
      if (url.pathname.endsWith("/teams/10"))
        return new Response(
          JSON.stringify({
            team: { statistics: [{ name: "shots", displayValue: "50" }] },
          }),
        );
      if (url.pathname.endsWith("/teams/10/roster"))
        return new Response(
          JSON.stringify({
            athletes: [
              { items: [{ displayName: "Player A", position: { displayName: "Forward" } }] },
            ],
          }),
        );
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const data = await fetchEspnMatchContext(
      "EN-PL",
      fixture,
      fetcher,
      () => Date.parse("2026-11-03T08:00:00Z"),
    );
    expect(data.home.standing?.metrics.find((x) => x.name === "points")?.value).toBe("25");
    expect(data.away.standing?.rank).toBe(5);
    expect(data.home.recentResults).toHaveLength(1);
    expect(data.home.roster[0]?.name).toBe("Player A");
    expect(data.home.teamStatistics[0]?.value).toBe("50");
    expect(data.missing).toContain("xG/xGA: μη διαθέσιμο από ESPN");
    expect(data.availability.injuries).toBe(false);
    expect(requested).toHaveLength(11);
    expect(
      requested.some((url) => url.endsWith("/apis/v2/sports/soccer/eng.1/standings")),
    ).toBe(true);
  });

  it("rejects a fixture from the wrong provider before any request", async () => {
    await expect(
      fetchEspnMatchContext("EN-PL", { ...fixture, source: "api-football" }),
    ).rejects.toThrow("Invalid ESPN fixture");
  });
});
