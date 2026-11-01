import { describe, expect, test } from "bun:test";
import { fetchFootballWeek, footballSeasonStartYear, footballWeekBounds } from "./football-fixtures.server";

describe("private football fixture adapter", () => {
  test("Monday to Sunday calendar and season boundary", () => {
    expect(footballWeekBounds("2026-11-01")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(footballWeekBounds("2027-01-01")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(footballSeasonStartYear("2027-01-01")).toBe(2026);
    expect(footballSeasonStartYear("2026-07-01")).toBe(2026);
    expect(() => footballWeekBounds("2026-02-30")).toThrow();
  });
  test("never substitutes invented fixture data when provider missing", async () => {
    await expect(fetchFootballWeek("GR-SL", "2026-11-01", fetch, "")).rejects.toThrow("not configured");
  });
  test("validates status and displays only league-matched fixtures", async () => {
    const mockFetch = (async (_url: unknown, options: RequestInit) => {
      expect((options.headers as Record<string,string>)["x-apisports-key"]).toBe("test-key");
      return new Response(JSON.stringify({
        response: [
          { fixture: { id: 1, date: "2026-11-01T18:00:00+00:00", status: { short: "NS" } }, league: { id: 197 }, teams: { home: { name: "A" }, away: { name: "B" } } },
          { fixture: { id: 2, date: "2026-11-01T19:00:00+00:00", status: { short: "FT" } }, league: { id: 39 }, teams: { home: { name: "C" }, away: { name: "D" } } },
        ],
        errors: [],
      }), { status: 200 });
    }) as typeof fetch;
    const result = await fetchFootballWeek("GR-SL", "2026-11-01", mockFetch, "test-key");
    expect(result.map((f) => f.sourceFixtureId)).toEqual(["1"]);
    expect(result[0]?.state).toBe("scheduled");
  });
});
