import { readFileSync } from "fs";
import { traceFootballFixture } from "@/lib/football-evidence-v2.shared";
const fixture = { homeTeam: "Fiorentina", awayTeam: "Juventus", kickoffUtc: "2026-11-08T19:45:00.000Z", leagueId: "IT-SA" } as any;
const cutoff = "2026-11-08T12:38:25.220Z";
for (const k of ["fp", "fw", "sv"]) {
  const t = readFileSync(`/tmp/fb/${k}.txt`, "utf8");
  const tr = traceFootballFixture(t, fixture, cutoff, { searchProfileVersion: "v2_experimental" });
  console.log(k, tr.status, JSON.stringify(tr.failures));
  // headings with both teams
  const lines = t.split("\n");
  lines.forEach((l, i) => { if (/fiorentina/i.test(l) && /juventus/i.test(l) && l.length < 240) {
    const h = traceFootballFixture(l, fixture, cutoff, { searchProfileVersion: "v2_experimental" });
    console.log("  H", i, JSON.stringify(h.failures), l.slice(0, 100)); } });
}
