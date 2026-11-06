import { describe, expect, test } from "bun:test";
import data from "./football-team-registry.data.json" with { type: "json" };
import {
  FOOTBALL_REGISTERED_TEAMS,
  createFootballTeamRegistry,
  footballTeamRegistry,
  sameRegisteredFootballTeam,
} from "./football-team-registry.shared";
import { footballTeamDisplayName } from "./football-ai-team-names.shared";
import { footballEvidenceTeamKey, sameEvidenceFixture } from "./football-provider-evidence.shared";
import { parseJoJLeagueDataset, matchJoJOdds } from "./football-odds-core";
import { ARBPLAY_COMPETITIONS, collectFootballBookmakerOdds } from "./football-odds.server";

describe("reviewed six-league football identities", () => {
  test("complete current rosters, source references, unique independent IDs and Greek labels", () => {
    expect(FOOTBALL_REGISTERED_TEAMS).toHaveLength(110);
    expect(new Set(FOOTBALL_REGISTERED_TEAMS.map((t) => t.id)).size).toBe(110);
    for (const [league, count] of Object.entries({
      "GR-SL": 14,
      "EN-PL": 20,
      "FR-L1": 18,
      "ES-LL": 20,
      "DE-BL": 18,
      "IT-SA": 20,
    }))
      expect(FOOTBALL_REGISTERED_TEAMS.filter((t) => t.domesticLeague === league)).toHaveLength(
        count,
      );
    for (const t of FOOTBALL_REGISTERED_TEAMS) {
      expect(t.id).toMatch(/^(gr|en|fr|es|de|it)-[a-z0-9-]+$/);
      expect(t.nameEl).toMatch(/[\u0370-\u03ff]/);
      expect(data.sources[t.source as keyof typeof data.sources].greekNamesUrl).toStartWith(
        "https://",
      );
      for (const [provider, id] of Object.entries(t.providers)) {
        const r = footballTeamRegistry.resolve(t.name, provider, id);
        expect(r.status).toBe("matched");
        if (r.status === "matched") {
          expect(r.team.id).toBe(t.id);
          expect(r.via).toBe("provider_id");
        }
      }
      for (const alias of t.aliases) {
        expect(footballTeamDisplayName(alias, "el")).toBe(t.nameEl);
        expect(footballTeamDisplayName(alias, "en")).toBe(alias);
        expect(footballEvidenceTeamKey(alias)).toBe(footballEvidenceTeamKey(t.name));
      }
    }
  });
  test("safe whitespace/case, unknown/qualified names and malicious keys preserve identity", () => {
    expect(footballTeamDisplayName("  JUVENTUS   FC ", "el")).toBe("Γιουβέντους");
    for (const name of [
      "Juventus Women",
      "Juventus U19",
      "Juventus B",
      "Juventus II",
      "Olympiacos Volos",
      "Aris Limassol",
      "__proto__",
      "constructor",
    ]) {
      expect(footballTeamRegistry.resolve(name).status).toBe("unknown");
      expect(footballTeamDisplayName(name, "el")).toBe(name);
      expect(sameRegisteredFootballTeam("Juventus", name)).toBe(false);
    }
    expect(footballTeamRegistry.resolve("Juventus U19", "joj-stoiximan", "107717").status).toBe(
      "conflict",
    );
    expect(footballTeamRegistry.resolve("Fiorentina", "joj-stoiximan", "107717").status).toBe(
      "conflict",
    );
    expect(footballTeamRegistry.resolve("Juventus", "unverified-provider", "107717")).toMatchObject(
      { status: "matched", via: "alias" },
    );
    expect(footballTeamDisplayName("Paris FC", "el")).not.toBe(
      footballTeamDisplayName("Paris Saint-Germain", "el"),
    );
  });
  test("alias collision is ambiguous, duplicate provider/club IDs reject, registry is immutable", () => {
    const a = FOOTBALL_REGISTERED_TEAMS[0]!;
    const b = FOOTBALL_REGISTERED_TEAMS[1]!;
    const registry = createFootballTeamRegistry([
      { ...a, aliases: [...a.aliases, "Shared FC"] },
      { ...b, aliases: [...b.aliases, "Shared FC"] },
    ]);
    expect(registry.resolve("Shared FC").status).toBe("ambiguous");
    expect(() => createFootballTeamRegistry([a, a])).toThrow();
    expect(() => createFootballTeamRegistry([a, { ...b, providers: a.providers }])).toThrow();
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.aliases)).toBe(true);
    expect(Object.isFrozen(a.providers)).toBe(true);
  });
});

