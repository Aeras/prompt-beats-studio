/** Offline validation of the owner's exact export. Never fetches or prints feed/keys. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseJoJLeagueDataset } from "../../src/lib/football-odds-core";
import { ARBPLAY_COMPETITIONS } from "../../src/lib/football-odds.server";
const dir = process.argv[2];
if (!dir) throw new Error("Supply the local approved sample directory");
const expected = [
  {
    file: "site_pregame_stoiximan_soccer_leagues.json",
    hash: "b45329980d6558deca1c893efe5a1f79b5f2df16b9ffcf28183dc82a8df85fe5",
    count: 230,
  },
  {
    file: "site_pregame_stoiximan_soccer.json",
    hash: "9abd9387a0e2a1b0367ff26d54935ba241fec8a4614bc44f945443a1e6c85dd3",
    count: 22,
  },
];
for (const spec of expected) {
  const bytes = readFileSync(resolve(dir, spec.file));
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== spec.hash) throw new Error("Sample provenance mismatch");
  const events = parseJoJLeagueDataset(JSON.parse(bytes.toString("utf8")));
  if (events.length !== spec.count || new Set(events.map((e) => e.id)).size !== spec.count)
    throw new Error("Count/identity mismatch");
  if (
    spec.count === 230 &&
    !Object.values(ARBPLAY_COMPETITIONS)
      .flat()
      .every((id) => events.some((e) => e.leagueId === id))
  )
    throw new Error("Mapped league is navigation-only or absent");
  console.log(
    JSON.stringify({
      file: spec.file,
      sha256: sha,
      validStandardEvents: events.length,
      markets: events.reduce((n, e) => n + e.markets.length, 0),
      independentlyVerifiedFixtures: false,
    }),
  );
}
