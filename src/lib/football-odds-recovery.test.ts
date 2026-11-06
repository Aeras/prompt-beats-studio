import { describe, expect, test } from "bun:test";
import {
  collectBookmakerOdds,
  collectFootballBookmakerOdds,
  type OddsJournal,
} from "./football-odds.server";
import { footballSourceJson } from "./football-source-http.server";
import type { OddsTarget } from "./football-odds.shared";
const long = "site_pregame_stoiximan_soccer_leagues.json",
  near = "site_pregame_stoiximan_soccer.json";
const at = "2026-11-06T08:45:49.000Z",
  now = () => Date.parse(at);
const pairs = [
  ["Venezia", "Udinese"],
  ["Cagliari", "Frosinone"],
  ["Torino", "Lecce"],
  ["Parma", "Bologna"],
  ["AS Roma", "Sassuolo"],
  ["Napoli", "Lazio"],
  ["Genoa", "AC Milan"],
  ["Monza", "Atalanta"],
  ["Internazionale", "Como"],
  ["Fiorentina", "Juventus"],
];
const targets: OddsTarget[] = pairs.map(([homeTeam, awayTeam], i) => ({
  leagueId: "IT-SA",
  homeTeam: homeTeam!,
  awayTeam: awayTeam!,
  kickoffUtc: [
    "2026-11-06T19:45:00.000Z",
    "2026-11-07T14:00:00.000Z",
    "2026-11-07T14:00:00.000Z",
    "2026-11-07T17:00:00.000Z",
    "2026-11-07T19:45:00.000Z",
    "2026-11-08T11:30:00.000Z",
    "2026-11-08T14:00:00.000Z",
    "2026-11-08T14:00:00.000Z",
    "2026-11-08T17:00:00.000Z",
    "2026-11-08T19:45:00.000Z",
  ][i]!,
}));
const env = { ARBPLAY_API_KEY: "offline-fixture-only" };
/** Structurally representative synthetic data; not a licensed provider export. */
function feed(file: string, observed = at) {
  return {
    company: "stoiximan",
    file,
    updated_at: observed,
    data: [
      {
        data: {
          blocks: [
            {
              events: targets.flatMap((t, i) => {
                if ((file === near) !== (i === 0)) return [];
                return [
                  {
                    id: `fixture-${i}`,
                    sportId: "FOOT",
                    leagueId: "1635",
                    leagueName: "Serie A",
                    participants: [{ name: t.homeTeam }, { name: t.awayTeam }],
                    startTime: Date.parse(t.kickoffUtc),
                    markets: [
                      {
                        type: "MRES",
                        id: `m-${i}`,
                        selections: [
                          { id: `1-${i}`, name: "1", price: 2 + i / 10 },
                          { id: `x-${i}`, name: "X", price: 3.5 },
                          { id: `2-${i}`, name: "2", price: 4 },
                        ],
                      },
                      {
                        type: "BTSC",
                        id: `b-${i}`,
                        selections: [
                          { id: `by-${i}`, name: "Yes", price: 1.8 },
                          { id: `bn-${i}`, name: "No", price: 2 },
                        ],
                      },
                      {
                        type: "DBLC",
                        id: `d-${i}`,
                        selections: [
                          { id: `d1-${i}`, name: "1X", price: 1.3 },
                          { id: `d2-${i}`, name: "X2", price: 1.5 },
                          { id: `d3-${i}`, name: "12", price: 1.4 },
                        ],
                      },
                      {
                        type: "HCTG",
                        id: `o-${i}`,
                        handicap: 2.5,
                        selections: [
                          { id: `oy-${i}`, name: "Over 2.5", price: 1.8 },
                          { id: `on-${i}`, name: "Under 2.5", price: 2 },
                        ],
                      },
                    ],
                  },
                ];
              }),
            },
          ],
        },
      },
    ],
  };
}
describe("ten-match shared odds regression", () => {
  test("one missing feed cannot conceal the other feed's pending retrieval", async () => {
    const empty = feed(long);
    empty.data[0]!.data.blocks[0]!.events = [];
    const j: OddsJournal = {
      claim: async (file) =>
        file === long
          ? { status: "cached", payload: empty, retrievedAtUtc: at }
          : { status: "busy" },
      finish: async () => {
        throw Error("Unexpected mutation");
      },
    };
    const r = await collectFootballBookmakerOdds(targets[1]!, { env, journal: j, now });
    expect(r.status).toBe("busy");
    expect(r.quotes).toHaveLength(0);
    expect(r.feedStatuses?.map((f) => f.status)).toEqual(["missing", "busy"]);
  });
  test("abandoned long feed remains recovery_pending; stale old payload never becomes nine fake prices", async () => {
    let calls = 0;
    const j: OddsJournal = {
      claim: async (file) =>
        file === long
          ? { status: "busy" }
          : { status: "cached", payload: feed(near), retrievedAtUtc: at },
      read: async () => ({ status: "recovery_pending" }),
      finish: async () => {
        throw Error("unexpected mutation");
      },
    };
    const results = [];
    for (const t of targets)
      results.push(
        await collectFootballBookmakerOdds(t, {
          env,
          journal: j,
          now,
          fetcher: async () => {
            calls++;
            throw Error("unexpected GET");
          },
        }),
      );
    expect(results[0]!.status).toBe("matched");
    expect(results[0]!.quotes).toHaveLength(10);
    expect(
      results.slice(1).every((r) => r.status === "recovery_pending" && r.quotes.length === 0),
    ).toBe(true);
    expect(calls).toBe(0);
    expect(results[1]!.feedStatuses?.map((f) => f.status)).toEqual(["recovery_pending", "missing"]);
  });
  test("ten serial matches reuse two shared payloads with exactly two source requests", async () => {
    const cache = new Map<string, unknown>();
    let calls = 0;
    const j: OddsJournal = {
      claim: async (file) =>
        cache.has(file)
          ? { status: "cached", payload: cache.get(file), retrievedAtUtc: at }
          : { status: "claimed", token: file },
      finish: async (token, payload) => {
        cache.set(token, payload);
      },
    };
    for (const [i, t] of targets.entries()) {
      const r = await collectFootballBookmakerOdds(t, {
        env,
        journal: j,
        now,
        fetcher: async (url) => {
          calls++;
          return new Response(
            JSON.stringify(feed(new URL(String(url)).pathname.split("/").at(-1)!)),
            { headers: { "Content-Type": "application/json" } },
          );
        },
      });
      expect(r.status).toBe("matched");
      expect(r.providerFixtureId).toBe(`fixture-${i}`);
      expect(r.quotes.find((q) => q.market === "home_win")?.decimal).toBe(2 + i / 10);
    }
    expect(calls).toBe(2);
  });
  for (const state of ["busy", "recovery_pending", "rate_limited", "quota_exhausted", "stale"])
    test(`cache-only ${state} never claims, dispatches or mutates`, async () => {
      let claims = 0,
        gets = 0,
        finishes = 0;
      const j: OddsJournal = {
        read: async () => ({ status: state }),
        claim: async () => {
          claims++;
          return { status: "claimed", token: "x" };
        },
        finish: async () => {
          finishes++;
        },
      };
      const r = await collectBookmakerOdds(targets[1]!, {
        env,
        journal: j,
        cacheOnly: true,
        now,
        fetcher: async () => {
          gets++;
          throw Error("unexpected");
        },
      });
      expect(r.status).toBe(state);
      expect([claims, gets, finishes]).toEqual([0, 0, 0]);
    });
  test("lost receipt before commit never replaces the unknown result with failure or another GET", async () => {
    let gets = 0,
      finishes = 0;
    const j: OddsJournal = {
      claim: async () => ({ status: "claimed", token: "x" }),
      read: async () => ({ status: "recovery_pending" }),
      finish: async () => {
        finishes++;
        throw Error("lost receipt");
      },
    };
    const r = await collectBookmakerOdds(targets[1]!, {
      env,
      journal: j,
      now,
      fetcher: async () => {
        gets++;
        return new Response(JSON.stringify(feed(long)), {
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    expect(r.status).toBe("recovery_pending");
    expect([gets, finishes]).toEqual([1, 1]);
  });
  for (const [retrieved, observed] of [
    ["2026-11-06T08:45:48Z", "2026-11-06T08:01:55Z"],
    ["2026-11-06T08:30:49Z", "2026-11-06T08:30:48Z"],
    ["2026-11-06T08:45:50Z", at],
    [at, "2026-11-06T08:45:50Z"],
  ])
    test(`cache/source capture checked against current time: ${retrieved}/${observed}`, async () => {
      const j: OddsJournal = {
        claim: async () => ({
          status: "cached",
          payload: feed(long, observed!),
          retrievedAtUtc: retrieved!,
        }),
        finish: async () => {
          throw Error("unexpected");
        },
      };
      const r = await collectBookmakerOdds(targets[1]!, { env, journal: j, now });
      expect(r.status).toBe("stale");
      expect(r.quotes).toHaveLength(0);
    });
  test("stalled response body is bounded even if reader ignores the fetch abort signal", async () => {
    const controller = new AbortController();
    let cancelled = false;
    const promise = footballSourceJson(new URL("https://stoiximan.jojapi.net/v1/data/" + long), {
      signal: controller.signal,
      fetcher: async () =>
        new Response(
          new ReadableStream({
            pull: () => new Promise(() => {}),
            cancel: () => {
              cancelled = true;
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    });
    setTimeout(() => controller.abort(), 15);
    await expect(promise).rejects.toMatchObject({ status: "timeout" });
    expect(cancelled).toBe(true);
  });
});
