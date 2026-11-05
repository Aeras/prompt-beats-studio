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
async function fixture(page: Page, authorized = true, history = false) {
  const token =
    [
      { alg: "HS256", typ: "JWT" },
      { sub: user.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 },
    ]
      .map((x) => Buffer.from(JSON.stringify(x)).toString("base64url"))
      .join(".") + ".offline";
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
  const kickoffUtc = new Date(Date.now() + 86400000).toISOString();
  const side = {
    id: "10",
    name: "Home United",
    standing: null,
    recentResults: [
      {
        id: "1",
        kickoffUtc: "2026-10-01T12:00:00Z",
        opponent: "Away City",
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
  const snapshot: FootballProviderEvidence = {
    version: 1,
    collectedAtUtc: new Date().toISOString(),
    fixture: { leagueId: "EN-PL", homeTeam: "Home United", awayTeam: "Away City", kickoffUtc },
    conflicts: ["Διαφωνία δύο πηγών: τα σκορ διατηρούνται χωριστά."],
    providers: FOOTBALL_EVIDENCE_PROVIDERS.map((provider) => ({
      provider,
      status: provider === "football-data" ? "rate_limited" : "ok",
      fixtureId: "999",
      home: side,
      away: { ...side, id: "20", name: "Away City" },
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
      return route.abort();
    }
    if (name.includes("getPrivateFootballResearchSetup")) {
      if (!authorized) return route.fulfill({ status: 403, body: "Denied" });
      result = {
        provider: "openrouter",
        models: [],
        fixtureProviders: [
          { id: "espn", label: "ESPN", configured: true },
          { id: "api-football", label: "API-Football", configured: true },
          { id: "football-data", label: "football-data.org", configured: true },
        ],
        evidenceProviders: FOOTBALL_EVIDENCE_PROVIDERS.map((id) => ({ id, configured: true })),
        tavilyConfigured: true,
        liveFixturesConfigured: true,
        aiAnalysisEnabled: false,
      };
    } else if (name.includes("getPrivateFootballWeek")) {
      const request = decodeURIComponent(route.request().url());
      seenProviders.push(request);
      result = {
        status: "ok",
        fixtures: [
          {
            source: "espn",
            sourceFixtureId: "999",
            leagueId: "EN-PL",
            homeTeam: "Home United",
            awayTeam: "Away City",
            kickoffUtc,
            state: "scheduled",
            fetchedAtUtc: new Date().toISOString(),
          },
        ],
      };
    } else if (name.includes("getPrivateFootballProviderEvidence")) {
      reads++;
      result = snapshot;
    } else if (name.includes("getPrivateFootballResearchHistory"))
      result = history
        ? [
            {
              id: "offline-run",
              source: "espn",
              fixture_id: 999,
              league_id: "EN-PL",
              home_team: "Home United",
              away_team: "Away City",
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
              },
              sources: [],
              usage: null,
              outcomes: [],
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
  await expect(page.getByRole("region", { name: "Συνδέσεις πηγών ανάλυσης" })).toContainText(
    "PitchAPI",
  );
  const button = page.getByRole("button", { name: "Στοιχεία παρόχων Home United – Away City" });
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
  expect(f.reads()).toBe(1);
  expect(f.paid()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page })
    .include('[aria-label="Στοιχεία όλων των παρόχων"]')
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
      const row = page.getByRole("region", { name: "Αγώνες εβδομάδας" }).locator("li").first();
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
  await page.getByRole("button", { name: "Στοιχεία παρόχων Home United – Away City" }).click();
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
  const card = page.getByRole("button", { name: /^Home United – Away City/ });
  await card.click();
  await expect(page.getByRole("region", { name: "Στοιχεία όλων των παρόχων" })).toContainText(
    "PitchAPI",
  );
  await card.click();
  await card.click();
  expect(f.reads()).toBe(0);
  expect(f.paid()).toBe(0);
});
