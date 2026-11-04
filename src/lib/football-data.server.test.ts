import { describe, expect, test } from "bun:test";
import { fetchFootballDataWeek } from "./football-data.server";

describe("football-data.org weekly adapter", () => {
  test("uses server-only token, exact league, 2026 dates and official goal result", async () => {
    const mock = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/v4/competitions/PL/matches");
      expect(url.searchParams.get("dateFrom")).toBe("2026-10-26");
      expect(url.searchParams.get("dateTo")).toBe("2026-11-01");
      expect((init?.headers as Record<string, string>)["X-Auth-Token"]).toBe("fake-token");
      return new Response(
        JSON.stringify({
          matches: [
            {
              id: 444,
              utcDate: "2026-11-01T18:00:00Z",
              status: "SCHEDULED",
              homeTeam: { name: "A" },
              awayTeam: { name: "B" },
              score: { fullTime: { home: null, away: null } },
            },
            {
              id: 445,
              utcDate: "2026-10-29T18:00:00Z",
              status: "FINISHED",
              homeTeam: { name: "C" },
              awayTeam: { name: "D" },
              score: { duration: "REGULAR", fullTime: { home: 2, away: 1 } },
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    const result = await fetchFootballDataWeek("EN-PL", "2026-11-01", mock, "fake-token");
    expect(result.map((x) => x.sourceFixtureId)).toEqual(["445", "444"]);
    expect(result[0]?.source).toBe("football-data");
    expect(result[0]?.providerStatus).toBe("FT");
    expect(result[0]?.homeGoals).toBe(2);
    expect(result[1]?.state).toBe("scheduled");
  });
  test("rejects unsupported Greece and missing secret without network call", async () => {
    const never = (async () => {
      throw new Error("Unexpected request");
    }) as typeof fetch;
    await expect(fetchFootballDataWeek("GR-SL", "2026-11-01", never, "fake-token")).rejects.toThrow(
      "does not include",
    );
    await expect(fetchFootballDataWeek("EN-PL", "2026-11-01", never, "")).rejects.toThrow(
      "not configured",
    );
  });
  test("does not silently swallow limited plan or authentication errors", async () => {
    const limited = (async () => new Response("{}", { status: 429 })) as typeof fetch;
    await expect(
      fetchFootballDataWeek("EN-PL", "2026-11-01", limited, "fake-token"),
    ).rejects.toThrow("rate limit");
  });
});
