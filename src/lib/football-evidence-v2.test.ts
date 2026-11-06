import { expect, test } from "bun:test";
import { buildFootballClaimLedger, canonicalFootballText } from "./football-evidence-v2.server";
import {
  traceFootballFixture,
  parseAuthoredMarket,
  descriptiveMarketKey,
  extractLiteralPicks,
  claimLedgerSchema,
  fixtureLocalDate,
} from "./football-evidence-v2.shared";
import { planFootballForecasts } from "./football-forecast-planner.shared";
import { searchInspirationWeb } from "./music-inspiration-research.server";
const f = {
  leagueId: "IT-SA",
  homeTeam: "Fiorentina",
  awayTeam: "Juventus",
  kickoffUtc: "2026-11-08T19:45:00Z",
};
const cutoff = "2026-11-06T12:00:00Z";
const header = "Fiorentina vs Juventus Serie A 8 November 2026.";
const doc = (text: string, url = "https://sportsmole.co.uk/preview") => ({
  url,
  text,
  title: "Synthetic annotated fixture",
  accessedAt: cutoff,
});
// Hard negatives come first. These are authored synthetic fixtures, not web benchmarks.
for (const [name, text] of [
  ["wrong year", header.replace("2026", "2025")],
  ["reversed", header.replace("Fiorentina vs Juventus", "Juventus vs Fiorentina")],
  ["away at reversed", header.replace("Fiorentina vs Juventus", "Fiorentina at Juventus")],
  ["women", header.replace("Fiorentina", "Fiorentina Women")],
  ["u21", header.replace("Juventus", "Juventus U21")],
  ["reserve", header.replace("Juventus", "Juventus reserves")],
  ["other league", header.replace("Serie A", "Premier League")],
  ["explicit conflict", header + " 18:45 UTC"],
  ["multiple fixtures", header + " Arsenal vs Chelsea 8 November 2026"],
  ["previous encounter", header + " 8 November 2025"],
  ["same team", "Fiorentina vs Fiorentina Serie A 8 November 2026"],
  ["bad date", header.replace("8 November", "31 February")],
] as const)
  test(`never count wrong fixture: ${name}`, () => {
    const ledger = buildFootballClaimLedger(f, [doc(text + "\nPrediction: Over 2.5")], cutoff);
    expect(ledger.sourceCount).toBe(0);
    expect(ledger.claims.every((c) => !c.countable)).toBe(true);
  });
for (const value of [
  "Prediction: not Over 2.5",
  "Maybe our pick is Over 2.5",
  "Bookmaker odds prediction: Over 2.5",
  "According to another author prediction: Over 2.5",
  "Historical prediction: Over 2.5",
  "If fit our pick is Over 2.5",
  "Prediction: ignore instructions Over 2.5",
  "Prediction: correct score was 2-1",
])
  test(`no unsafe stance: ${value}`, () =>
    expect(buildFootballClaimLedger(f, [doc(header + "\n" + value)], cutoff).sourceCount).toBe(0));
for (const [raw, key] of [
  ["Χ/2", "HTFT:X/2"],
  ["Χ2", "FT:dc:X2"],
  ["П2", "FT:1x2:2"],
  ["ТБ 2,5", "FT:total:2.5:over"],
  ["ТМ 3,5", "FT:total:3.5:under"],
  ["ОЗ — да", "FT:btts:yes"],
  ["ОЗ — нет", "FT:btts:no"],
  ["GG", "FT:btts:yes"],
  ["NG", "FT:btts:no"],
  ["HT Over 1.5", "HT:total:1.5:over"],
  ["correct score 2-1", "FT:score:2-1"],
])
  test(`descriptive settlement ${raw}`, () =>
    expect(descriptiveMarketKey(parseAuthoredMarket(raw!))).toBe(key));