const kickoff = "2026-11-08T19:45:00.000Z";
const captured = "2026-11-06T06:10:45.000Z";
const target = {
  leagueId: "IT-SA",
  homeTeam: "Fiorentina",
  awayTeam: "Juventus",
  kickoffUtc: kickoff,
};
function incident(file = "site_pregame_stoiximan_soccer_leagues.json") {
  return {
    company: "stoiximan",
    file,
    updated_at: captured,
    data: [
      {
        data: {
          blocks: [
            {
              events: [
                {
                  sportId: "FOOT",
                  id: "92997373",
                  leagueId: "1635",
                  leagueName: "Serie A",
                  startTime: Date.parse(kickoff),
                  participants: [
                    { id: "106943", name: "AC Fiorentina" },
                    { id: "107717", name: "Juventus FC" },
                  ],
                  markets: [
                    {
                      type: "MRES",
                      id: "2975146772",
                      selections: [
                        { id: "10477167635", name: "1", price: 3.35 },
                        { id: "10477167636", name: "X", price: 3.55 },
                        { id: "10477167637", name: "2", price: 2.12 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  };
}
test("real production missing-odds incident resolves through actual collector with no new dispatch", async () => {
  let calls = 0;
  const result = await collectFootballBookmakerOdds(target, {
    env: { ARBPLAY_API_KEY: "offline" },
    now: () => Date.parse("2026-11-06T06:11:43.183Z"),
    journal: {
      claim: async (file) => ({
        status: "cached",
        payload: incident(file),
        retrievedAtUtc: "2026-11-06T06:10:48.251Z",
      }),
      finish: async () => {
        throw Error("No writes");
      },
    },
    fetcher: async () => {
      calls++;
      throw Error("No network");
    },
  });
  expect(result.status).toBe("matched");
  expect(result.quotes.map((q) => q.decimal)).toEqual([3.35, 3.55, 2.12]);
  expect(result.fixture).toEqual(target);
  expect(calls).toBe(0);
});
test("registry never weakens competition, directed team, kickoff, ambiguity or provider-ID checks", () => {
  const candidate = parseJoJLeagueDataset(incident())[0]!;
  const input = {
    leagueId: target.leagueId,
    home: target.homeTeam,
    away: target.awayTeam,
    kickoffUtc: kickoff,
  };
  expect(matchJoJOdds(input, [candidate], ARBPLAY_COMPETITIONS).status).toBe("matched");
  expect(
    matchJoJOdds(
      { ...input, home: input.away, away: input.home },
      [candidate],
      ARBPLAY_COMPETITIONS,
    ).status,
  ).toBe("missing");
  expect(
    matchJoJOdds({ ...input, leagueId: "FR-L1" }, [candidate], ARBPLAY_COMPETITIONS).status,
  ).toBe("missing");
  expect(
    matchJoJOdds(
      { ...input, kickoffUtc: "2026-11-08T19:45:01Z" },
      [candidate],
      ARBPLAY_COMPETITIONS,
    ).status,
  ).toBe("conflict");
  expect(
    matchJoJOdds(input, [candidate, { ...candidate, id: "duplicate" }], ARBPLAY_COMPETITIONS)
      .status,
  ).toBe("ambiguous");
  expect(
    matchJoJOdds(input, [{ ...candidate, homeTeamProviderId: "107717" }], ARBPLAY_COMPETITIONS)
      .status,
  ).toBe("missing");
  expect(
    sameEvidenceFixture(target, {
      homeTeam: "AC Fiorentina",
      awayTeam: "Juventus FC",
      kickoffUtc: kickoff,
    }),
  ).toBe(true);
  expect(
    sameEvidenceFixture(target, {
      homeTeam: "AC Fiorentina Women",
      awayTeam: "Juventus FC",
      kickoffUtc: kickoff,
    }),
  ).toBe(false);
});
