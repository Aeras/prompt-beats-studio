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
  const filler = "Other league news and headlines from around Europe this week. ".repeat(4);
  const r = traceFootballFixture(
    "Fiorentina vs Juventus prediction, preview & betting tips – 08.11.2026\nItaly Serie A\n" +
      filler +
      "\nArchive: 30.06.2022 · Next round 09.11.2026",
    fixture,
    "2026-11-08T09:50:00Z",
    { searchProfileVersion: "v2_experimental" },
  );
  expect(r.failures).not.toContain("date_conflict");
  expect(r.status).toBe("verified");
});

test("slash dates count only when the day/month reading equals the fixture date", () => {
  const trace = (text: string) =>
    traceFootballFixture(text, fixture, "2026-11-08T09:50:00Z", {
      searchProfileVersion: "v2_experimental",
    });
  expect(trace("Fiorentina vs Juventus 08/11/2026 Serie A").status).toBe("verified");
  expect(trace("Fiorentina vs Juventus 08/11/26 - 19:45 Serie A").status).toBe("verified");
  // Another reading is never guessed into a match, and never becomes a conflict either.
  const other = trace("Fiorentina vs Juventus 11/08/2026 Serie A");
  expect(other.failures).toContain("date_missing");
  expect(other.failures).not.toContain("date_conflict");
});

test("year-less weekday date counts only with the fixture's own weekday", () => {
  const trace = (text: string) =>
    traceFootballFixture(text, fixture, "2026-11-08T09:50:00Z", {
      searchProfileVersion: "v2_experimental",
    });
  expect(trace("Fiorentina vs Juventus Serie A on Sunday, 8 November").status).toBe("verified");
  expect(trace("Fiorentina vs Juventus Serie A on Monday, 8 November").failures).toContain(
    "date_missing",
  );
});

test("a byline stamp days before kickoff is not a conflicting fixture date", () => {
  const r = traceFootballFixture(
    "Fiorentina vs Juventus Prediction\n8 November 2026\nBojan Jovanovic\n4 November 2026 • 12:21 UTC\nSerie A",
    fixture,
    "2026-11-08T09:50:00Z",
    { searchProfileVersion: "v2_experimental" },
  );
  expect(r.status).toBe("verified");
  // A previous meeting stays a conflict.
  expect(
    traceFootballFixture(
      "Fiorentina vs Juventus Serie A 8 November 2026\nFiorentina vs Juventus 12 April 2026",
      fixture,
      "2026-11-08T09:50:00Z",
      { searchProfileVersion: "v2_experimental" },
    ).failures,
  ).toContain("date_conflict");
});

test("explicit 'Sunday, 8 November 2026' outranks a loose 'Monday's game' phrase", () => {
  const r = traceFootballFixture(
    "Monday's football game between Fiorentina and Juventus will close the round.\nFiorentina vs Juventus Serie A match will be played on Sunday, 8 November 2026 at 19:45",
    fixture,
    "2026-11-08T09:50:00Z",
    { searchProfileVersion: "v2_experimental" },
  );
  expect(r.failures).not.toContain("weekday_conflict");
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