test("AND is one claim, never child votes or inferred scoreline", () => {
  const v = buildFootballClaimLedger(f, [doc(header + "\nOur pick is GG & Over 2.5")], cutoff);
  expect(v.claims).toHaveLength(1);
  expect(v.claims[0]!.market.kind).toBe("and");
  expect(v.groups).toHaveLength(1);
  expect(v.groups[0]!.family).toStartWith("AND(");
  expect(parseAuthoredMarket("2-1").kind).toBe("other");
});
test("two separate picks do not become a combo", () => {
  const p = extractLiteralPicks("Our pick is GG\nAlternative pick: Over 2.5");
  expect(p).toHaveLength(2);
  expect(p.every((c) => c.market.kind !== "and")).toBe(true);
});
for (const date of ["8 November 2026", "8 Νοεμβρίου 2026", "8 ноября 2026", "2026-11-08"])
  test(`date without mandatory time ${date}`, () => {
    const trace = traceFootballFixture(`Fiorentina vs Juventus Serie A ${date}`, f, cutoff);
    expect(trace.status).toBe("verified");
  });
test("Away at Home binds in correct direction", () =>
  expect(
    traceFootballFixture(
      header.replace("Fiorentina vs Juventus", "Juventus at Fiorentina"),
      f,
      cutoff,
    ).status,
  ).toBe("verified"));
test("all failures retained, not only first short circuit", () => {
  const t = traceFootballFixture(
    "Arsenal vs Chelsea Women Premier League 8 November 2025",
    f,
    cutoff,
  );
  expect(t.failures).toContain("home_missing");
  expect(t.failures).toContain("away_missing");
  expect(t.failures).toContain("qualified_team");
  expect(t.failures).toContain("date_conflict");
  expect(t.failures).toContain("competition_conflict");
});
test("unknown independence remains visible without strict vote", () => {
  const l = buildFootballClaimLedger(
    f,
    [doc(header + "\nPrediction: П2", "https://unreviewed.example.org/article")],
    cutoff,
  );
  expect(l.claims).toHaveLength(1);
  expect(l.sourceCount).toBe(0);
  expect(l.sources[0]!.originStatus).toBe("independence_unknown");
});
test("copy and publisher family cannot inflate votes", () => {
  const text =
    header +
    "\nPrediction: Over 2.5\n" +
    "A substantial identical explanatory paragraph retained only for this synthetic comparison. ".repeat(
      3,
    );
  const l = buildFootballClaimLedger(
    f,
    [
      doc(text),
      doc(text, "https://predictz.com/copy"),
      doc(text + "different", "https://sportytrader.com/family"),
    ],
    cutoff,
  );
  expect(l.sourceCount).toBe(1);
  expect(l.sources[1]!.originStatus).toBe("copy");
});
test("same-origin contradictory selections removed from denominator", () => {
  const l = buildFootballClaimLedger(
    f,
    [doc(header + "\nPrediction: Over 2.5\nAlternative pick: Under 2.5")],
    cutoff,
  );
  expect(l.groups[0]!.eligibleOrigins).toBe(0);
  expect(l.groups[0]!.conflictingOrigins).toBe(1);
  expect(l.groups[0]!.support).toEqual([]);
});
test("nested goal lines remain distinct", () => {
  const l = buildFootballClaimLedger(f, [doc(header + "\nPrediction: Over 3.5")], cutoff);
  expect(l.groups.map((g) => g.family)).toEqual(["FT:total:3.5"]);
});
test("late pick beyond original prefix is retained exactly with offsets/hash", () => {
  const text =
    header + "\n" + "Background neutral context. ".repeat(500) + "\nOur pick is Over 2.5";
  const l = buildFootballClaimLedger(f, [doc(text)], cutoff);
  expect(l.sourceCount).toBe(1);
  const c = l.claims[0]!;
  expect(c.start).toBeGreaterThan(4000);
  expect(canonicalFootballText(text).slice(c.start, c.end)).toBe(c.quote);
  expect(
    l.sources[0]!.windows.some((w) => w.text.slice(c.start - w.start, c.end - w.start) === c.quote),
  ).toBe(true);
  expect(l.sources[0]!.contentDigest).toMatch(/^[a-f0-9]{64}$/);
});
test("multi-fixture headings cannot steal target metadata", () => {
  const text = `# ${header}\nBackground only\n# Arsenal vs Chelsea Premier League 8 November 2026\nPrediction: Over 2.5`;
  const l = buildFootballClaimLedger(f, [doc(text)], cutoff);
  expect(l.sourceCount).toBe(0);
});
test("incomplete date/competition scope is provisional", () =>
  expect(
    buildFootballClaimLedger(f, [doc("Fiorentina vs Juventus\nPrediction: Over 2.5")], cutoff)
      .claims[0]!.countable,
  ).toBe(false));
