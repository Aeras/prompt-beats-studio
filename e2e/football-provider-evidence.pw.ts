import { attachIndependentAssessment } from "../src/lib/football-evidence-v2.shared";
import { providerEvidenceUrls } from "../src/lib/football-provider-evidence.shared";
import { buildFootballClaimLedger } from "../src/lib/football-evidence-v2.server";
import { buildFootballPredictionConsensus } from "../src/lib/football-prediction-consensus.shared";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  FOOTBALL_EVIDENCE_PROVIDERS,
  type FootballProviderEvidence,
} from "../src/lib/football-provider-evidence.shared";

const user = {
  id: "bb000000-0000-4000-8000-000000000008",
  aud: "authenticated",
  role: "authenticated",
  email: "football@example.test",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
async function fixture(
  page: Page,
  authorized = true,
  history = false,
  oddsStatus = "matched",
  language = "el",
  pair = { home: "Arsenal", away: "Liverpool" },
  count = 1,
  allowResearch = false,
  online = false,
  evidenceV2 = false,
  judgmentMode: "combo" | "abstain" | "unsupported" = "combo",
) {
  const token =
    [
      { alg: "HS256", typ: "JWT" },
      { sub: user.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 },
    ]
      .map((x) => Buffer.from(JSON.stringify(x)).toString("base64url"))
      .join(".") + ".offline";
  await page.addInitScript(
    (language) => localStorage.setItem("pb:interface-language", language),
    language,
  );
  await page.addInitScript(
    ({ user, token }) =>
      localStorage.setItem(
        "sb-qwlksrcsovbncmretjdt-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "offline",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      ),
    { user, token },
  );
  await page.route("**/*.supabase.co/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: p.startsWith("/auth/")
        ? user
        : p.includes("get_my_account_status")
          ? { status: "active", is_banned: false }
          : p.includes("/profiles")
            ? { handle: "football", display_name: "Football", profile_completed: true }
            : p.includes("/rpc/")
              ? false
              : [],
    });
  });
  let paid = 0,
    reads = 0;
  const seenProviders: string[] = [];
  const kickoffUtc = new Date(Math.ceil(Date.now() / 60000) * 60000 + 86400000).toISOString();
  const side = {
    id: "10",
    name: pair.home,
    standing: null,
    recentResults: [
      {
        id: "1",
        kickoffUtc: "2026-10-01T12:00:00Z",
        opponent: "Liverpool",
        homeAway: "home" as const,
        goalsFor: 2,
        goalsAgainst: 1,
        xg: 1.9,
        xga: 0.8,
      },
    ],
    roster: [],
    injuries: [],
    matchStatistics: [],
    teamStatistics: [],
  };
  const bookmakerOddsSnapshot = {
    version: 1,
    provider: "arbplay-stoiximan",
    status: oddsStatus,
    retrievedAtUtc: new Date().toISOString(),
    observedAtUtc: new Date().toISOString(),
    fixture: { leagueId: "EN-PL", homeTeam: pair.home, awayTeam: pair.away, kickoffUtc },
    providerFixtureId: "odds999",
    sourceFiles: ["site_pregame_stoiximan_soccer_leagues.json"],
    notes: ["Αποδόσεις αρχείου, όχι εγγύηση."],
    quotes:
      oddsStatus !== "matched"
        ? []
        : ["home_win", "draw", "away_win"].map((market, i) => ({
            market,
            selectionId: "s" + i,
            providerMarketId: "m1",
            decimal: [2, 3.5, 4][i],
            line: null,
            observedAtUtc: new Date().toISOString(),
            retrievedAtUtc: new Date().toISOString(),
            sourceFile: "site_pregame_stoiximan_soccer_leagues.json",
          })),
  };
  const snapshot: FootballProviderEvidence = {
    version: 1,
    collectedAtUtc: new Date().toISOString(),
    fixture: { leagueId: "EN-PL", homeTeam: pair.home, awayTeam: pair.away, kickoffUtc },
    conflicts: ["Διαφωνία δύο πηγών: τα σκορ διατηρούνται χωριστά."],
    providers: FOOTBALL_EVIDENCE_PROVIDERS.map((provider) => ({
      provider,
      status: provider === "football-data" ? "rate_limited" : "ok",
      fixtureId: "999",
      home: side,
      away: { ...side, id: "20", name: pair.away },
      resources: [
        {
          url:
            provider === "pitchapi"
              ? "https://api.pitchapi.dev/v1/matches/m_OLD001/stats"
              : "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=999",
          status: "ok",
          fetchedAtUtc: new Date().toISOString(),
        },
      ],
      notes: ["Μόνο καταγεγραμμένα στοιχεία παρόχου. Καμία εγγύηση πρόβλεψης."],
    })),
  };
  await page.route("**/_serverFn/**", async (route) => {
    const name = Buffer.from(
      new URL(route.request().url()).pathname.split("/_serverFn/")[1] ?? "",
      "base64url",
    ).toString();
    let result: unknown = {};
    if (
      /runPrivateFootballResearch|runPrivateFootballExpertReview|refreshPrivateFootball/.test(name)
    ) {
      paid++;
      if (allowResearch) return route.fulfill({ json: { result: {}, context: {} } });
      return route.abort();
    }
    if (name.includes("getPrivateFootballResearchSetup")) {
      if (!authorized) return route.fulfill({ status: 403, body: "Denied" });
      result = {
        provider: "openrouter",
        models: allowResearch
          ? [{ id: "offline-model", label: "Offline model", status: "enabled" }]
          : [],
        fixtureProviders: [
          { id: "espn", label: "ESPN", configured: true },
          { id: "api-football", label: "API-Football", configured: true },
          { id: "football-data", label: "football-data.org", configured: true },
        ],
        evidenceProviders: FOOTBALL_EVIDENCE_PROVIDERS.map((id) => ({ id, configured: true })),
        bookmakerOddsConfigured: true,
        tavilyConfigured: true,
        liveFixturesConfigured: true,
        aiAnalysisEnabled: allowResearch,
      };
    } else if (name.includes("getPrivateFootballWeek")) {
      const request = decodeURIComponent(route.request().url());
      seenProviders.push(request);
      result = {
        status: "ok",
        fixtures: Array.from({ length: count }, (_, i) => ({
          source: "espn",
          sourceFixtureId: String(999 + i),
          leagueId: "EN-PL",
          homeTeam: pair.home,
          awayTeam: pair.away,
          kickoffUtc,
          state: "scheduled",
          fetchedAtUtc: new Date().toISOString(),
        })),
      };
    } else if (name.includes("getPrivateFootballProviderEvidence")) {
      reads++;
      result = { ...snapshot, bookmakerOddsSnapshot };
    } else if (name.includes("getPrivateFootballResearchHistory"))
      result = history
        ? [
            {
              id: "offline-run",
              source: "espn",
              fixture_id: 999,
              league_id: "EN-PL",
              home_team: pair.home,
              away_team: pair.away,
              model_id: "offline-model",
              kickoff_utc: kickoffUtc,
              created_at: new Date().toISOString(),
              evidence_cutoff_at: new Date().toISOString(),
              status: "completed",
              error_code: null,
              expertReview: null,
              analysis: {
                summary: "Αποθηκευμένη ερευνητική ανάλυση χωρίς νέα κλήση παρόχου.",
                suggestions: [],
                estimates: [],
                limitations: [],
                providerEvidence: snapshot,
                bookmakerOddsSnapshot,
                ...(evidenceV2
                  ? {
                      onlineEvidenceV2: (() => {
                        const ledger = buildFootballClaimLedger(
                          {
                            leagueId: "EN-PL",
                            homeTeam: pair.home,
                            awayTeam: pair.away,
                            kickoffUtc,
                          },
                          [
                            {
                              title: "Synthetic V2 preview",
                              url: "https://sportsmole.co.uk/offline-v2",
                              accessedAt: new Date().toISOString(),
                              text: `${pair.home} vs ${pair.away} Premier League ${kickoffUtc.slice(0, 10)}\nOur pick is GG & Over 2.5`,
                              queryLanguage: "en",
                            },
                            {
                              title: "Synthetic provisional source",
                              url: "https://unreviewed.example.org/v2",
                              accessedAt: new Date().toISOString(),
                              text: `${pair.home} vs ${pair.away} Premier League ${kickoffUtc.slice(0, 10)}\nOur pick is Χ/2`,
                              queryLanguage: "mixed",
                            },
                          ],
                          new Date().toISOString(),
                        );
                        const opinion =
                          judgmentMode === "abstain"
                            ? {
                                decision: "abstain",
                                rationale:
                                  "The synthetic evidence is insufficient for a defensible independent choice.",
                                supportingClaimIds: [],
                                evidenceUrls: [],
                              }
                            : {
                                decision: "lean",
                                selection: {
                                  kind: "and",
                                  legs: [
                                    { kind: "btts", period: "FT", selection: "yes" },
                                    { kind: "total", period: "FT", selection: "over", line: 2.5 },
                                  ],
                                },
                                rationale:
                                  "Independent assessment of the supplied form supports the conjunction, with uncertainty.",
                                supportingClaimIds: judgmentMode === "unsupported" ? [] : [0],
                                evidenceUrls: [
                                  ledger.sources[0]!.url,
                                  snapshot.providers[0]!.resources[0]!.url,
                                ],
                                jointRationale:
                                  "The exact authored conjunction is compared with real supplied match data rather than combining two popular votes.",
                              };
                        return attachIndependentAssessment(
                          ledger,
                          opinion,
                          providerEvidenceUrls(snapshot),
                        );
                      })(),
                    }
                  : {}),
                ...(online
                  ? {
                      externalPredictionConsensus: (() => {
                        const accessedAt = new Date().toISOString();
                        const target = {
                          leagueId: "EN-PL",
                          homeTeam: pair.home,
                          awayTeam: pair.away,
                          kickoffUtc,
                        };
                        const passage = `${pair.home} vs ${pair.away} Premier League ${kickoffUtc.slice(0, 10)} ${kickoffUtc.slice(11, 16)} UTC. Prediction: Over 2.5; Synthetic fixture with no real provider call.`;
                        const sources = ["sportsmole.co.uk", "predictz.com"].map((host, i) => ({
                          title: `Offline preview ${i}`,
                          url: `https://${host}/offline-${i}`,
                          accessedAt,
                          excerpt: passage + ` Editorial ${i}`,
                          researchIntent: "external_forecasts" as const,
                        }));
                        return buildFootballPredictionConsensus(
                          target,
                          sources,
                          {
                            onlinePredictions: sources.map((source, sourceIndex) => ({
                              sourceIndex,
                              passage: source.excerpt,
                              market: "goals_over_2_5",
                            })),
                            onlineJudgment: {
                              decision: "lean",
                              primary: "goals_over_2_5",
                              rationale:
                                "Independent synthetic football reasoning, not measured probability.",
                              counterargument: "There are only two retrieved published sources.",
                              risk: "The lineups and match outcome remain uncertain.",
                              evidenceUrls: [sources[0]!.url],
                            },
                          },
                          accessedAt,
                        );
                      })(),
                    }
                  : {}),
              },
              sources: [],
              usage: null,
              outcomes: [],
              quoteOutcomes: [],
            },
          ]
        : [];
    else if (name.includes("getMyModeration")) result = { role: "super_admin", status: "active" };
    await route.fulfill({ json: { result, context: {} } });
  });
  await page.goto("/private/football-research");
  return { paid: () => paid, reads: () => reads, seenProviders };
}

