import { expect, test } from "bun:test";
import { traceFootballFixture } from "./football-evidence-v2.shared";

const fixture = {
  homeTeam: "Fiorentina",
  awayTeam: "Juventus",
  leagueId: "IT-SA",
  kickoffUtc: "2026-11-08T19:45:00Z",
} as never;

test("European numeric date dd/mm/yyyy binds the fixture (Fiorentina–Juventus incident)", () => {
  const r = traceFootballFixture(
    "Fiorentina-Juventus prediction, preview & betting tips – 08/11/2026\nItaly Serie A",
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
