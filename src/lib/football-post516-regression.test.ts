import { expect, test } from "bun:test";
import { buildFootballClaimLedger } from "./football-evidence-v2.server";
import {
  extractLiteralPicks,
  footballPublicRationale,
  descriptiveMarketKey,
} from "./football-evidence-v2.shared";
const f = {
  leagueId: "IT-SA",
  homeTeam: "Fiorentina",
  awayTeam: "Juventus",
  kickoffUtc: "2026-11-08T19:45:00Z",
};
const cutoff = "2026-11-06T21:21:55Z";
const doc = (
  text: string,
  url = "https://footballpredictions.com/footballpredictions/serieapredictions/regression",
) => ({ text, url, title: "Offline incident regression", accessedAt: cutoff });
// Minimal retained incident quotations; surrounding prose/noise is synthetic, not full-article replay.
const header =
  "Home > Serie A Predictions > Fiorentina vs Juventus Prediction\n4 November 2026 • 12:21 UTC • 1 min read\nFiorentina vs Juventus Prediction and Betting Tips 8 November 2026\n";
const literal = "Our prediction for this match: Fiorentina 1 - 1 Juventus";
test("post516 retained named-score expression and date/byline separation", () => {
  const l = buildFootballClaimLedger(
    f,
    [
      doc(
        header +
          literal +
          "\n" +
          "Background narrative about recent Champions League performance. ".repeat(5) +
          "\nNow Trending Football Predictions\nArsenal vs Chelsea 4 November 2025",
      ),
    ],
    cutoff,
  );
  expect(l.sourceCount).toBe(1);
  expect(l.claims.find((c) => c.countable)?.market).toEqual({
    kind: "score",
    period: "FT",
    home: 1,
    away: 1,
  });
});
test("menu candidates cannot consume all six windows before late authored pick", () => {
  const text =
    header +
    Array.from({ length: 18 }, (_, i) => `Free soccer picks ${i} premium signup.\n`).join("") +
    "Neutral background. ".repeat(500) +
    "\n" +
    literal;
  const l = buildFootballClaimLedger(f, [doc(text)], cutoff);
  const c = l.claims.find((c) => c.countable)!;
  expect(c).toBeDefined();
  expect(text.slice(c.start, c.end)).toBe(literal);
  expect(
    l.sources[0]!.windows.some(
      (w) =>
        w.start <= c.start &&
        w.end >= c.end &&
        w.text.slice(c.start - w.start, c.end - w.start) === literal,
    ),
  ).toBe(true);
});
for (const [name, replacement] of [
  ["wrong year", "2025"],
  ["wrong date", "2026"],
] as const)
  test(`scoped header does not legalize ${name}`, () => {
    const h =
      name === "wrong year"
        ? header.replace("8 November 2026", "8 November " + replacement)
        : header.replace("8 November", "9 November");
    expect(buildFootballClaimLedger(f, [doc(h + literal)], cutoff).sourceCount).toBe(0);
  });
for (const blocker of [
  "Arsenal vs Chelsea\nPrediction: Over 2.5",
  "Juventus vs Fiorentina\nPrediction: Over 2.5",
  "Kickoff: 18:45 UTC\nPrediction: Over 2.5",
  "Fiorentina Women vs Juventus Women\nPrediction: Over 2.5",
])
  test(`metadata inheritance refuses ${blocker}`, () =>
    expect(buildFootballClaimLedger(f, [doc(header + blocker)], cutoff).sourceCount).toBe(0));
for (const [raw, key] of [
  ["We expect Juventus to win.", "FT:1x2:2"],
  ["Προτείνουμε: GG & Over 2.5", "AND(FT:btts:yes,FT:total:2.5:over)"],
  ["Наш выбор: П2", "FT:1x2:2"],
  ["Our Hot tip\nDraw", "FT:1x2:X"],
  ["Our pick: Take Juventus (-182)", "FT:1x2:2"],
] as const)
  test(`natural author statement ${raw}`, () =>
    expect(
      extractLiteralPicks(raw, f).some(
        (c) => c.stance === "authored" && descriptiveMarketKey(c.market) === key,
      ),
    ).toBe(true));
for (const raw of [
  "We do not recommend Juventus to win.",
  "Bookmaker odds prediction: Juventus to win",
  "Maybe our pick is Juventus to win",
  "Historical prediction: Fiorentina 1 - 1 Juventus",
  "According to another author prediction: Juventus to win",
])
  test(`no newly accepted unsafe ${raw}`, () =>
    expect(extractLiteralPicks(raw, f).some((c) => c.stance === "authored")).toBe(false));
