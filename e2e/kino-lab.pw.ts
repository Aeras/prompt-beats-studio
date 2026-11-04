import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const user = {
  id: "bb000000-0000-4000-8000-000000000006",
  aud: "authenticated",
  role: "authenticated",
  email: "kino@example.test",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
async function fixture(page: Page, allowed = true) {
  let permitted = allowed,
    labCalls = 0;
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
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.startsWith("/auth/")
        ? user
        : path.includes("get_my_account_status")
          ? { status: "active", is_banned: false }
          : path.includes("/profiles")
            ? { handle: "kino", display_name: "Kino", profile_completed: true }
            : path.includes("/rpc/")
              ? false
              : [],
    });
  });
  await page.route("**/_serverFn/**", async (route) => {
    const name = Buffer.from(
      new URL(route.request().url()).pathname.split("/_serverFn/")[1] ?? "",
      "base64url",
    ).toString();
    let result: unknown = {};
    if (name.includes("getPrivateFootballResearchSetup")) {
      if (!permitted) return route.fulfill({ status: 403, body: "Denied" });
      result = {
        models: [],
        fixtureProviders: [],
        tavilyConfigured: false,
        liveFixturesConfigured: false,
        aiAnalysisEnabled: false,
      };
    } else if (name.includes("getPrivateKinoLabAccess")) {
      labCalls++;
      if (!permitted) return route.fulfill({ status: 403, body: "Denied" });
      result = { allowed: true, mode: "offline-exploratory" };
    } else if (name.includes("getPrivateKinoLiveSnapshot"))
      result = { last: null, active: null, fetchedAt: Date.now() };
    else if (name.includes("getPrivateFootballResearchHistory")) result = [];
    else if (name.includes("getMyModeration")) result = { role: "super_admin", status: "active" };
    await route.fulfill({ json: { result, context: {} } });
  });
  await page.goto("/private/football-research");
  return {
    revoke: () => {
      permitted = false;
    },
    calls: () => labCalls,
  };
}
const rows = Array.from({ length: 65 }, (_, i) => ({
  status: "results",
  gameId: 1100,
  drawId: i + 1,
  drawTime: 1793491200000 + (i + 1) * 300000,
  winningNumbers: { list: Array.from({ length: 20 }, (_, j) => j + 1) },
}));
async function openLab(page: Page) {
  await page.getByRole("tab", { name: "Κίνο", exact: true }).click();
  await page.getByRole("button", { name: "Εργαστήριο", exact: true }).click();
  await expect(page.getByRole("heading", { name: "KINO LAB", exact: true })).toBeVisible();
}
async function upload(page: Page, data: unknown = rows) {
  await page.getByLabel(/Αρχείο κληρώσεων JSON/).setInputFiles({
    name: "history.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.getByRole("status").filter({ hasText: /65 κληρώσεις/ })).toBeVisible();
}
test("compact Lab import, research, paired backtest, export and no paid dispatch", async ({
  page,
}) => {
  const f = await fixture(page);
  let paid = 0;
  page.on("request", (r) => {
    if (/openrouter|tavily|api\.openai|generations|runPrivateFootballResearch/.test(r.url()))
      paid++;
  });
  await openLab(page);
  expect(f.calls()).toBe(0);
  await upload(page);
  expect(f.calls()).toBe(1);
  await page.getByRole("tab", { name: "Πρόταση", exact: true }).click();
  await page.getByRole("button", { name: "Παραγωγή επιλογής" }).click();
  await expect(page.getByLabel("Πειραματικοί αριθμοί").locator("span")).toHaveCount(8);
  await page.getByRole("tab", { name: "Έλεγχος", exact: true }).click();
  await page.getByRole("button", { name: "Ιστορικός έλεγχος", exact: true }).click();
  await expect(page.locator("dd").first()).toHaveText("35");
  await page.getByRole("tab", { name: "Δεδομένα", exact: true }).click();
  await expect(page.getByLabel("Εμφανίσεις αριθμών 1–80").locator(":scope > div")).toHaveCount(80);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Εξαγωγή JSON" }).click();
  expect((await download).suggestedFilename()).toBe("kino-lab-report.json");
  expect(paid).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByText("Μεθοδολογία & προέλευση", { exact: true }).click();
  await expect(page.getByText(/P03 και live δεσμεύσεις/)).toBeVisible();
  const a = await new AxeBuilder({ page })
    .include('[aria-label="KINO Analysis Lab"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(a.violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("kino-lab.png"), fullPage: true });
});
test("role revocation prevents action and clears local result; reload starts empty", async ({
  page,
}) => {
  const f = await fixture(page);
  await openLab(page);
  await upload(page);
  await page.getByRole("tab", { name: "Πρόταση", exact: true }).click();
  f.revoke();
  await page.getByRole("button", { name: "Παραγωγή επιλογής" }).click();
  await expect(page.getByRole("alert")).toContainText("Η ενέργεια δεν ολοκληρώθηκε");
  await expect(page.getByLabel("Πειραματικοί αριθμοί").locator("span")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Η πρόσβαση δεν επιτρέπεται");
});
test("non-owner cannot open Lab", async ({ page }) => {
  await fixture(page, false);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Εργαστήριο" })).toHaveCount(0);
});
test("375px import errors stay inert and changed sample invalidates proposal", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await fixture(page);
  await openLab(page);
  await page.getByLabel(/Αρχείο κληρώσεων JSON/).setInputFiles({
    name: "untrusted.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"drawId":"<img src=x onerror=alert(1)>"}'),
  });
  await expect(
    page.getByRole("status").filter({ hasText: /0 κληρώσεις.*1 απορρίψεις/ }),
  ).toBeVisible();
  await expect(page.locator('[aria-label="KINO Analysis Lab"] img')).toHaveCount(0);
  await upload(page);
  await page.getByRole("tab", { name: "Πρόταση", exact: true }).click();
  await page.getByRole("button", { name: "Παραγωγή επιλογής" }).click();
  await expect(page.getByLabel("Πειραματικοί αριθμοί").locator("span")).toHaveCount(8);
  await page.getByRole("combobox", { name: "Κληρώσεις", exact: true }).click();
  await page.getByRole("option", { name: "10", exact: true }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByLabel("Πειραματικοί αριθμοί").locator("span")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("kino-lab-375.png"), fullPage: true });
});
test("switching away clears Lab state and dropdown uses themed keyboard picker", async ({
  page,
}) => {
  await fixture(page);
  await openLab(page);
  await upload(page);
  await page.getByRole("tab", { name: "Πρόταση", exact: true }).click();
  const method = page.getByRole("combobox", { name: "Μέθοδος", exact: true });
  await method.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "F00 · Συχνότητες" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(method).toBeFocused();
  await page.getByRole("button", { name: "Ζωντανά", exact: true }).click();
  await page.getByRole("button", { name: "Εργαστήριο", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "0 κληρώσεις" })).toBeVisible();
});
