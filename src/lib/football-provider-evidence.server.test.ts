import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { collectFootballProviderEvidence } from "./football-provider-evidence.server";
import { footballSourceJson } from "./football-source-http.server";
import {
  sameEvidenceFixture,
  footballProviderEvidenceSchema,
  providerEvidenceUrls,
  withoutFootballSourceMetadata,
} from "./football-provider-evidence.shared";
import { footballAiAssessmentSchema } from "./football-ai-research.shared";
import { buildFootballExpertPayload } from "./football-ai-expert-payload.shared";
import { parseEspnLastFive, parseEspnRecentResults } from "./football-espn-context.server";

const target = {
  leagueId: "EN-PL",
  homeTeam: "Home United",
  awayTeam: "Away City",
  kickoffUtc: "2026-11-09T20:00:00.000Z",
};
const now = () => Date.parse("2026-11-08T12:00:00.000Z");
const env = {
  API_FOOTBALL_KEY: "test-api-only",
  FOOTBALL_DATA_API_KEY: "test-fd-only",
  PITCHAPI_API_KEY: "test-pitch-only",
};
const team = (id: string, name: string) => ({ id, displayName: name, name });
const competitors = [
  { homeAway: "home", team: team("10", target.homeTeam), score: { value: 2, displayValue: "2" } },
  { homeAway: "away", team: team("20", target.awayTeam), score: { value: 1, displayValue: "1" } },
];
const old = {
  id: "100",
  date: "2026-11-01T12:00:00Z",
  competitions: [{ competitors, status: { type: { completed: true } } }],
};
const event = {
  id: "999",
  date: target.kickoffUtc,
  competitions: [
    {
      competitors: competitors.map((c) => ({ ...c, score: "0" })),
      status: { type: { state: "pre", completed: false } },
    },
  ],
};
const pitchMatch = (old = false) => ({
  id: old ? "m_OLD001" : "m_TGT001",
  home_team: { id: "t_HOM001", name: target.homeTeam },
  away_team: { id: "t_AWY001", name: target.awayTeam },
  league: { id: "l_ABC123", name: "Premier League" },
  time_utc: old ? "2026-11-01T12:00:00Z" : target.kickoffUtc,
  status: old ? "finished" : "not_started",
  score_home: old ? 2 : null,
  score_away: old ? 1 : null,
});
const apiMatch = (old = false) => ({
  fixture: {
    id: old ? 100 : 999,
    date: old ? "2026-11-01T12:00:00Z" : target.kickoffUtc,
    status: { short: old ? "FT" : "NS" },
  },
  league: { id: 39, name: "Premier League", country: "England", season: 2026 },
  teams: { home: { id: 10, name: target.homeTeam }, away: { id: 20, name: target.awayTeam } },
  goals: { home: old ? 2 : null, away: old ? 1 : null },
});
const fdMatch = (old = false) => ({
  id: old ? 100 : 999,
  utcDate: old ? "2026-11-01T12:00:00Z" : target.kickoffUtc,
  status: old ? "FINISHED" : "TIMED",
  homeTeam: { id: 10, name: target.homeTeam },
  awayTeam: { id: 20, name: target.awayTeam },
  score: { fullTime: { home: old ? 2 : null, away: old ? 1 : null } },
});
function fixture(change?: (url: URL, body: unknown) => unknown | Response) {
  const calls: URL[] = [];
  const fetcher = async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    expect(this).toBeUndefined();
    const url = new URL(String(input));
    calls.push(url);
    expect(init?.redirect).toBe("manual");
    let body: unknown = {};
    if (url.hostname === "site.api.espn.com") {
      if (url.pathname.endsWith("/scoreboard")) body = { events: [event] };
      else if (url.pathname.endsWith("/summary"))
        body = {
          header: { competitions: [{ competitors, status: { type: { state: "pre" } } }] },
          boxscore: {
            teams: competitors.map((c) => ({
              ...c,
              statistics: [{ name: "totalGoals", displayValue: "10" }],
            })),
          },
          lastFiveGames: [],
        };
      else if (url.pathname.endsWith("/schedule")) body = { events: [old] };
      else if (/\/teams\/\d+$/.test(url.pathname))
        body = { team: { statistics: [{ name: "shots", value: 20 }] } };
    } else if (url.hostname === "v3.football.api-sports.io") {
      expect(new Headers(init?.headers).get("x-apisports-key")).toBe(env.API_FOOTBALL_KEY);
      if (url.pathname === "/fixtures")
        body = { response: [apiMatch(url.searchParams.has("last"))], errors: [] };
      else if (url.pathname === "/teams/statistics")
        body = {
          response: {
            team: { id: Number(url.searchParams.get("team")) },
            fixtures: { played: { total: 10 }, wins: { total: 5 } },
            goals: { for: { total: { total: 20 } }, against: { total: { total: 10 } } },
          },
        };
      else body = { response: [], errors: [] };
    } else if (url.hostname === "api.football-data.org") {
      expect(new Headers(init?.headers).get("x-auth-token")).toBe(env.FOOTBALL_DATA_API_KEY);
      body = url.pathname.endsWith("/matches")
        ? { matches: [fdMatch(url.pathname.includes("/teams/"))] }
        : {
            standings: [{ type: "TOTAL", table: [{ position: 1, team: { id: 10 }, points: 25 }] }],
          };
    } else if (url.hostname === "api.pitchapi.dev") {
      expect(new Headers(init?.headers).get("x-api-key")).toBe(env.PITCHAPI_API_KEY);
      if (url.pathname === "/v1/leagues")
        body = {
          data: { leagues: [{ id: "l_ABC123", name: "Premier League", country_code: "ENG" }] },
        };
      else if (url.pathname.startsWith("/v1/date/")) body = { data: { matches: [pitchMatch()] } };
      else if (url.pathname.endsWith("/matches")) body = { data: { matches: [pitchMatch(true)] } };
      else if (url.pathname.endsWith("/lineups"))
        body = {
          data: {
            match_id: "m_TGT001",
            home_team: { id: "t_HOM001" },
            away_team: { id: "t_AWY001" },
            home: { confirmed: false, starters: [{ name: "Player A" }] },
            away: { confirmed: true, starters: [] },
          },
        };
      else
        body = {
          data: {
            match_id: "m_OLD001",
            home_team: { id: "t_HOM001" },
            away_team: { id: "t_AWY001" },
            periods: [
              {
                period: "All",
                groups: [{ items: [{ key: "expected_goals", home: "1.9", away: "0.8" }] }],
              },
            ],
          },
        };
    } else throw Error("Unexpected host");
    const changed = change ? change(url, body) : body;
    return changed instanceof Response ? changed : Response.json(changed);
  } as typeof fetch;
  return { fetcher, calls };
}

