import { readFileSync } from "fs";
import { plainPreviewSections } from "@/lib/football-independent-restoration.server";
import { traceFootballFixture } from "@/lib/football-evidence-v2.shared";
const fixture = { leagueId: "IT-SA", homeTeam: "Fiorentina", awayTeam: "Juventus", kickoffUtc: "2026-11-08T19:45:00.000Z" } as any;
const cutoff = "2026-11-08T12:38:25.220Z";
for (const k of ["fp","fw"]) {
  const text = readFileSync(`/tmp/fb/${k}.txt`,"utf8");
  const secs = (plainPreviewSections as any)(text, { fixture, cutoff });
  console.log(k, "sections", secs.length);
  for (const s of secs) {
    const b = traceFootballFixture(s.binding, fixture, cutoff, { searchProfileVersion: "v2_experimental" });
    const c = traceFootballFixture(s.text, fixture, cutoff, { searchProfileVersion: "v2_experimental" });
    console.log(" ", s.text.split("\n")[0].slice(0,60), "| lines", s.text.split("\n").length, "| bind", b.status, "| content", JSON.stringify(c.failures));
  }
}
