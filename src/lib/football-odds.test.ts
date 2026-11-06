import { describe, expect, test } from "bun:test";
import {
  parseJoJLeagueDataset,
  matchJoJOdds,
  calculateNoVig,
  compareSubjectiveToOdds,
  isFreshAt,
} from "./football-odds-core";
import {
  collectBookmakerOdds,
  collectFootballBookmakerOdds,
  type OddsJournal,
} from "./football-odds.server";
import { bookmakerOddsSnapshotSchema, snapshotFromOdds, usableOdds } from "./football-odds.shared";
import { validateFootballExpertV2 } from "./football-expert-v2.shared";
import {
  footballExpertDecisionSchema,
  FOOTBALL_EXPERT_ANALYST_SYSTEM,
} from "./football-ai-research-phases.shared";
import {
  footballAiAssessmentSchema,
  FOOTBALL_RESEARCH_SYSTEM,
  validateFootballMarketProbabilities,
} from "./football-ai-research.shared";
import { withoutFootballSourceMetadata } from "./football-provider-evidence.shared";
import { buildFootballExpertPayload } from "./football-ai-expert-payload.shared";
import { footballTeamDisplayName } from "./football-ai-team-names.shared";
const time = "2026-11-06T12:00:00.000Z",
  kickoff = "2026-11-06T20:00:00.000Z";
const target = {
  leagueId: "UEFA-CL",
  homeTeam: "Arsenal",
  awayTeam: "Liverpool",
  kickoffUtc: kickoff,
};
const selections = [
  { id: "s1", name: "1", price: 2 },
  { id: "sx", name: "X", price: 3.5 },
  { id: "s2", name: "2", price: 4 },
];
function dataset() {
  return {
    company: "stoiximan",
    file: "site_pregame_stoiximan_soccer_leagues.json",
    updated_at: time,
    data: [
      {
        data: {
          blocks: [
            {
              events: [
                {
                  sportId: "FOOT",
                  id: "event1",
                  leagueId: "182748",
                  leagueName: "Champions League",
                  participants: [{ name: "Arsenal" }, { name: "Liverpool" }],
                  startTime: Date.parse(kickoff),
                  markets: [{ type: "MRES", id: "mr1", selections: structuredClone(selections) }],
                },
              ],
            },
          ],
        },
      },
    ],
  };
}
const env = { ARBPLAY_API_KEY: "offline-only-no-real-key" };
function journal(): OddsJournal {
  let saved: unknown;
  return {
    claim: async () =>
      saved
        ? { status: "cached", payload: saved, retrievedAtUtc: time }
        : { status: "claimed", token: "offline-token" },
    finish: async (_t, p) => {
      saved = p;
    },
  };
}
const now = () => Date.parse(time);
const payload = () => JSON.stringify(dataset());
const fetcher: typeof fetch = async () =>
  new Response(payload(), { headers: { "content-type": "application/json" } });