describe("independent multi-provider football evidence", () => {
  test("uses all four sources with exact identity, score objects and source-separated xG", async () => {
    const f = fixture();
    const data = await collectFootballProviderEvidence(target, { ...f, env, now });
    expect(data.providers.map((p) => p.status)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(data.providers[0]?.home?.recentResults[0]?.goalsFor).toBe(2);
    expect(data.providers[0]?.home?.matchStatistics).toEqual([]);
    expect(data.providers[0]?.home?.previewStatistics).toHaveLength(1);
    expect(data.providers[3]?.home?.recentResults[0]).toMatchObject({ xg: 1.9, xga: 0.8 });
    expect(data.providers[3]?.away?.recentResults[0]).toMatchObject({ xg: 0.8, xga: 1.9 });
    expect(f.calls.filter((u) => u.pathname.endsWith("/m_OLD001/stats"))).toHaveLength(1);
    expect(f.calls.some((u) => u.pathname.includes("m_TGT001/stats"))).toBe(false);
    expect(JSON.stringify(data)).not.toContain("test-pitch-only");
    expect(providerEvidenceUrls(data).length).toBeGreaterThan(4);
  });
  test("missing keys skip only their own hosts", async () => {
    const f = fixture();
    const data = await collectFootballProviderEvidence(target, { ...f, env: {}, now });
    expect(data.providers.map((p) => p.status)).toEqual([
      "ok",
      "not_configured",
      "not_configured",
      "not_configured",
    ]);
    expect(f.calls.every((u) => u.hostname === "site.api.espn.com")).toBe(true);
  });
  for (const status of [401, 403, 429, 500])
    test(`HTTP ${status} remains distinct and does not remove ESPN data`, async () => {
      const f = fixture((u, b) =>
        u.hostname === "api.pitchapi.dev"
          ? new Response("SENSITIVE_PROVIDER_BODY", { status, headers: { "Retry-After": "3600" } })
          : b,
      );
      const data = await collectFootballProviderEvidence(target, { ...f, env, now });
      expect(data.providers[0]?.status).toBe("ok");
      expect(data.providers[3]?.status).toBe(
        status === 429 ? "rate_limited" : status < 500 ? "access_denied" : "unavailable",
      );
      expect(JSON.stringify(data)).not.toContain("SENSITIVE");
      expect(f.calls.filter((u) => u.hostname === "api.pitchapi.dev")).toHaveLength(1);
    });
  test("does not confuse a different league with a matching team pair", async () => {
    const f = fixture((u, b) =>
      u.hostname === "api.pitchapi.dev" && u.pathname.includes("/date/")
        ? { data: { matches: [{ ...pitchMatch(), league: { id: "l_WRONG1" } }] } }
        : b,
    );
    const data = await collectFootballProviderEvidence(target, { ...f, env, now });
    expect(data.providers[3]?.status).toBe("not_found");
  });
  for (const variant of ["duplicate", "time", "reversed", "women"])
    test(`rejects ${variant} identity without enrichment requests`, async () => {
      const f = fixture((u, b) => {
        if (u.hostname !== "api.pitchapi.dev" || !u.pathname.includes("/date/")) return b;
        const m = pitchMatch();
        if (variant === "time") m.time_utc = "2026-11-09T20:01:00Z";
        if (variant === "reversed") [m.home_team, m.away_team] = [m.away_team, m.home_team];
        if (variant === "women") m.home_team.name += " Women";
        return { data: { matches: variant === "duplicate" ? [m, m] : [m] } };
      });
      const data = await collectFootballProviderEvidence(target, { ...f, env, now });
      expect(data.providers[3]?.status).toBe(
        variant === "duplicate" ? "ambiguous" : variant === "time" ? "conflict" : "not_found",
      );
      expect(data.providers[3]?.home).toBeNull();
      expect(f.calls.some((u) => u.pathname.includes("/l_ABC123/matches"))).toBe(false);
    });
  test("absent or malformed xG is never zero; malformed history marks source partial", async () => {
    const f = fixture((u, b) =>
      u.pathname.endsWith("/m_OLD001/stats") ? { data: { match_id: "m_WRONG1" } } : b,
    );
    const data = await collectFootballProviderEvidence(target, { ...f, env, now });
    expect(data.providers[3]?.status).toBe("partial");
    expect(data.providers[3]?.home?.recentResults[0]?.xg).toBeUndefined();
    expect(data.providers[3]?.notes.join(" ")).toContain("invalid_response");
  });
  test("filters future results before xG dispatch and preserves historical conflicts", async () => {
    const f = fixture((u, b) => {
      if (u.pathname === "/v1/leagues/l_ABC123/matches")
        return {
          data: {
            matches: [
              pitchMatch(true),
              { ...pitchMatch(true), id: "m_FUT001", time_utc: "2026-11-10T12:00:00Z" },
            ],
          },
        };
      if (u.hostname === "api.football-data.org" && u.pathname.includes("/teams/"))
        return { matches: [{ ...fdMatch(true), score: { fullTime: { home: 3, away: 1 } } }] };
      return b;
    });
    const data = await collectFootballProviderEvidence(target, { ...f, env, now });
    expect(data.conflicts.length).toBeGreaterThan(0);
    expect(f.calls.some((u) => u.pathname.includes("m_FUT001"))).toBe(false);
  });
  test("API-Football HTTP200 plan error is not reported as empty successful coverage", async () => {
    const f = fixture((u, b) =>
      u.hostname === "v3.football.api-sports.io"
        ? { response: [], errors: { plan: "secret body" } }
        : b,
    );
    const data = await collectFootballProviderEvidence(target, { ...f, env, now });
    expect(data.providers[1]?.status).toBe("access_denied");
    expect(JSON.stringify(data)).not.toContain("secret body");
  });
  test("snapshot survives assessment/history and complete expert handoff; legacy remains valid", async () => {
    const data = await collectFootballProviderEvidence(target, { ...fixture(), env, now });
    const assessment = footballAiAssessmentSchema.parse({
      summary: "A sufficiently long cautious research summary.",
      suggestions: [],
      limitations: [],
      providerEvidence: data,
    });
    expect(buildFootballExpertPayload(assessment).providerEvidence).toEqual(data);
    expect(
      footballProviderEvidenceSchema.safeParse({
        ...data,
        providers: [
          {
            ...data.providers[0],
            resources: [
              { url: "https://evil.test/", status: "ok", fetchedAtUtc: data.collectedAtUtc },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
  test("matching normalizes only conservative aliases and never kickoff minute or age qualifiers", () => {
    expect(sameEvidenceFixture(target, { ...target, homeTeam: "  HOME UNITED " })).toBe(true);
    expect(sameEvidenceFixture(target, { ...target, homeTeam: "Home United U21" })).toBe(false);
    expect(sameEvidenceFixture(target, { ...target, kickoffUtc: "2026-11-09T20:00:01Z" })).toBe(
      false,
    );
  });
  test("ESPN real score-object regression, null and empty scores stay missing", () => {
    expect(parseEspnRecentResults({ events: [old] }, "10", target.kickoffUtc)[0]?.goalsFor).toBe(2);
    expect(
      parseEspnRecentResults(
        {
          events: [
            {
              ...old,
              competitions: [
                {
                  ...old.competitions[0],
                  competitors: [{ ...competitors[0], score: { value: "" } }, competitors[1]],
                },
              ],
            },
          ],
        },
        "10",
        target.kickoffUtc,
      ),
    ).toEqual([]);
    expect(
      parseEspnLastFive(
        {
          lastFiveGames: [
            {
              team: { id: "10" },
              events: [
                {
                  id: "1",
                  gameDate: old.date,
                  homeTeamId: "10",
                  opponent: { id: "20", displayName: "Away City" },
                  homeTeamScore: "2",
                  awayTeamScore: "1",
                  gameResult: "W",
                },
              ],
            },
          ],
        },
        "10",
        target.kickoffUtc,
      ),
    ).toHaveLength(1);
  });
});

describe("bounded source transport", () => {
  for (const url of [
    "http://api.pitchapi.dev/v1/leagues",
    "https://api.pitchapi.dev.evil.test/",
    "https://secret@api.pitchapi.dev/",
    "https://127.0.0.1/",
  ])
    test(`blocks unsafe URL ${url}`, async () => {
      let calls = 0;
      await expect(
        footballSourceJson(new URL(url), {
          fetcher: (async () => {
            calls++;
            return Response.json({});
          }) as typeof fetch,
        }),
      ).rejects.toThrow("invalid_response");
      expect(calls).toBe(0);
    });
  for (const [name, response, code] of [
    [
      "redirect",
      () => new Response(null, { status: 302, headers: { location: "https://evil.test/" } }),
      "unavailable",
    ],
    ["html", () => new Response("<html>secret</html>"), "invalid_response"],
    [
      "declared size",
      () =>
        new Response("{}", {
          headers: { "content-type": "application/json", "content-length": "1200001" },
        }),
      "too_large",
    ],
    ["actual bytes", () => Response.json({ text: "Ω".repeat(20) }), "too_large"],
    [
      "bad JSON",
      () => new Response("{broken", { headers: { "content-type": "application/json" } }),
      "invalid_response",
    ],
  ] as const)
    test(name, async () => {
      await expect(
        footballSourceJson(new URL("https://api.pitchapi.dev/v1/leagues"), {
          fetcher: (async () => response()) as typeof fetch,
          maxBytes: name === "actual bytes" ? 20 : 1200000,
        }),
      ).rejects.toThrow(code);
    });
  test("honors Retry-After metadata without retry", async () => {
    let calls = 0;
    try {
      await footballSourceJson(new URL("https://api.pitchapi.dev/v1/leagues"), {
        fetcher: (async () => {
          calls++;
          return new Response(null, { status: 429, headers: { "retry-after": "3600" } });
        }) as typeof fetch,
      });
      throw Error("expected rejection");
    } catch (e) {
      expect((e as { retryAfterMs: number }).retryAfterMs).toBe(3600000);
      expect(calls).toBe(1);
    }
  });
});

test("parallel previews share requests and cached snapshots cannot be mutated by callers", async () => {
  const f = fixture();
  const [a, b] = await Promise.all([
    collectFootballProviderEvidence(target, { ...f, env, now, cache: true }),
    collectFootballProviderEvidence(target, { ...f, env, now, cache: true }),
  ]);
  const count = f.calls.length;
  expect(count).toBeGreaterThan(10);
  expect(
    f.calls.filter((u) => u.hostname === "api.pitchapi.dev" && u.pathname === "/v1/leagues"),
  ).toHaveLength(1);
  a.providers[0]!.notes.push("CALLER_MUTATION");
  expect(JSON.stringify(b)).not.toContain("CALLER_MUTATION");
  const c = await collectFootballProviderEvidence(target, { ...f, env, now, cache: true });
  expect(f.calls.length).toBe(count);
  expect(JSON.stringify(c)).not.toContain("CALLER_MUTATION");
});

test("actual server handler denies before network and rechecks authorization after collection", async () => {
  const source = readFileSync(new URL("./football-research.functions.ts", import.meta.url), "utf8");
  const compiled = new (
    Bun as unknown as {
      Transpiler: new (options: { loader: string }) => { transformSync(source: string): string };
    }
  ).Transpiler({ loader: "ts" }).transformSync(source);
  const section = compiled.slice(compiled.indexOf("getPrivateFootballProviderEvidence ="));
  const start = section.indexOf(".handler(") + ".handler(".length;
  const handlerText = section.slice(start, section.lastIndexOf(");")).trim();
  let reads = 0,
    collected = 0;
  const authorizedTarget = { ...target, kickoffUtc: new Date(Date.now() + 86400000).toISOString() };
  const loader = async () => {
    reads++;
    return [{ ...authorizedTarget, source: "espn", sourceFixtureId: "999", state: "scheduled" }];
  };
  const dynamicImport = async (path: string) =>
    path.includes("football-espn.server")
      ? { fetchEspnFootballWeek: loader }
      : {
          collectFootballProviderEvidence: async (identity: unknown) => {
            collected++;
            expect(identity).toEqual(authorizedTarget);
            return { identity };
          },
        };
  const executable = handlerText.replaceAll("import(", "dynamicImport(");
  const handler = new Function("dynamicImport", "getCachedFootballWeek", `return (${executable})`)(
    dynamicImport,
    loader,
  );
  const input = {
    fixtureProvider: "espn",
    fixtureId: "999",
    weekDate: "2026-11-09",
    leagueId: "EN-PL",
    homeTeam: "FORGED",
  };
  let checks = 0;
  const denied = { supabase: { rpc: async () => ({ data: false, error: null }) } };
  await expect(handler({ data: input, context: denied })).rejects.toThrow("Not allowed");
  expect(reads).toBe(0);
  const revoked = { supabase: { rpc: async () => ({ data: ++checks === 1, error: null }) } };
  await expect(handler({ data: input, context: revoked })).rejects.toThrow("Not allowed");
  expect(collected).toBe(1);
});

test("invalid UTF8 and aborted fetch are separately diagnosed without raw error text", async () => {
  await expect(
    footballSourceJson(new URL("https://api.pitchapi.dev/v1/leagues"), {
      fetcher: (async () =>
        new Response(new Uint8Array([0xff, 0xfe]), {
          headers: { "content-type": "application/json" },
        })) as typeof fetch,
    }),
  ).rejects.toThrow("invalid_response");
  const controller = new AbortController();
  controller.abort();
  await expect(
    footballSourceJson(new URL("https://api.pitchapi.dev/v1/leagues"), {
      signal: controller.signal,
      fetcher: (async () => {
        throw new Error("RAW_SECRET_ERROR");
      }) as typeof fetch,
    }),
  ).rejects.toThrow("timeout");
});

test("foreign ESPN summary is diagnosed using the real resource URL, never attached to this fixture", async () => {
  const f = fixture((u, b) =>
    u.pathname.endsWith("/summary")
      ? {
          header: {
            id: "123456",
            competitions: [
              {
                competitors: competitors.map((c) => ({
                  ...c,
                  statistics: [{ name: "FOREIGN_DATA", value: 99 }],
                })),
              },
            ],
          },
        }
      : b,
  );
  const data = await collectFootballProviderEvidence(target, { ...f, env, now });
  expect(data.providers[0]?.status).toBe("partial");
  expect(data.providers[0]?.resources.find((r) => r.status === "conflict")?.url).toContain(
    "/summary?event=999",
  );
  expect(JSON.stringify(data)).not.toContain("FOREIGN_DATA");
});

test("malformed evidence URLs fail schema validation without throwing or escaping fixed origins", async () => {
  const data = await collectFootballProviderEvidence(target, { ...fixture(), env, now });
  for (const url of [
    "not a URL",
    "javascript:alert(1)",
    "https://api.pitchapi.dev:444/",
    "https://api.pitchapi.dev.evil.test/",
  ]) {
    expect(
      footballProviderEvidenceSchema.safeParse({
        ...data,
        providers: [
          {
            ...data.providers[0],
            resources: [{ url, status: "ok", fetchedAtUtc: data.collectedAtUtc }],
          },
        ],
      }).success,
    ).toBe(false);
  }
});

test("model output cannot impersonate legacy ESPN or server-collected provider metadata", () => {
  const untrusted = {
    summary: "Genuine model narrative",
    espnData: { provider: "FAKE" },
    providerEvidence: { version: 999 },
    researchBrief: { evidenceStatus: "verified" },
    tavilySearchDepth: "advanced",
  };
  const clean = withoutFootballSourceMetadata(untrusted);
  expect(clean).toEqual({ summary: "Genuine model narrative" });
  expect(untrusted.espnData.provider).toBe("FAKE");
});