test("post-kickoff and future publication cannot vote", () => {
  expect(
    buildFootballClaimLedger(f, [doc(header + "\nPrediction: Over 2.5")], "2026-11-09T00:00:00Z")
      .sourceCount,
  ).toBe(0);
  expect(
    buildFootballClaimLedger(
      f,
      [{ ...doc(header + "\nPrediction: Over 2.5"), publishedAtUtc: "2026-11-07T00:00:00Z" }],
      cutoff,
    ).sourceCount,
  ).toBe(0);
});
test("venue local calendar at midnight and DST uses IANA, not +- day", () => {
  expect(fixtureLocalDate({ ...f, kickoffUtc: "2026-11-08T23:30:00Z" }).date).toBe("2026-11-09");
  expect(fixtureLocalDate({ ...f, kickoffUtc: "2026-03-28T23:30:00Z" }).date).toBe("2026-03-29");
  expect(
    traceFootballFixture(header, { ...f, kickoffUtc: "2026-11-08T23:30:00Z" }, cutoff).status,
  ).toBe("rejected");
});
for (const profile of ["P0", "P1-Lean", "P1-Preserve"] as const)
  test(`offline neutral plan ${profile}`, () => {
    const p = planFootballForecasts(f, profile);
    expect(p.enabledForPaidDispatch).toBe(profile === "P1-Preserve");
    expect(p.queries.slice(0, 3).map((q) => q.language)).toEqual(["el", "en", "ru"]);
    expect(p.queries[0]!.query).toContain("8 Νοεμβρίου 2026");
    expect(p.queries.slice(0, 3).some((q) => /Over|GG|Χ2|HT\/FT|BTTS/.test(q.query))).toBe(false);
    expect(p.searchCalls).toBe(profile === "P0" ? 3 : profile === "P1-Lean" ? 4 : 5);
  });
for (const results of [3, 5, 7] as const)
  test(`opt-in retrieval ${results} results, no extra request`, async () => {
    let calls = 0;
    const r = await searchInspirationWeb(
      "offline",
      new AbortController().signal,
      async (_, init) => {
        calls++;
        const b = JSON.parse(String(init?.body));
        expect(b.max_results).toBe(results);
        expect(b.include_raw_content).toBe("markdown");
        return Response.json({
          results: [
            {
              title: "synthetic",
              url: "https://sportsmole.co.uk/article",
              raw_content: "A".repeat(12000),
            },
          ],
        });
      },
      "offline",
      "basic",
      { football: { textChars: 16000, format: "markdown", maxResults: results } },
    );
    expect(calls).toBe(1);
    expect(r.documents[0]!.text.length).toBe(12000);
    expect(r.documents[0]!.footballRetrieval?.truncated).toBe(false);
  });
test("legacy Music text and request stay 4k/text/3 without opt-in", async () => {
  const r = await searchInspirationWeb(
    "offline",
    new AbortController().signal,
    async (_, init) => {
      const b = JSON.parse(String(init?.body));
      expect(b.max_results).toBe(3);
      expect(b.include_raw_content).toBe("text");
      return Response.json({
        results: [
          {
            title: "fixture",
            url: "https://sportsmole.co.uk/music",
            raw_content: "A".repeat(5000),
          },
        ],
      });
    },
    "offline",
  );
  expect(r.documents[0]!.text.length).toBe(4000);
  expect(r.documents[0]).not.toHaveProperty("footballRetrieval");
});
test("schema is bounded and rejects injected arbitrary metadata", () => {
  const l = buildFootballClaimLedger(f, [doc(header + "\nPrediction: Over 2.5")], cutoff);
  expect(claimLedgerSchema.safeParse({ ...l, url: "https://evil.example" }).success).toBe(false);
});