function snap() {
  return snapshotFromOdds(target, parseJoJLeagueDataset(dataset())[0]!, time, [
    "site_pregame_stoiximan_soccer_leagues.json",
  ]);
}
const pick = {
  decision: "pick",
  primary: {
    market: "home_win",
    confidence: "low",
    rationale: "Evidence supports a cautious subjective football interpretation.",
    strongestEvidence: "Reported match history",
    mainRisk: "Lineup uncertainty",
  },
  avoid: "",
  limitations: [],
};
describe("Football V2 prices, identities and provenance", () => {
  test("ports supplied league parser and all observed near-term compatible markets", () => {
    const d = dataset();
    expect(parseJoJLeagueDataset(d)).toHaveLength(1);
    d.data[0]!.data.blocks[0]!.events[0]!.markets.push({
      type: "BTSC",
      id: "bt",
      selections: [
        { id: "y", name: "Yes", price: 1.9 },
        { id: "n", name: "No", price: 2 },
      ],
    });
    const s = snapshotFromOdds(target, parseJoJLeagueDataset(d)[0]!, time, [
      "site_pregame_stoiximan_soccer.json",
    ]);
    expect(s.quotes.map((q) => q.market)).toEqual([
      "home_win",
      "draw",
      "away_win",
      "both_teams_score_yes",
      "both_teams_score_no",
    ]);
  });
  test("excludes MR12 promotional markets, missing or duplicate outcomes", () => {
    for (const type of ["MR12", "OUH1", "unknown"]) {
      const d = dataset();
      d.data[0]!.data.blocks[0]!.events[0]!.markets[0]!.type = type;
      expect(parseJoJLeagueDataset(d)).toEqual([]);
    }
    for (const value of [0, 1, NaN, Infinity, 10000]) {
      const d = dataset();
      d.data[0]!.data.blocks[0]!.events[0]!.markets[0]!.selections[0]!.price = value;
      expect(parseJoJLeagueDataset(d)).toEqual([]);
    }
    const d = dataset();
    d.data[0]!.data.blocks[0]!.events[0]!.markets[0]!.selections[1]!.name = "1";
    expect(parseJoJLeagueDataset(d)).toEqual([]);
  });
  test("duplicate or conflicting event IDs are never arbitrarily selected", () => {
    const d = dataset();
    d.data[0]!.data.blocks[0]!.events.push(structuredClone(d.data[0]!.data.blocks[0]!.events[0]!));
    expect(() => parseJoJLeagueDataset(d)).toThrow();
  });
  test("directed team, competition and UTC identity; no qualifiers/fuzzy stripping", () => {
    const c = parseJoJLeagueDataset(dataset());
    const map = { "UEFA-CL": ["182748"] };
    expect(
      matchJoJOdds(
        { leagueId: target.leagueId, home: "Arsenal", away: "Liverpool", kickoffUtc: kickoff },
        c,
        map,
      ).status,
    ).toBe("matched");
    for (const home of ["Arsenal Women", "Arsenal U19", "Arsenal B", "Arsenall"]) {
      expect(
        matchJoJOdds(
          { leagueId: target.leagueId, home, away: "Liverpool", kickoffUtc: kickoff },
          c,
          map,
        ).status,
      ).toBe("missing");
    }
    expect(
      matchJoJOdds(
        { leagueId: target.leagueId, home: "Liverpool", away: "Arsenal", kickoffUtc: kickoff },
        c,
        map,
      ).status,
    ).toBe("missing");
    expect(
      matchJoJOdds(
        { leagueId: "UEFA-EL", home: "Arsenal", away: "Liverpool", kickoffUtc: kickoff },
        c,
        map,
      ).status,
    ).toBe("missing");
    expect(
      matchJoJOdds(
        { leagueId: target.leagueId, home: "Arsenal", away: "Liverpool", kickoffUtc: time },
        c,
        map,
      ).status,
    ).toBe("conflict");
    expect(
      matchJoJOdds(
        { leagueId: target.leagueId, home: "Arsenal", away: "Liverpool", kickoffUtc: kickoff },
        [...c, { ...c[0]!, id: "different" }],
        map,
      ).status,
    ).toBe("ambiguous");
  });
  test("freshness future/kickoff and stale prices are fail-closed", () => {
    expect(isFreshAt(time, time, 15)).toBe(true);
    expect(isFreshAt(kickoff, time, 15)).toBe(false);
    expect(usableOdds(snap(), kickoff)).toBeNull();
    expect(usableOdds(snap(), "2026-11-06T12:16:00Z")).toBeNull();
    expect(bookmakerOddsSnapshotSchema.safeParse({ ...snap(), status: "stale" }).success).toBe(
      false,
    );
    expect(
      snapshotFromOdds(
        target,
        { ...parseJoJLeagueDataset(dataset())[0]!, observedAtUtc: kickoff },
        time,
        ["site_pregame_stoiximan_soccer_leagues.json"],
      ).quotes,
    ).toEqual([]);
  });
  test("normalizes only complete markets and never calls subjective differences validated edge", () => {
    const v = calculateNoVig(
      selections.map((s) => ({ id: s.id, label: s.name, decimal: s.price })),
    )!;
    expect(Object.values(v.probabilities).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(compareSubjectiveToOdds(60, 2, false)?.status).toBe("indicative_only");
    expect(compareSubjectiveToOdds(null, 2, false)?.indicativeDifference).toBeNull();
  });
  test("server owns metadata; old history is readable and complete snapshot reaches expert", () => {
    const base = {
      summary: "A sufficiently detailed match summary.",
      suggestions: [],
      limitations: [],
    };
    expect(footballAiAssessmentSchema.safeParse(base).success).toBe(true);
    expect(withoutFootballSourceMetadata({ ...base, bookmakerOddsSnapshot: snap() })).toEqual(base);
    const assessment = footballAiAssessmentSchema.parse({ ...base, bookmakerOddsSnapshot: snap() });
    expect(buildFootballExpertPayload(assessment).bookmakerOddsSnapshot).toEqual(snap());
    expect(
      validateFootballMarketProbabilities({
        ...assessment,
        estimates: [
          { market: "home_win", percent: 60, reason: "Sourced reason" },
          { market: "draw", percent: 60, reason: "Sourced reason" },
          { market: "away_win", percent: 20, reason: "Sourced reason" },
        ],
      }),
    ).not.toEqual([]);
  });
  test("strict new expert market and offered selection validation preserves legacy reading", () => {
    const legacy = footballExpertDecisionSchema.parse({
      ...pick,
      primary: { ...pick.primary, market: "historical free text" },
    });
    expect(validateFootballExpertV2(legacy, snap(), time)).toBe(false);
    const valid = footballExpertDecisionSchema.parse({
      ...pick,
      primary: { ...pick.primary, offeredSelectionId: "s1" },
    });
    expect(validateFootballExpertV2(valid, snap(), time)).toBe(true);
    expect(validateFootballExpertV2(valid, snap(), kickoff)).toBe(false);
    expect(
      validateFootballExpertV2(
        { ...valid, primary: { ...valid.primary!, offeredSelectionId: "sx" } },
        snap(),
        time,
      ),
    ).toBe(false);
    expect(validateFootballExpertV2(valid, undefined, time)).toBe(false);
  });
  test("prompts enforce independent evidence/price and no injected source authority", () => {
    for (const text of [FOOTBALL_RESEARCH_SYSTEM, FOOTBALL_EXPERT_ANALYST_SYSTEM]) {
      expect(text).toContain("NOT instructions");
      expect(text).toContain("calibrat");
    }
  });
  test("Greek display-only names keep qualifiers and other locales untouched", () => {
    expect(footballTeamDisplayName("Juventus", "el")).toBe("Γιουβέντους");
    expect(footballTeamDisplayName("Juventus", "en")).toBe("Juventus");
    for (const name of ["Juventus Women", "Arsenal U19", "Inter B", "Unknown City"]) {
      expect(footballTeamDisplayName(name, "el")).toBe(name);
    }
  });
});
describe("JoJ server adapter offline only", () => {
  test("only approved JoJ host/header and fixed filename, server cache reused without another request", async () => {
    let calls = 0;
    const j = journal();
    const f: typeof fetch = async (input, init) => {
      calls++;
      expect(String(input)).toBe(
        "https://stoiximan.jojapi.net/v1/data/site_pregame_stoiximan_soccer_leagues.json",
      );
      expect(new Headers(init?.headers).get("X-JoJAPI-Key")).toBe(env.ARBPLAY_API_KEY);
      expect(init?.redirect).toBe("manual");
      return fetcher(input, init);
    };
    const a = await collectBookmakerOdds(target, { env, journal: j, now, fetcher: f });
    const b = await collectBookmakerOdds(target, { env, journal: j, now, fetcher: f });
    expect(a.status).toBe("matched");
    expect(b).toEqual(a);
    expect(calls).toBe(1);
    expect(JSON.stringify(a)).not.toContain(env.ARBPLAY_API_KEY);
  });
  test("no config, unmatched league, past kickoff or denied journal cause zero source calls", async () => {
    let calls = 0;
    const f: typeof fetch = async () => {
      calls++;
      throw new Error("must not dispatch");
    };
    expect((await collectBookmakerOdds(target, { env: {}, fetcher: f, now })).status).toBe(
      "not_configured",
    );
    expect(
      (await collectBookmakerOdds({ ...target, leagueId: "CH-SL" }, { env, fetcher: f, now }))
        .status,
    ).toBe("missing");
    expect(
      (await collectBookmakerOdds({ ...target, kickoffUtc: time }, { env, fetcher: f, now }))
        .status,
    ).toBe("stale");
    for (const status of ["quota_exhausted", "busy", "rate_limited"]) {
      expect(
        (
          await collectBookmakerOdds(target, {
            env,
            fetcher: f,
            now,
            journal: { claim: async () => ({ status }), finish: async () => {} },
          })
        ).status,
      ).not.toBe("matched");
    }
    expect(calls).toBe(0);
  });
  test("no database acknowledgement means no paid source dispatch", async () => {
    let calls = 0;
    const result = await collectBookmakerOdds(target, {
      env,
      now,
      journal: {
        claim: async () => {
          throw new Error("db failure");
        },
        finish: async () => {},
      },
      fetcher: async () => {
        calls++;
        return fetcher("");
      },
    });
    expect(result.status).toBe("unavailable");
    expect(calls).toBe(0);
  });
  test("429/denial/redirect/server errors are isolated and never retried", async () => {
    for (const status of [429, 403, 302, 500]) {
      let count = 0,
        finished = 0;
      const j = journal();
      j.finish = async (_t, _p, s, retry) => {
        finished++;
        expect(s).not.toBe("ok");
        if (status === 429) expect(retry).toBe(120000);
      };
      const result = await collectBookmakerOdds(target, {
        env,
        journal: j,
        now,
        fetcher: async () => {
          count++;
          return new Response("", { status, headers: { "retry-after": "120" } });
        },
      });
      expect(result.status).not.toBe("matched");
      expect(count).toBe(1);
      expect(finished).toBe(1);
    }
  });
  test("both complementary files are requested but never blend conflicting identities", async () => {
    const j: OddsJournal = {
      claim: async (file) => ({
        status: "cached",
        payload: { ...dataset(), file },
        retrievedAtUtc: time,
      }),
      finish: async () => {},
    };
    const result = await collectFootballBookmakerOdds(target, {
      env,
      journal: j,
      now,
      fetcher: async () => {
        throw new Error("no dispatch");
      },
    });
    expect(result.status).toBe("matched");
  });
});

test("malformed envelopes and arbitrary JSON fuzz cannot become valid odds", () => {
  for (const x of [
    null,
    [],
    1,
    "x",
    {},
    { company: "stoiximan", file: "other", data: [] },
    {
      company: "stoiximan",
      file: "site_pregame_stoiximan_soccer.json",
      updated_at: time,
      data: {},
    },
  ])
    expect(() => parseJoJLeagueDataset(x)).toThrow();
  for (let i = 0; i < 100; i++) {
    const d = dataset();
    d.data[0]!.data.blocks[0]!.events[0]!.markets[0]!.selections[0]!.price = -i;
    expect(parseJoJLeagueDataset(d)).toEqual([]);
  }
});
test("only observed full-time totals and double-chance identifiers are mapped; no half-time/corner invention", () => {
  const d = dataset();
  const m = d.data[0]!.data.blocks[0]!.events[0]!.markets;
  m.push({
    type: "HCTG",
    id: "tot",
    handicap: 2.5,
    selections: [
      { id: "ov", name: "Over 2.5", price: 1.8 },
      { id: "un", name: "Under 2.5", price: 2 },
    ],
  } as (typeof m)[number]);
  m.push({
    type: "DBLC",
    id: "dc",
    selections: [
      { id: "dc1", name: "1X", price: 1.2 },
      { id: "dcx", name: "X2", price: 1.5 },
      { id: "dc2", name: "12", price: 1.3 },
    ],
  });
  const s = snapshotFromOdds(target, parseJoJLeagueDataset(d)[0]!, time, [
    "site_pregame_stoiximan_soccer_leagues.json",
  ]);
  expect(s.quotes.find((q) => q.market === "goals_over_2_5")?.line).toBe(2.5);
  expect(s.quotes.some((q) => q.market === "double_chance_x2")).toBe(true);
  expect(
    bookmakerOddsSnapshotSchema.safeParse({
      ...s,
      quotes: s.quotes.map((q) => ({ ...q, line: 99 })),
    }).success,
  ).toBe(false);
});
test("missing/bad UTF8/body size/JSON/secret-bearing network errors produce no raw leaks or retries", async () => {
  for (const factory of [
    () => new Response("<html>private</html>"),
    () => new Response(new Uint8Array([255]), { headers: { "content-type": "application/json" } }),
    () => new Response("{", { headers: { "content-type": "application/json" } }),
    () =>
      new Response("{}", {
        headers: { "content-type": "application/json", "content-length": "4000001" },
      }),
  ]) {
    let count = 0;
    const result = await collectBookmakerOdds(target, {
      env,
      journal: journal(),
      now,
      fetcher: async () => {
        count++;
        return factory();
      },
    });
    expect(result.status).not.toBe("matched");
    expect(count).toBe(1);
    expect(JSON.stringify(result)).not.toContain("private");
  }
  const r = await collectBookmakerOdds(target, {
    env,
    journal: journal(),
    now,
    fetcher: async () => {
      throw new Error("SECRET_KEY_AND_RESPONSE");
    },
  });
  expect(JSON.stringify(r)).not.toContain("SECRET");
});
test("single-flight reservation is durable across independent adapter instances", async () => {
  let reserved = false,
    calls = 0;
  const j: OddsJournal = {
    claim: async () => {
      if (reserved) return { status: "busy" };
      reserved = true;
      return { status: "claimed", token: "x" };
    },
    finish: async () => {},
  };
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      collectBookmakerOdds(target, {
        env,
        journal: j,
        now,
        fetcher: async () => {
          calls++;
          return fetcher("");
        },
      }),
    ),
  );
  expect(calls).toBe(1);
  expect(results.filter((r) => r.status === "matched")).toHaveLength(1);
});

