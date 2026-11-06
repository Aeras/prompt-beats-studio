import { z } from "zod";
import { isFreshAt, calculateNoVig, type OddsFixture } from "./football-odds-core";
export const QUOTED_MARKETS = [
  "home_win",
  "draw",
  "away_win",
  "double_chance_1x",
  "double_chance_x2",
  "double_chance_12",
  "both_teams_score_yes",
  "both_teams_score_no",
  "goals_over_1_5",
  "goals_under_1_5",
  "goals_over_2_5",
  "goals_under_2_5",
  "goals_over_3_5",
  "goals_under_3_5",
] as const;
const utc = z.string().datetime();
export const oddsTargetSchema = z
  .object({
    leagueId: z.string().min(1).max(32),
    homeTeam: z.string().min(1).max(150),
    awayTeam: z.string().min(1).max(150),
    kickoffUtc: utc,
  })
  .strict();
export const oddsFeedStateSchema = z.enum([
  "matched",
  "missing",
  "ambiguous",
  "conflict",
  "stale",
  "not_configured",
  "unavailable",
  "busy",
  "recovery_pending",
  "quota_exhausted",
  "rate_limited",
  "access_denied",
  "invalid_response",
  "timeout",
  "too_large",
]);
export const bookmakerOddsSnapshotSchema = z
  .object({
    version: z.literal(1),
    provider: z.literal("arbplay-stoiximan"),
    status: oddsFeedStateSchema,
    feedStatuses: z
      .array(
        z
          .object({
            file: z.enum([
              "site_pregame_stoiximan_soccer_leagues.json",
              "site_pregame_stoiximan_soccer.json",
            ]),
            status: oddsFeedStateSchema,
          })
          .strict(),
      )
      .max(2)
      .optional(),
    retrievedAtUtc: utc,
    observedAtUtc: utc.optional(),
    fixture: oddsTargetSchema,
    sourceFiles: z
      .array(
        z.enum([
          "site_pregame_stoiximan_soccer_leagues.json",
          "site_pregame_stoiximan_soccer.json",
        ]),
      )
      .max(2),
    providerFixtureId: z.string().min(1).max(100).optional(),
    quotes: z
      .array(
        z
          .object({
            market: z.enum(QUOTED_MARKETS),
            selectionId: z.string().min(1).max(100),
            providerMarketId: z.string().min(1).max(100),
            observedAtUtc: utc,
            retrievedAtUtc: utc,
            sourceFile: z.enum([
              "site_pregame_stoiximan_soccer_leagues.json",
              "site_pregame_stoiximan_soccer.json",
            ]),
            decimal: z.number().finite().gt(1).lt(10000),
            line: z.number().nullable(),
          })
          .strict(),
      )
      .max(14),
    notes: z.array(z.string().max(500)).max(12),
  })
  .strict()
  .superRefine((v, c) => {
    for (const q of v.quotes) {
      const expected = q.market.startsWith("goals_")
        ? Number(q.market.split("_").slice(-2).join("."))
        : null;
      if (q.line !== expected) c.addIssue({ code: "custom", message: "Incorrect canonical line" });
    }
    for (const family of [
      ["home_win", "draw", "away_win"],
      ["both_teams_score_yes", "both_teams_score_no"],
      ["double_chance_1x", "double_chance_x2", "double_chance_12"],
      ...["1_5", "2_5", "3_5"].map((l) => [`goals_over_${l}`, `goals_under_${l}`]),
    ]) {
      const group = v.quotes.filter((q) => family.includes(q.market));
      if (
        group.length &&
        (group.length !== family.length ||
          new Set(group.map((q) => q.sourceFile + q.providerMarketId + q.observedAtUtc)).size !== 1)
      )
        c.addIssue({ code: "custom", message: "Incomplete/inconsistent market group" });
    }
    if (v.status !== "matched" && v.quotes.length)
      c.addIssue({ code: "custom", message: "Unavailable quotes must be empty" });
    if (
      v.status === "matched" &&
      (!v.observedAtUtc ||
        !v.providerFixtureId ||
        !v.sourceFiles.length ||
        v.quotes.length < 3 ||
        !["home_win", "draw", "away_win"].every((m) => v.quotes.some((q) => q.market === m)) ||
        new Set(v.quotes.map((q) => q.market)).size !== v.quotes.length ||
        new Set(v.quotes.map((q) => q.selectionId)).size !== v.quotes.length ||
        !isFreshAt(v.observedAtUtc, v.retrievedAtUtc, 15) ||
        Date.parse(v.retrievedAtUtc) >= Date.parse(v.fixture.kickoffUtc) ||
        v.quotes.some(
          (q) =>
            !v.sourceFiles.includes(q.sourceFile) ||
            !isFreshAt(q.observedAtUtc, v.retrievedAtUtc, 15) ||
            Date.parse(q.retrievedAtUtc) > Date.parse(v.retrievedAtUtc) ||
            Date.parse(q.observedAtUtc) > Date.parse(q.retrievedAtUtc),
        ))
    )
      c.addIssue({ code: "custom", message: "Not a complete fresh pre-match quote" });
  });