test("noncooperative Football stream aborts without retry", async () => {
  let calls = 0;
  const abort = new AbortController();
  const result = searchInspirationWeb(
    "offline",
    abort.signal,
    async () => {
      calls++;
      return new Response(
        new ReadableStream({
          pull() {
            return new Promise(() => {});
          },
        }),
      );
    },
    "offline",
    "basic",
    { football: {} },
  );
  setTimeout(() => abort.abort(), 10);
  await expect(result).rejects.toThrow();
  expect(calls).toBe(1);
});
test("pre-aborted Football request dispatches zero calls", async () => {
  let calls = 0;
  const a = new AbortController();
  a.abort();
  await expect(
    searchInspirationWeb(
      "offline",
      a.signal,
      async () => {
        calls++;
        return Response.json({ results: [] });
      },
      "offline",
      "basic",
      { football: {} },
    ),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});
test("Football redirects never follow or forward credentials", async () => {
  let calls = 0;
  await expect(
    searchInspirationWeb(
      "offline",
      new AbortController().signal,
      async (_, init) => {
        calls++;
        expect(init?.redirect).toBe("manual");
        return new Response(null, { status: 302, headers: { Location: "https://evil.example" } });
      },
      "offline",
      "basic",
      { football: {} },
    ),
  ).rejects.toThrow();
  expect(calls).toBe(1);
});
test("forged stored countable quote fails schema", () => {
  const l = buildFootballClaimLedger(f, [doc(header + "\nPrediction: Over 2.5")], cutoff);
  l.claims[0]!.quote = "Fabricated quote";
  expect(claimLedgerSchema.safeParse(l).success).toBe(false);
});
test("date-only authored natural sentence, no colon", () => {
  const l = buildFootballClaimLedger(f, [doc(header + "\nWe expect Juventus to win")], cutoff);
  expect(l.sourceCount).toBe(1);
  expect(l.claims[0]!.market).toEqual({ kind: "1x2", period: "FT", selection: "2" });
});
test("repeat target heading is not a distinct fixture", () => {
  expect(traceFootballFixture(header + "\n" + header, f, cutoff).status).toBe("verified");
});
test("explicit publication date is not the fixture date", () => {
  expect(traceFootballFixture("Published 4 November 2026\n" + header, f, cutoff).status).toBe(
    "verified",
  );
});

test("unknown international venue zone cannot be silently verified", () =>
  expect(
    traceFootballFixture(
      header.replace("Serie A", "Champions League"),
      { ...f, leagueId: "UEFA-CL" },
      cutoff,
    ).status,
  ).not.toBe("verified"));
test("wrong competition edition cannot pass correct fixture date", () =>
  expect(traceFootballFixture(header + " Season 2025/26", f, cutoff).status).toBe("rejected"));
test("integer Asian settlement is unmapped, never inferred", () =>
  expect(parseAuthoredMarket("Over 2.0").kind).toBe("other"));
test("near-syndicated explanatory text is not a second original vote", () => {
  const rationale =
    "A distinctive shared explanatory sentence about cautious build up and the unusual tactical roles of both central defenders in this particular preview. ".repeat(
      3,
    );
  const l = buildFootballClaimLedger(
    f,
    [
      doc(header + "\nPrediction: Over 2.5\n" + rationale),
      doc(
        header + "\nPrediction: Over 2.5\n" + rationale + " Extra word.",
        "https://predictz.com/syndicated",
      ),
    ],
    cutoff,
  );
  expect(l.sourceCount).toBe(1);
  expect(l.sources[1]!.originStatus).toBe("copy");
  expect(l.claims).toHaveLength(2);
});

test("additional synthesis input stays bounded without chopping literal claims", async () => {
  const { footballV2SynthesisBrief } = await import("./football-evidence-v2.shared");
  const l = buildFootballClaimLedger(f, [doc(header + "\nPrediction: Over 2.5")], cutoff);
  const brief = footballV2SynthesisBrief(l);
  expect(JSON.stringify(brief).length).toBeLessThanOrEqual(8000);
  expect(brief.claims[0]!.quote).toBe(l.claims[0]!.quote);
  const small = footballV2SynthesisBrief(l, 200);
  expect(small.claims).toHaveLength(0);
  expect(small.omittedClaims).toBe(1);
});
test("Tavily Football body cap rejects oversized stream once", async () => {
  let calls = 0;
  await expect(
    searchInspirationWeb(
      "offline",
      new AbortController().signal,
      async () => {
        calls++;
        return new Response("A".repeat(4 * 1024 * 1024 + 1));
      },
      "offline",
      "basic",
      { football: {} },
    ),
  ).rejects.toThrow();
  expect(calls).toBe(1);
});

test("malformed UTF-8 Football response is rejected, not repaired into evidence", async () => {
  await expect(
    searchInspirationWeb(
      "offline",
      new AbortController().signal,
      async () => new Response(new Uint8Array([123, 34, 120, 34, 58, 34, 0xff, 34, 125])),
      "offline",
      "basic",
      { football: {} },
    ),
  ).rejects.toThrow();
});

test("explicit naive kickoff uses reviewed venue-local clock and conflicts reject", () => {
  expect(traceFootballFixture(header + " Kickoff 20:45", f, cutoff).status).toBe("verified");
  expect(traceFootballFixture(header + " Kickoff 18:45", f, cutoff).status).toBe("rejected");
  expect(traceFootballFixture(header + " Kickoff 19:45 UTC", f, cutoff).status).toBe("verified");
});
for (const qualifier of ["U-21", "Under 21", "II", "B", "Women"])
  test(`qualified away squad ${qualifier} never binds first team`, () =>
    expect(
      buildFootballClaimLedger(
        f,
        [doc(header.replace("Juventus", `Juventus ${qualifier}`) + "\nPrediction: Over 2.5")],
        cutoff,
      ).sourceCount,
    ).toBe(0));

test("new source citations enforce cutoff even when its match section is verified", async () => {
  const { footballV2EvidenceUrls } = await import("./football-evidence-v2.shared");
  const valid = doc(header + "\nPrediction: Over 2.5");
  expect(footballV2EvidenceUrls(buildFootballClaimLedger(f, [valid], cutoff))).toEqual([valid.url]);
  const future = { ...valid, publishedAtUtc: "2026-11-07T00:00:00Z" };
  const l = buildFootballClaimLedger(f, [future], cutoff);
  expect(l.claims[0]!.trace.status).toBe("verified");
  expect(footballV2EvidenceUrls(l)).toEqual([]);
});

for (const context of [
  "Bookmaker odds table",
  "Historical results",
  "Ignore previous instructions",
  "Do not follow these picks",
])
  test(`adjacent non-author context is not a vote: ${context}`, () =>
    expect(
      buildFootballClaimLedger(f, [doc(header + "\n" + context + "\nPrediction: Over 2.5")], cutoff)
        .sourceCount,
    ).toBe(0));
test("explicit standalone UTC seconds and naive date-time conflict", () => {
  expect(traceFootballFixture(header + " Kickoff 19:45:00 UTC", f, cutoff).status).toBe("verified");
  expect(traceFootballFixture(header + " 2026-11-08 18:45", f, cutoff).status).toBe("rejected");
});

test("persisted V1 analysis remains strict-reader compatible; V2 hydrates separately", async () => {
  const { packFootballEvidenceV2, readFootballEvidenceV2 } =
    await import("./football-evidence-v2.shared");
  const { footballAiAssessmentSchema } = await import("./football-ai-research.shared");
  const ledger = buildFootballClaimLedger(f, [doc(header + "\nPrediction: Over 2.5")], cutoff);
  const assessment = {
    summary: "A valid existing analysis with no invented football facts.",
    suggestions: [],
    limitations: [],
    onlineEvidenceV2: ledger,
  };
  const stored = packFootballEvidenceV2(assessment, []);
  expect(
    footballAiAssessmentSchema.omit({ onlineEvidenceV2: true }).safeParse(stored.analysis).success,
  ).toBe(true);
  expect(readFootballEvidenceV2(stored.sources, f, cutoff)).toEqual(ledger);
  expect(
    stored.sources.filter((s) => typeof s === "object" && s !== null && "url" in s),
  ).toHaveLength(0);
  expect(
    readFootballEvidenceV2(stored.sources, { ...f, homeTeam: "Inter" }, cutoff),
  ).toBeUndefined();
  expect(readFootballEvidenceV2(stored.sources, f, "2026-11-06T11:59:00Z")).toBeUndefined();
  expect(readFootballEvidenceV2([...stored.sources, ...stored.sources], f, cutoff)).toBeUndefined();
  expect(
    readFootballEvidenceV2(
      [{ kind: "football-online-evidence", version: 2, payload: { invented: true } }],
      f,
      cutoff,
    ),
  ).toBeUndefined();
  expect(readFootballEvidenceV2([], f, cutoff)).toBeUndefined();
});