test("complementary captures keep their per-file times and do not mix full market groups", async () => {
  const old = dataset();
  old.file = "site_pregame_stoiximan_soccer.json";
  old.updated_at = "2026-11-06T11:59:00.000Z";
  old.data[0]!.data.blocks[0]!.events[0]!.markets.push({
    type: "BTSC",
    id: "bt2",
    selections: [
      { id: "bt2y", name: "Yes", price: 2 },
      { id: "bt2n", name: "No", price: 1.8 },
    ],
  });
  const j: OddsJournal = {
    claim: async (file) => ({
      status: "cached",
      payload: file.includes("leagues") ? dataset() : old,
      retrievedAtUtc: file.includes("leagues") ? time : "2026-11-06T12:00:01.000Z",
    }),
    finish: async () => {},
  };
  // The read occurs after both captures, never before the second receipt.
  const result = await collectFootballBookmakerOdds(target, {
    env,
    journal: j,
    now: () => Date.parse(time) + 1000,
  });
  expect(result.quotes).toHaveLength(5);
  expect(result.retrievedAtUtc).toBe("2026-11-06T12:00:01.000Z");
  expect(result.quotes.find((q) => q.market === "both_teams_score_yes")?.observedAtUtc).toBe(
    old.updated_at,
  );
  expect(result.quotes.find((q) => q.market === "home_win")?.observedAtUtc).toBe(time);
});

test("lost durable receipt acknowledgement recovers cached data without a second source request", async () => {
  let saved: unknown,
    calls = 0,
    first = true;
  const j: OddsJournal = {
    read: async () =>
      saved
        ? { status: "cached", payload: saved, retrievedAtUtc: time }
        : { status: "recovery_pending" },
    claim: async () =>
      saved
        ? { status: "cached", payload: saved, retrievedAtUtc: time }
        : { status: "claimed", token: "x" },
    finish: async (_token, data) => {
      if (data) saved = data;
      if (first) {
        first = false;
        throw new Error("lost acknowledgement");
      }
      if (!data) throw new Error("stale receipt");
    },
  };
  const options = {
    env,
    journal: j,
    now,
    fetcher: (async () => {
      calls++;
      return fetcher("");
    }) as typeof fetch,
  };
  expect((await collectBookmakerOdds(target, options)).status).toBe("matched");
  expect((await collectBookmakerOdds(target, options)).status).toBe("matched");
  expect(calls).toBe(1);
});
