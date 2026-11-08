import { readFileSync } from "fs";
import { createRestorationPolicy } from "@/lib/football-independent-restoration.server";
import { makeFullSources } from "@/lib/football-full-evidence.server";
const fixture = { leagueId: "IT-SA", homeTeam: "Fiorentina", awayTeam: "Juventus", kickoffUtc: "2026-11-08T19:45:00.000Z" };
const cutoff = "2026-11-08T12:38:25.220Z";
const quotes: Record<string,string> = {
 fp: "our main betting tip leans toward BTTS, alongside Over 3.5 yellow cards and Juventus or Draw.",
 fw: "Whispers predicts: Fiorentina 1-2 Juventus",
 sv: "",
};
const { policy } = createRestorationPolicy({ fixture, cutoff, runId: "ae000000-0000-4000-8000-000000000001", hits: [], restoration: true, context: { fixture }, system: "x" } as any);
for (const k of ["fp","fw"]) {
  const text = readFileSync(`/tmp/fb/${k}.txt`,"utf8");
  const docs = makeFullSources([{ url: "https://predictz.com/"+k, title: "t", text, accessedAt: cutoff, status: "full_or_partial_raw_text", rawChars: text.length, cleanedChars: text.length, snippetChars: 0, language: "en" } as any]);
  policy.prepareDocs?.(docs);
  const r = policy.verify([{ sourceId: docs[0]!.id, quote: quotes[k], market: { kind: "btts", period: "FT", selection: "yes" }, kind: "editorial", rationale: "t" }], docs, fixture as any, cutoff);
  console.log(k, r.map(c => [c.fixtureVerified, c.reasons]));
}