export type BookmakerOddsSnapshot = z.infer<typeof bookmakerOddsSnapshotSchema>;
export type OddsTarget = z.infer<typeof oddsTargetSchema>;
export function snapshotFromOdds(
  fixture: OddsTarget,
  odds: OddsFixture,
  retrievedAtUtc: string,
  sourceFiles: BookmakerOddsSnapshot["sourceFiles"],
): BookmakerOddsSnapshot {
  const fresh =
    isFreshAt(odds.observedAtUtc, retrievedAtUtc, 15) &&
    Date.parse(retrievedAtUtc) < Date.parse(fixture.kickoffUtc) &&
    Date.parse(odds.observedAtUtc) < Date.parse(fixture.kickoffUtc);
  return bookmakerOddsSnapshotSchema.parse({
    version: 1,
    provider: "arbplay-stoiximan",
    status: fresh ? "matched" : "stale",
    fixture,
    retrievedAtUtc,
    observedAtUtc: odds.observedAtUtc,
    providerFixtureId: odds.id,
    sourceFiles,
    quotes: fresh
      ? odds.markets.flatMap((m) =>
          m.selections.map((s) => {
            let market: string | undefined;
            let line: number | null = null;
            if (m.id === "1x2")
              market = ({ "1": "home_win", X: "draw", "2": "away_win" } as Record<string, string>)[
                s.label
              ];
            if (m.id === "btts")
              market = s.label === "Yes" ? "both_teams_score_yes" : "both_teams_score_no";
            if (m.id === "double_chance")
              market = (
                {
                  "1X": "double_chance_1x",
                  X2: "double_chance_x2",
                  "12": "double_chance_12",
                } as Record<string, string>
              )[s.label];
            if (m.id.startsWith("goals_")) {
              line = Number(m.id.slice(6));
              market = `goals_${s.label.startsWith("Over") ? "over" : "under"}_${String(line).replace(".", "_")}`;
            }
            return {
              market,
              selectionId: s.id,
              providerMarketId: m.providerMarketId,
              decimal: s.decimal,
              line,
              observedAtUtc: odds.observedAtUtc,
              retrievedAtUtc,
              sourceFile: sourceFiles[0],
            };
          }),
        )
      : [],
    notes: [
      "Χρόνος ενημέρωσης αρχείου, όχι μεμονωμένης απόδοσης. Κανονικές αγορές 90 λεπτών. MR12/promos εξαιρούνται.",
    ],
  });
}
export function usableOdds(
  snapshot: BookmakerOddsSnapshot | undefined,
  nowUtc: string,
): BookmakerOddsSnapshot | null {
  return snapshot?.status === "matched" &&
    snapshot.observedAtUtc &&
    isFreshAt(snapshot.observedAtUtc, nowUtc, 15) &&
    Date.parse(nowUtc) < Date.parse(snapshot.fixture.kickoffUtc)
    ? snapshot
    : null;
}
export function oddsProbabilities(snapshot: BookmakerOddsSnapshot) {
  return snapshot.status === "matched"
    ? calculateNoVig(
        snapshot.quotes
          .filter((q) => ["home_win", "draw", "away_win"].includes(q.market))
          .map((q) => ({ id: q.selectionId, label: q.market, decimal: q.decimal })),
      )
    : null;
}
