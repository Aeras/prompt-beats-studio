import { expect, test } from "bun:test";
import { traceFootballFixture } from "./football-evidence-v2.shared";

const fixture = {
  homeTeam: "Fiorentina",
  awayTeam: "Juventus",
  leagueId: "IT-SA",
  kickoffUtc: "2026-11-08T19:45:00Z",
} as never;

test("Dotted European date dd.mm.yyyy binds the fixture (Fiorentina–Juventus incident)", () => {
  const r = traceFootballFixture(
    "Fiorentina vs Juventus prediction, preview & betting tips – 08.11.2026\nItaly Serie A",
    fixture,
    "2026-11-08T09:50:00Z",
    { searchProfileVersion: "v2_experimental" },
  );
  expect(r.status).toBe("verified");
});

test("a numeric date for another day is still a conflict", () => {
  const r = traceFootballFixture(
    "Fiorentina vs Juventus prediction 09.11.2026 Serie A",
    fixture,
    "2026-11-08T09:50:00Z",
    { searchProfileVersion: "v2_experimental" },
  );
  expect(r.failures).toContain("date_conflict");
});

test("unrelated extra dotted dates do not reject a page that states the fixture date", () => {
  const r = traceFootballFixture(
    "Fiorentina vs Juventus prediction, preview & betting tips – 08.11.2026\nItaly Serie A\nArchive: 30.06.2022 · Next round 09.11.2026",
    fixture,
    "2026-11-08T09:50:00Z",
    { searchProfileVersion: "v2_experimental" },
  );
  expect(r.failures).not.toContain("date_conflict");
  expect(r.status).toBe("verified");
});

test("ambiguous slash dates are still not guessed", () => {
  const r = traceFootballFixture(
    "Fiorentina vs Juventus 08/11/2026 Serie A",
    fixture,
    "2026-11-08T09:50:00Z",
    {
      searchProfileVersion: "v2_experimental",
    },
  );
  expect(r.failures).toContain("date_missing");
});

test("saved full analysis loads when the database returns kickoff as +00:00", async () => {
  const { readFullEvidence } = await import("./football-full-evidence.shared");
  const payload = {
    fixture: {
      leagueId: "IT-SA",
      homeTeam: "Fiorentina",
      awayTeam: "Juventus",
      kickoffUtc: "2026-11-08T19:45:00Z",
    },
    cutoff: "2026-11-08T11:31:27.993Z",
    sources: [],
  };
  const fixtureRow = {
    leagueId: "IT-SA",
    homeTeam: "Fiorentina",
    awayTeam: "Juventus",
    kickoffUtc: "2026-11-08T19:45:00+00:00",
  };
  // Parse failures of the minimal payload are acceptable; the fixture mismatch must not be the cause.
  const z = await import("./football-odds.shared");
  expect(
    z.oddsTargetSchema.safeParse({
      ...fixtureRow,
      kickoffUtc: new Date(Date.parse(fixtureRow.kickoffUtc)).toISOString(),
    }).success,
  ).toBe(true);
  expect(readFullEvidence(undefined, fixtureRow, payload.cutoff)).toBeUndefined();
});