test("ESPN is automatic default; all source statuses, touch/keyboard preview and no paid dispatch", async ({
  page,
}) => {
  const f = await fixture(page);
  await expect(page.getByLabel("Πάροχος αγώνων")).toHaveValue("espn");
  await expect(page.getByRole("region", { name: "Συνδέσεις πηγών ανάλυσης" })).toHaveCount(0);
  const button = page.getByRole("button", { name: "Στοιχεία παρόχων Άρσεναλ – Λίβερπουλ" });
  await expect(button).toBeVisible();
  await button.click();
  const panel = page.getByRole("region", { name: "Στοιχεία όλων των παρόχων" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Όριο αιτημάτων παρόχου");
  await expect(panel).toContainText("Διαφωνία δύο πηγών");
  const pitch = panel
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: /^PitchAPI/ }) })
    .first();
  await pitch.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(pitch).toHaveAttribute("open", "");
  await expect(pitch).toContainText("xG 1.9 / xGA 0.8");
  await expect(page.getByRole("region", { name: "Αποδόσεις Stoiximan" })).toContainText(
    "Άρσεναλ – Λίβερπουλ",
  );
  await expect(page.getByRole("region", { name: "Αποδόσεις Stoiximan" })).toContainText(
    "Αγορά χωρίς γκανιότα",
  );
  expect(f.reads()).toBe(1);
  expect(f.paid()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page })
    .include('[aria-label="Στοιχεία όλων των παρόχων"]')
    .include('[aria-label="Αποδόσεις Stoiximan"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  if (test.info().project.name === "mobile") {
    for (const [width, height] of [
      [320, 640],
      [360, 740],
      [390, 844],
      [667, 375],
    ]) {
      await page.setViewportSize({ width: width!, height: height! });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const row = page.getByRole("region", { name: "Λίστα αγώνων" }).locator("li").first();
      const title = await row.locator("p").first().boundingBox();
      expect(title!.width).toBeGreaterThan(130);
      expect(title!.height).toBeLessThan(80);
    }
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.screenshot({
    path: test.info().outputPath("football-all-sources.png"),
    fullPage: true,
  });
});

