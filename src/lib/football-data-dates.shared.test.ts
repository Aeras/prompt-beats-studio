import { expect, test } from "bun:test";
import { footballDataExclusiveEnd } from "./football-data-dates.shared";
import { collectFootballProviderEvidence } from "./football-provider-evidence.server";

test("exclusive v4 end handles month, year, leap day and DST without an empty range", () => {
  for (const [day, end] of [
    ["2026-11-08", "2026-11-09"],
    ["2026-12-31", "2027-01-01"],
    ["2028-02-29", "2028-03-01"],
    ["2026-03-29", "2026-03-30"],
  ])
    expect(footballDataExclusiveEnd(day!)).toBe(end!);
  for (const day of ["2026-02-30", "invalid", "2026-13-01"])
    expect(() => footballDataExclusiveEnd(day)).toThrow();
});

test("Fiorentina Juventus day query uses a nonempty official v4 interval and preserves exact fixture", async () => {
  const kickoff = "2026-11-08T19:45:00Z";
  const requested: string[] = [];
  const result = await collectFootballProviderEvidence(
    { leagueId: "IT-SA", homeTeam: "Fiorentina", awayTeam: "Juventus", kickoffUtc: kickoff },
    {
      cache: false,
      env: { FOOTBALL_DATA_API_KEY: "offline-not-a-key" },
      now: () => Date.parse("2026-11-06T08:00:00Z"),
      fetcher: async (input) => {
        const url = new URL(String(input));
        requested.push(url.toString());
        if (url.hostname !== "api.football-data.org") return Response.json({ events: [] });
        if (url.pathname.includes("/competitions/SA/matches")) {
          expect(url.searchParams.get("dateFrom")).toBe("2026-11-08");
          expect(url.searchParams.get("dateTo")).toBe("2026-11-09");
          const matches =
            url.searchParams.get("dateFrom") === url.searchParams.get("dateTo")
              ? []
              : [
                  {
                    id: 123,
                    utcDate: kickoff,
                    status: "TIMED",
                    homeTeam: { id: 99, name: "Fiorentina" },
                    awayTeam: { id: 109, name: "Juventus FC" },
                    score: { fullTime: { home: null, away: null } },
                  },
                ];
          return Response.json({ matches });
        }
        return Response.json(
          url.pathname.endsWith("/matches") ? { matches: [] } : { standings: [] },
        );
      },
    },
  );
  const source = result.providers.find((p) => p.provider === "football-data")!;
  expect(source.fixtureId).toBe("123");
  expect(source.status).toBe("partial"); // No invented historical statistics in this synthetic fixture.
  expect(source.home?.name).toBe("Fiorentina");
  expect(source.away?.name).toBe("Juventus");
  expect(requested.filter((u) => u.includes("/competitions/SA/matches"))).toHaveLength(1);
});
