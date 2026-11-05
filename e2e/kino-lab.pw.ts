import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { makePolar55Fixture } from "../src/lib/__fixtures__/kino-polar55-analysis";
import { KINO_HISTORY_WINDOWS, formatKinoCount } from "../src/lib/kino-lab.presentation";

type WireNode = { t?: number; s?: unknown; p?: { k?: string[]; v?: WireNode[] } };
function decode(node: WireNode): unknown {
  if (node.p?.k) return Object.fromEntries(node.p.k.map((key, i) => [key, decode(node.p!.v![i]!)]));
  if (node.t === 2) return node.s === 2;
  return node.s;
}

const user = {
  id: "bb000000-0000-4000-8000-000000000006",
  aud: "authenticated",
  role: "authenticated",
  email: "kino@example.test",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
async function fixture(page: Page, allowed = true, polar: unknown = { status: "not_configured" }) {
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
    } else if (name.includes("queryPrivateKinoPolar55")) {
      labCalls++;
      if (!permitted) return route.fulfill({ status: 403, body: "Denied" });
      result = polar;
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
  await expect(page.getByLabel("Πειραματικοί αριθμοί").locator("span")).toHaveCount(5);
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
  await expect(page.getByLabel("Πειραματικοί αριθμοί").locator("span")).toHaveCount(5);
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

test("Polar55 is explicit, default-off, bounded and keeps JSON/Live independent", async ({
  page,
}) => {
  const f = await fixture(page);
  await openLab(page);
  const source = page.getByRole("combobox", { name: "Πηγή δεδομένων", exact: true });
  await source.click();
  await page.getByRole("option", { name: "Polar55", exact: true }).click();
  expect(f.calls()).toBe(0);
  const n = page.getByRole("combobox", { name: "Κληρώσεις", exact: true });
  await n.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "100.000", exact: true })).toBeVisible();
  await page.getByRole("option", { name: "100.000", exact: true }).click();
  await page.getByRole("button", { name: "Ανάλυση", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("δεν έχει ενεργοποιηθεί");
  expect(f.calls()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const a = await new AxeBuilder({ page })
    .include('[aria-label="Εργαστήριο Polar55"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(a.violations).toEqual([]);
  await source.click();
  await page.getByRole("option", { name: "Εισαγωγή JSON", exact: true }).click();
  await expect(page.getByRole("button", { name: "Εισαγωγή JSON", exact: true })).toBeVisible();
});

test("Polar55 revoked access clears results; small stored history is honestly partial", async ({
  page,
}) => {
  const analysis = makePolar55Fixture();
  const f = await fixture(page, true, { status: "ok", analysis });
  await openLab(page);
  await page.getByRole("combobox", { name: "Πηγή δεδομένων", exact: true }).click();
  await page.getByRole("option", { name: "Polar55", exact: true }).click();
  await page.getByRole("button", { name: "Ανάλυση", exact: true }).click();
  await expect(page.getByText(/Αναλύθηκαν 11 έγκυρες.*Μερικό δείγμα/)).toBeVisible();
  await expect(page.getByLabel("Συχνότητες Polar55").locator(":scope > div")).toHaveCount(80);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("kino-polar55-partial.png"),
    fullPage: true,
  });
  f.revoke();
  await page.getByRole("button", { name: "Εξαγωγή ανάλυσης", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Δεν επιβεβαιώθηκε η πρόσβαση");
  await expect(page.getByLabel("Συχνότητες Polar55")).toHaveCount(0);
});

test("cancelled Polar55 reads cannot restore stale data or trigger source requests", async ({
  page,
}) => {
  await fixture(page);
  await openLab(page);
  await page.getByRole("combobox", { name: "Πηγή δεδομένων", exact: true }).click();
  await page.getByRole("option", { name: "Polar55", exact: true }).click();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  let direct = 0;
  page.on("request", (r) => {
    if (/kino-api\.promptbeats|api\.opap/.test(r.url())) direct++;
  });
  await page.route("**/_serverFn/**", async (route) => {
    const name = Buffer.from(
      new URL(route.request().url()).pathname.split("/_serverFn/")[1] ?? "",
      "base64url",
    ).toString();
    if (!name.includes("queryPrivateKinoPolar55")) return route.fallback();
    requested();
    await held;
    await route
      .fulfill({ json: { result: { status: "unavailable" }, context: {} } })
      .catch(() => undefined);
  });
  await page.getByRole("button", { name: "Ανάλυση", exact: true }).click();
  await started;
  await page.getByRole("button", { name: "Ακύρωση αναμονής", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Η αναμονή ακυρώθηκε");
  await expect(page.getByRole("button", { name: "Ανάλυση", exact: true })).toBeEnabled();
  release();
  await expect(page.getByLabel("Συχνότητες Polar55")).toHaveCount(0);
  expect(direct).toBe(0);
});

test("cancelled export preserves the snapshot and successful export only rechecks auth", async ({
  page,
}) => {
  await fixture(page, true, { status: "ok", analysis: makePolar55Fixture() });
  let hold = true,
    reads = 0,
    release!: () => void,
    started!: () => void;
  const blocked = new Promise<void>((resolve) => {
      release = resolve;
    }),
    requested = new Promise<void>((resolve) => {
      started = resolve;
    });
  await page.route("**/_serverFn/**", async (route) => {
    const name = Buffer.from(
      new URL(route.request().url()).pathname.split("/_serverFn/")[1] ?? "",
      "base64url",
    ).toString();
    if (name.includes("queryPrivateKinoPolar55")) reads++;
    if (!name.includes("getPrivateKinoLabAccess") || !hold) return route.fallback();
    started();
    await blocked;
    await route
      .fulfill({ json: { result: { allowed: true, mode: "offline-exploratory" }, context: {} } })
      .catch(() => undefined);
  });
  await openLab(page);
  await page.getByRole("combobox", { name: "Πηγή δεδομένων", exact: true }).click();
  await page.getByRole("option", { name: "Polar55", exact: true }).click();
  await page.getByRole("button", { name: "Ανάλυση", exact: true }).click();
  await expect(page.getByLabel("Συχνότητες Polar55")).toBeVisible();
  await page.getByRole("button", { name: "Εξαγωγή ανάλυσης", exact: true }).click();
  await requested;
  await page.getByRole("button", { name: "Ακύρωση αναμονής", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Η εξαγωγή ακυρώθηκε");
  await expect(page.getByLabel("Συχνότητες Polar55").locator(":scope > div")).toHaveCount(80);
  hold = false;
  release();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Εξαγωγή ανάλυσης", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("kino-polar55-analysis.json");
  expect(reads).toBe(1);
});

test("all history windows reach analysis unchanged, refresh counts and preserve partial selections", async ({
  page,
}) => {
  await fixture(page);
  const received: Array<{ n: number; k: number; method: string }> = [];
  await page.route("**/_serverFn/**", async (route) => {
    const name = Buffer.from(
      new URL(route.request().url()).pathname.split("/_serverFn/")[1] ?? "",
      "base64url",
    ).toString();
    if (!name.includes("queryPrivateKinoPolar55")) return route.fallback();
    const body = route.request().postDataJSON();
    const input = (body.t ? (decode(body.t) as { data: unknown }).data : body.data) as {
      n: number;
      k: number;
      method: "P00" | "F00" | "P01";
    };
    received.push(input);
    const analysis = makePolar55Fixture(Math.min(input.n, 50208), input.k, input.n);
    analysis.options.method = input.method;
    await route.fulfill({ json: { result: { status: "ok", analysis }, context: {} } });
  });
  await openLab(page);
  await page.getByRole("combobox", { name: "Πηγή δεδομένων", exact: true }).click();
  await page.getByRole("option", { name: "Polar55", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Αριθμοί", exact: true })).toHaveText("5");
  const window = page.getByRole("combobox", { name: "Κληρώσεις", exact: true });
  for (const n of KINO_HISTORY_WINDOWS) {
    await window.click();
    await expect(page.getByRole("option")).toHaveCount(12);
    await page.getByRole("option", { name: formatKinoCount(n), exact: true }).click();
    await expect(page.getByLabel("Συχνότητες Polar55")).toHaveCount(0);
    await page.getByRole("button", { name: "Ανάλυση", exact: true }).click();
    await expect(
      page.getByText(`Αναλύθηκαν ${formatKinoCount(Math.min(n, 50208))} έγκυρες`, { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Συχνότητες Polar55").locator(":scope > div").first().locator("span"),
    ).toHaveText(formatKinoCount(Math.min(n, 50208)));
  }
  expect(received.map((r) => r.n)).toEqual([...KINO_HISTORY_WINDOWS]);
  expect(received.every((r) => r.k === 5)).toBe(true);
  await expect(window).toHaveText("100.000");
  await expect(page.getByText(/Μερικό δείγμα/)).toBeVisible();
});

test("heatmap stays 10 by 8 and aligned at 320px, landscape, tablet and desktop", async ({
  page,
}) => {
  await fixture(page, true, { status: "ok", analysis: makePolar55Fixture(100000, 5, 100000) });
  await openLab(page);
  await page.getByRole("combobox", { name: "Πηγή δεδομένων", exact: true }).click();
  await page.getByRole("option", { name: "Polar55", exact: true }).click();
  await page.getByRole("combobox", { name: "Κληρώσεις", exact: true }).click();
  await page.getByRole("option", { name: "100.000", exact: true }).click();
  await page.getByRole("button", { name: "Ανάλυση", exact: true }).click();
  const grid = page.getByLabel("Συχνότητες Polar55");
  await expect(grid.locator(":scope > div")).toHaveCount(80);
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 667, height: 375 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        grid.evaluate((element) => {
          const cells = Array.from(element.children) as HTMLElement[];
          return {
            columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
            rows: new Set(cells.map((c) => c.offsetTop)).size,
            fits: cells.every((c) => c.scrollWidth <= c.clientWidth),
            equal: new Set(cells.map((c) => Math.round(c.getBoundingClientRect().width))).size <= 2,
          };
        }),
      )
      .toEqual({ columns: 10, rows: 8, fits: true, equal: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const boxes = await Promise.all(
      ["Κληρώσεις", "Αριθμοί", "Μέθοδος"].map((name) =>
        page.getByRole("combobox", { name, exact: true }).boundingBox(),
      ),
    );
    expect(new Set(boxes.map((b) => b?.y)).size).toBe(1);
    expect(boxes.every((b) => b?.height === 44)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`heatmap-${viewport.width}.png`),
      fullPage: true,
    });
  }
  const audit = await new AxeBuilder({ page })
    .include('[aria-label="Εργαστήριο Polar55"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});

test("all twelve pick sizes and three methods produce the chosen offline selection", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await fixture(page);
  await openLab(page);
  await upload(page);
  await page.getByRole("tab", { name: "Πρόταση", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Αριθμοί", exact: true })).toHaveText("5");
  for (const method of ["P00 · Τυχαία", "F00 · Συχνότητες", "P01 · Πρόσφατες"]) {
    await page.getByRole("combobox", { name: "Μέθοδος", exact: true }).click();
    await page.getByRole("option", { name: method, exact: true }).click();
    for (let k = 1; k <= 12; k++) {
      await page.getByRole("combobox", { name: "Αριθμοί", exact: true }).click();
      await expect(page.getByRole("option")).toHaveCount(12);
      await page.getByRole("option", { name: String(k), exact: true }).click();
      await page.getByRole("button", { name: "Παραγωγή επιλογής", exact: true }).click();
      await expect(page.getByLabel("Πειραματικοί αριθμοί").locator("span")).toHaveCount(k);
    }
  }
});

test("real imported counts map to all four heatmap levels and refresh with the selected window", async ({
  page,
}) => {
  await fixture(page);
  await openLab(page);
  const observations = rows.slice(0, 5).map((row, i) => ({
    ...row,
    winningNumbers: { list: Array.from({ length: 20 }, (_, j) => i * 5 + j + 1) },
  }));
  await page.getByLabel(/Αρχείο κληρώσεων JSON/).setInputFiles({
    name: "five-observations.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(observations)),
  });
  await expect(page.getByRole("status")).toContainText("5 κληρώσεις");
  await page.getByRole("tab", { name: "Δεδομένα", exact: true }).click();
  const cells = page.getByLabel("Εμφανίσεις αριθμών 1–80").locator(":scope > div");
  await expect(cells.locator("strong")).toHaveText(
    Array.from({ length: 80 }, (_, i) => String(i + 1)),
  );
  const expected = Array.from(
    { length: 80 },
    (_, i) => observations.filter((r) => r.winningNumbers.list.includes(i + 1)).length,
  );
  await expect(cells.locator("span")).toHaveText(expected.map(String));
  const levels = await cells.evaluateAll((elements) =>
    elements.map((el) => el.getAttribute("data-intensity")),
  );
  expect([...new Set(levels)].sort()).toEqual(["0", "1", "2", "3"]);
  expect(levels).toEqual(expected.map((c) => String(Math.min(3, c))));
  const palettes = ["bg-red-700", "bg-orange-400", "bg-green-200", "bg-green-500"];
  for (const [level, palette] of palettes.entries()) {
    const classes = await cells.evaluateAll(
      (elements, target) =>
        elements
          .filter((el) => el.getAttribute("data-intensity") === String(target))
          .map((el) => el.className),
      level,
    );
    expect(classes.length).toBeGreaterThan(0);
    expect(classes.every((value) => value.split(" ").includes(palette))).toBe(true);
  }
  const audit = await new AxeBuilder({ page })
    .include('[aria-label="KINO Analysis Lab"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("kino-frequency-four-colors.png"),
    fullPage: true,
  });
  await page.getByRole("combobox", { name: "Κληρώσεις", exact: true }).click();
  await page.getByRole("option", { name: "5", exact: true }).click();
  await expect(page.getByRole("status")).not.toContainText("Μερικό δείγμα");
  await expect(cells.locator("span")).toHaveText(expected.map(String));
  await page.getByRole("combobox", { name: "Κληρώσεις", exact: true }).click();
  await page.getByRole("option", { name: "100.000", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Ζητήθηκαν 100.000");
  await expect(page.getByRole("status")).toContainText("Μερικό δείγμα");
  await expect(cells.locator("span")).toHaveText(expected.map(String));
});