test("switching fixture picker keeps all sources in preview, without triggering research", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.getByLabel("Πάροχος αγώνων").selectOption("api-football");
  await page.getByRole("button", { name: "Στοιχεία παρόχων Άρσεναλ – Λίβερπουλ" }).click();
  await expect(page.getByRole("region", { name: "Στοιχεία όλων των παρόχων" })).toContainText(
    "PitchAPI",
  );
  expect(f.paid()).toBe(0);
  expect(f.reads()).toBe(1);
});

test("unauthorized setup never reads multi-provider details", async ({ page }) => {
  const f = await fixture(page, false);
  await expect(page.getByRole("alert")).toContainText("Η πρόσβαση δεν επιτρέπεται");
  expect(f.reads()).toBe(0);
  expect(f.paid()).toBe(0);
});

test("saved multi-provider evidence expands repeatedly without fresh provider reads or paid calls", async ({
  page,
}) => {
  const f = await fixture(page, true, true);
  const card = page.getByRole("button", { name: /^Άρσεναλ – Λίβερπουλ/ });
  await card.click();
  await expect(page.getByRole("region", { name: "Στοιχεία όλων των παρόχων" })).toContainText(
    "PitchAPI",
  );
  await expect(page.getByRole("region", { name: "Αποδόσεις Stoiximan" })).toContainText(
    "Αγορά χωρίς γκανιότα",
  );
  await card.click();
  await card.click();
  expect(f.reads()).toBe(0);
  expect(f.paid()).toBe(0);
});

