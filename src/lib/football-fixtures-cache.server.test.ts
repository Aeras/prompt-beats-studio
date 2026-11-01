import { describe, expect, test } from "bun:test";
import { getCachedFootballWeek } from "./football-fixtures-cache.server";
import type { FootballFixture } from "./football-research.shared";

describe("football fixtures cache", () => {
  test("deduplicates simultaneous lookups, protects cached data and refetches after expiry", async () => {
    let calls = 0;
    let clock = 1000;
    const loader = async (_league: unknown, _date: unknown): Promise<FootballFixture[]> => {
      calls++;
      await Promise.resolve();
      return [
        {
          source: "mock",
          sourceFixtureId: "777",
          leagueId: "DE-BL",
          homeTeam: "Home",
          awayTeam: "Away",
          kickoffUtc: "2026-11-02T18:00:00Z",
          fetchedAtUtc: "2026-11-01T12:00:00Z",
          state: "scheduled",
        },
      ];
    };
    const [a, b] = await Promise.all([
      getCachedFootballWeek("DE-BL", "2026-11-02", loader, () => clock),
      getCachedFootballWeek("DE-BL", "2026-11-03", loader, () => clock),
    ]);
    expect(calls).toBe(1);
    a[0]!.homeTeam = "Changed";
    expect(b[0]!.homeTeam).toBe("Home");
    const c = await getCachedFootballWeek("DE-BL", "2026-11-03", loader, () => clock);
    expect(c[0]!.homeTeam).toBe("Home");
    expect(calls).toBe(1);
    clock += 15 * 60 * 1000 + 1;
    await getCachedFootballWeek("DE-BL", "2026-11-03", loader, () => clock);
    expect(calls).toBe(2);
  });
});