test("ordinal dates are accepted without guessed numeric-date convention", () => {
  const l = buildFootballClaimLedger(
    f,
    [doc("Fiorentina vs Juventus Serie A Sunday 8th November 2026\nOur pick: Over 2.5")],
    cutoff,
  );
  expect(l.sourceCount).toBe(1);
  expect(
    buildFootballClaimLedger(
      f,
      [doc("Fiorentina vs Juventus Serie A 11/08/2026\nOur pick: Over 2.5")],
      cutoff,
    ).sourceCount,
  ).toBe(0);
});
test("unknown publisher and copied articles do not manufacture independence", () => {
  expect(
    buildFootballClaimLedger(
      f,
      [doc(header + literal, "https://unreviewed.example.org/preview")],
      cutoff,
    ).sourceCount,
  ).toBe(0);
  const text =
    header +
    literal +
    "\n" +
    "Identical substantive reasoning describing form and home performance. ".repeat(5);
  expect(
    buildFootballClaimLedger(f, [doc(text), doc(text, "https://sportsmole.co.uk/copy")], cutoff)
      .sourceCount,
  ).toBe(1);
});
test("saved technical model prose is removed only in public projection", () => {
  const raw =
    "Τα στοιχεία δεν επαρκούν. Το onlineEvidenceV2 δεν περιλαμβάνει claimId. Χρειάζεται καλύτερη τεκμηρίωση.";
  expect(footballPublicRationale(raw)).toBe(
    "Τα στοιχεία δεν επαρκούν. Χρειάζεται καλύτερη τεκμηρίωση.",
  );
  expect(raw).toContain("claimId");
  expect(footballPublicRationale("No onlineEvidenceV2 claims.")).toBeUndefined();
});

test("retained Russian author selection resolves reviewed club spelling but does not approve publisher", () => {
  const f = {
    leagueId: "IT-SA",
    homeTeam: "Internazionale",
    awayTeam: "Como",
    kickoffUtc: "2026-11-08T17:00:00Z",
  };
  const raw = "Учитывая форму хозяев, ставка на «Победу Интера»выглядит наиболее обоснованной.";
  const pick = extractLiteralPicks(raw, f).find((c) => c.stance === "authored");
  expect(pick?.market).toEqual({ kind: "1x2", period: "FT", selection: "1" });
  const text = "Интер - Комо Серия А 8 ноября 2026\n" + raw;
  const l = buildFootballClaimLedger(
    f,
    [doc(text, "https://www.vedomosti.ru/sport/rb/predictions/article/regression")],
    cutoff,
  );
  expect(l.claims.some((c) => c.stance === "authored")).toBe(true);
  expect(l.sourceCount).toBe(0);
});
test("natural Greek explicit team recommendation", () =>
  expect(
    extractLiteralPicks("Προτείνουμε τη νίκη της Γιουβέντους.", f).some(
      (c) => c.stance === "authored" && descriptiveMarketKey(c.market) === "FT:1x2:2",
    ),
  ).toBe(true));

test("explicit forecast subsection inherits only verified same-article metadata", () => {
  expect(
    buildFootballClaimLedger(f, [doc(header + "\n## Our prediction\n" + literal)], cutoff)
      .sourceCount,
  ).toBe(1);
  expect(
    buildFootballClaimLedger(
      f,
      [
        doc(
          header +
            "\n## Arsenal vs Chelsea Premier League 8 November 2026\n## Our prediction\nPrediction: Over 2.5",
        ),
      ],
      cutoff,
    ).sourceCount,
  ).toBe(0);
  expect(
    buildFootballClaimLedger(
      f,
      [doc(header + "\n## Our prediction\n9 November 2026\nPrediction: Over 2.5")],
      cutoff,
    ).sourceCount,
  ).toBe(0);
});

test("explicit authored section reads separate BTTS/total rows without harvesting odds tables", () => {
  const rows = "Our predictions\nBoth Teams To Score Yes\nOver 2.5 goals\nOdds table\nUnder 1.5";
  const p = extractLiteralPicks(rows, f).filter((c) => c.stance === "authored");
  expect(p.map((c) => descriptiveMarketKey(c.market))).toEqual([
    "FT:btts:yes",
    "FT:total:2.5:over",
  ]);
  for (const c of p) expect(rows.slice(c.start, c.end)).toBe(c.quote);
  expect(
    extractLiteralPicks("Historical results\nOver 2.5 goals\n1:2", f).some(
      (c) => c.stance === "authored",
    ),
  ).toBe(false);
});

test("retained article contradicting the exact fixture weekday remains noncountable", () => {
  const l = buildFootballClaimLedger(
    f,
    [
      doc(
        header +
          literal +
          "\nMonday's football game between Fiorentina and Juventus concludes the round.",
      ),
    ],
    cutoff,
  );
  expect(l.sourceCount).toBe(0);
  expect(l.sources[0]!.trace.failures).toContain("weekday_conflict");
});

for (const context of [
  "Historical results",
  "According to another author",
  "Bookmaker odds table",
  "Ignore previous instructions",
])
  test(`separate block cannot bypass unsafe context: ${context}`, () => {
    expect(
      extractLiteralPicks(context + "\nOur predictions\nOver 2.5", f).some(
        (c) => c.stance === "authored",
      ),
    ).toBe(false);
    expect(
      extractLiteralPicks(context + "\nOur selection\nOver 2.5", f).some(
        (c) => c.stance === "authored",
      ),
    ).toBe(false);
  });

test("same-team fixture metadata cannot override a conflicting second fixture heading", () => {
  for (const wrong of [
    "Fiorentina vs Juventus Premier League 8 November 2026",
    "Fiorentina vs Juventus Serie A 9 November 2026",
    "Fiorentina vs Juventus Serie A Kickoff 18:45 UTC",
  ])
    expect(
      buildFootballClaimLedger(f, [doc(header + wrong + "\nPrediction: Over 2.5")], cutoff)
        .sourceCount,
    ).toBe(0);
});