for (const [status, label] of [
  ["stale", "Μη πρόσφατες αποδόσεις"],
  ["quota_exhausted", "Εξαντλήθηκε η ποσόστωση παρόχου"],
])
  test(`odds unavailable state ${status} is explicit with no quotes or paid call`, async ({
    page,
  }) => {
    const f = await fixture(page, true, false, status);
    await page.getByRole("button", { name: "Στοιχεία παρόχων Άρσεναλ – Λίβερπουλ" }).click();
    const panel = page.getByRole("region", { name: "Αποδόσεις Stoiximan" });
    await expect(panel).toContainText(label!);
    await expect(panel).not.toContainText("Αγορά χωρίς γκανιότα");
    expect(f.paid()).toBe(0);
  });
test("English account keeps original team names in fixtures and odds; source identity unchanged", async ({
  page,
}) => {
  const f = await fixture(page, true, false, "matched", "en");
  await expect(
    page.getByRole("checkbox", { name: "Επιλογή αγώνα Arsenal – Liverpool" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Στοιχεία παρόχων Arsenal – Liverpool" }).click();
  await expect(page.getByRole("region", { name: "Αποδόσεις Stoiximan" })).toContainText(
    "Arsenal – Liverpool",
  );
  expect(f.paid()).toBe(0);
});

for (const [home, away, homeEl, awayEl] of [
  ["AC Fiorentina", "Juventus FC", "Φιορεντίνα", "Γιουβέντους"],
  ["Olympiacos Piraeus", "Panaitolikos", "Ολυμπιακός", "Παναιτωλικός"],
  ["Brighton & Hove Albion", "Coventry City", "Μπράιτον", "Κόβεντρι"],
  ["Olympique Lyonnais", "ES Troyes AC", "Λιόν", "Τρουά"],
  ["Deportivo de A Coruña", "Athletic Bilbao", "Ντεπορτίβο Λα Κορούνια", "Αθλέτικ Μπιλμπάο"],
  ["TSG 1899 Hoffenheim", "SV Elversberg", "Χόφενχαϊμ", "Έλβερσμπεργκ"],
])
  test(`six-league Greek aliases: ${home} — display only and zero paid dispatch`, async ({
    page,
  }) => {
    const f = await fixture(page, true, false, "matched", "el", { home: home!, away: away! });
    const button = page.getByRole("button", { name: `Στοιχεία παρόχων ${homeEl} – ${awayEl}` });
    await expect(button).toBeVisible();
    await button.click();
    const odds = page.getByRole("region", { name: "Αποδόσεις Stoiximan" });
    await expect(odds).toContainText(`${homeEl} – ${awayEl}`);
    await expect(odds).toContainText("2.00");
    expect(f.paid()).toBe(0);
    expect(f.reads()).toBe(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

test("compact analysis toolbar stays at viewport top while the single page scrolls", async ({
  page,
}) => {
  await fixture(page);
  const bar = page.getByRole("region", { name: "Ανάλυση αγώνων" });
  await expect(bar.getByRole("heading", { name: "Ανάλυση", exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: /^Όλων/ })).toBeVisible();
  await expect(bar.getByRole("button", { name: /^Επιλεγμένων/ })).toBeVisible();
  await expect(page.getByText("Έως 5 αναλύσεις ανά ώρα.", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Λίστα αγώνων" })).toBeVisible();
  const buttons = await bar.locator("button").evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { top: r.top, height: r.height };
    }),
  );
  expect(buttons[0]!.top).toBe(buttons[1]!.top);
  expect(buttons.every((b) => b.height >= 44)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => Math.round((await bar.boundingBox())!.y)).toBe(0);
  expect(await bar.evaluate((n) => getComputedStyle(n).position)).toBe("sticky");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("all ten games can be analyzed serially with one confirmation and no five-game UI cap", async ({
  page,
}, testInfo) => {
  const f = await fixture(
    page,
    true,
    false,
    "matched",
    "el",
    { home: "Arsenal", away: "Liverpool" },
    10,
    true,
  );
  await page.getByRole("combobox", { name: "Μοντέλο AI" }).selectOption("offline-model");
  const all = page.getByRole("button", { name: "Όλων (10)", exact: true });
  await expect(all).toBeEnabled();
  let confirmations = 0;
  page.on("dialog", async (d) => {
    confirmations++;
    await d.accept();
  });
  await all.click();
  await expect.poll(() => f.paid()).toBe(10);
  await expect(all).toBeEnabled();
  expect(confirmations).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("football-compact.png") });
});

for (const language of ["el", "en"]) {
  test(`online consensus ${language} stays inline before expert, keyboard accessible and dispatch-free`, async ({
    page,
  }) => {
    const f = await fixture(
      page,
      true,
      true,
      "matched",
      language,
      { home: "Arsenal", away: "Liverpool" },
      1,
      false,
      true,
    );
    await page
      .getByRole("button", {
        name: language === "en" ? /^Arsenal – Liverpool/ : /^Άρσεναλ – Λίβερπουλ/,
      })
      .click();
    const panel = page.getByRole("region", {
      name: language === "en" ? "Independent AI assessment" : "Ανεξάρτητη εκτίμηση AI",
    });
    await expect(panel).toContainText(
      language === "en" ? "Analyst agreement" : "Συμφωνία αναλυτών",
    );
    await expect(panel).toContainText("2/2");
    await expect(panel).not.toContainText("100%");
    const disclosure = panel.locator("summary").first();
    await disclosure.focus();
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("link", { name: "Offline preview 0" })).toBeVisible();
    expect(
      (await panel.getByRole("link").first().getAttribute("href"))?.startsWith("https://"),
    ).toBe(true);
    const expert = page.getByRole("heading", { name: "Έμπειρος Αναλυτής · Πειραματικό" });
    expect((await panel.boundingBox())!.y).toBeLessThan((await expert.boundingBox())!.y);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await panel.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    const a11y = await new AxeBuilder({ page })
      .include(
        'section[aria-label="' +
          (language === "en" ? "Independent AI assessment" : "Ανεξάρτητη εκτίμηση AI") +
          '"]',
      )
      .analyze();
    expect(a11y.violations).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`online-${language}.png`),
      fullPage: true,
    });
    expect(f.paid()).toBe(0);
    expect(f.reads()).toBe(0);
  });
}

test("legacy online panel never researches retrospectively", async ({ page }) => {
  const f = await fixture(page, true, true);
  await page.getByRole("button", { name: /^Άρσεναλ – Λίβερπουλ/ }).click();
  await expect(page.getByRole("region", { name: "Ανεξάρτητη εκτίμηση AI" })).toContainText(
    "Τα διαθέσιμα στοιχεία δεν επαρκούν",
  );
  expect(f.paid()).toBe(0);
  expect(f.reads()).toBe(0);
});

for (const language of ["el", "en"])
  test(`V2 literal claims ${language}, 320/390px, keyboard/axe and no history dispatch`, async ({
    page,
  }) => {
    const state = await fixture(
      page,
      true,
      true,
      "matched",
      language,
      { home: "Arsenal", away: "Liverpool" },
      1,
      false,
      true,
      true,
    );
    await page
      .getByRole("button", {
        name: language === "en" ? /^Arsenal – Liverpool/ : /^Άρσεναλ – Λίβερπουλ/,
      })
      .click();
    const panel = page.getByRole("region", {
      name: language === "en" ? "Independent AI assessment" : "Ανεξάρτητη εκτίμηση AI",
    });
    await expect(panel).toContainText(
      language === "en" ? "Independent AI assessment" : "Ανεξάρτητη εκτίμηση AI",
    );
    const summary = panel.locator("summary").first();
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("link", { name: "Synthetic V2 preview" })).toBeVisible();
    await expect(panel).toContainText("Over 2.5");
    await expect(panel).toContainText(language === "en" ? "and" : "και");
    await expect(panel).not.toContainText(/hash|offset|debug|credits|API calls|fixture_mismatch/i);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    const axe = await new AxeBuilder({ page })
      .include(
        'section[aria-label="' +
          (language === "en" ? "Independent AI assessment" : "Ανεξάρτητη εκτίμηση AI") +
          '"]',
      )
      .analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`v2-${language}.png`), fullPage: true });
    expect(state.paid()).toBe(0);
    expect(state.reads()).toBe(0);
  });

for (const mode of ["abstain", "unsupported"] as const)
  test(`independent AI card ${mode} never manufactures a joint selection`, async ({ page }) => {
    const state = await fixture(
      page,
      true,
      true,
      "matched",
      "el",
      { home: "Arsenal", away: "Liverpool" },
      1,
      false,
      true,
      true,
      mode,
    );
    await page.getByRole("button", { name: /^Άρσεναλ – Λίβερπουλ/ }).click();
    const panel = page.getByRole("region", { name: "Ανεξάρτητη εκτίμηση AI" });
    await expect(panel).toContainText("Τα διαθέσιμα στοιχεία δεν επαρκούν");
    await expect(panel).not.toContainText(/offset|hash|credits|API calls|fixture_mismatch/i);
    expect(state.paid()).toBe(0);
    expect(state.reads()).toBe(0);
  });
