import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function fixture(page: Page, role = "super_admin", failureBlockers: string[] = []) {
  const user = {
    id: "bb000000-0000-4000-8000-000000000006",
    aud: "authenticated",
    role: "authenticated",
    email: "beta@example.test",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  const token =
    [
      { alg: "HS256", typ: "JWT" },
      { sub: user.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 },
    ]
      .map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"))
      .join(".") + ".offline";
  await page.addInitScript(
    ({ user, token }) => {
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
      );
    },
    { user, token },
  );
  await page.route("**/*.supabase.co/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.startsWith("/auth/")
        ? user
        : path.includes("get_my_account_status")
          ? { status: "active", is_banned: false }
          : path.includes("/rpc/")
            ? false
            : path.includes("/profiles")
              ? { handle: "beta", display_name: "Beta", profile_completed: true }
              : [],
    });
  });

  let globalPolicy = { enabled: true, revision: 0, updated_at: "2026-10-25T00:00:00Z" };
  let models = Array.from({ length: 32 }, (_, i) => ({
    id: `ac100000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    adminRevision: 0,
    uninstallBlockers:
      i === 0 ? ["default:ai_generator_default_model"] : i === 1 ? failureBlockers : [],
    provider: "openai",
    providerModelId: `offline-${i + 1}`,
    displayName: `Offline model ${i + 1}`,
    status: "enabled",
    accessPolicy: "all_users",
    generatorCompatible: true,
    generatorEnabled: true,
    qualityCheckCompatible: true,
    qualityCheckEnabled: true,
    generatorReasoningEffort: null,
    qualityCheckReasoningEffort: null,
    inputPricePerMillion: 1,
    outputPricePerMillion: 4,
    cachedInputPricePerMillion: null,
    cacheWritePricePerMillion: null,
    pricingCurrency: "USD",
    pricingStatus: "verified",
    healthStatus: "unknown",
    notes: null,
    preview: false,
    deprecated: false,
    retirementDate: null,
    pricingUpdatedAt: null,
    discoveredAt: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastErrorCode: null,
  }));
  const writes: { id: string; expectedRevision: number; patch: Record<string, unknown> }[] = [];
  let fail = false;
  let deletes = 0;
  function decode(node: { t?: number; s?: unknown; p?: { k?: string[]; v?: unknown[] } }): unknown {
    if (node.p?.k)
      return Object.fromEntries(
        node.p.k.map((key, i) => [key, decode(node.p!.v![i] as Parameters<typeof decode>[0])]),
      );
    if (node.t === 2) return node.s === 2;
    return node.s;
  }
  await page.route("**/_serverFn/**", async (route) => {
    const name = Buffer.from(
      new URL(route.request().url()).pathname.split("/_serverFn/")[1] ?? "",
      "base64url",
    ).toString();
    let result: unknown = {};
    if (name.includes("getMyModeration"))
      result = {
        role,
        status: "active",
        can_view_users: true,
        can_manage_roles: true,
        can_access_admin_settings: true,
      };
    else if (name.includes("getAdminOverview"))
      result = {
        totalUsers: 0,
        blockedUsers: 0,
        songsGenerated: 0,
        aiRequests: 0,
        failedRequests: 0,
        estimatedCostUsd: 0,
        recentUsers: [],
      };
    else if (name.includes("getAdminGlobalAiUsage")) result = globalPolicy;
    else if (name.includes("setAdminGlobalAiUsage")) {
      if (fail) {
        fail = false;
        await route.fulfill({ status: 500, body: "synthetic-sensitive-error" });
        return;
      }
      const input = decode(route.request().postDataJSON().t.p.v[0]) as {
        enabled: boolean;
        expectedRevision: number;
      };
      expect(input.expectedRevision).toBe(globalPolicy.revision);
      globalPolicy = {
        ...globalPolicy,
        enabled: input.enabled,
        revision: globalPolicy.revision + 1,
      };
      result = globalPolicy;
    } else if (name.includes("getAdminAiModels"))
      result = {
        models,
        generatorDefault: "offline-1",
        qualityDefault: "offline-1",
        aiToolsDefault: "offline-1",
        legacyDefault: null,
      };
    else if (name.includes("verifyInstalledAiModelCompatibility"))
      result = {
        id: "offline-2",
        name: "Offline model 2",
        status: "inconclusive",
        generatorCompatible: false,
        qualityCheckCompatible: false,
        generatorError: "Invalid structured JSON response: empty model output.",
        qualityCheckError: "Invalid structured JSON response: empty model output.",
        contextWindow: null,
        installed: false,
      };
    else if (name.includes("getDetectedAiProviders")) result = { providers: [] };
    else if (name.includes("getMusicAnalyzerAdminModels"))
      result = { models: [], defaultModel: null };
    else if (name.includes("patchAdminAiModel")) {
      const body = route.request().postDataJSON();
      const input = decode(body.t.p.v[0]) as {
        id: string;
        expectedRevision: number;
        patch: Record<string, unknown>;
      };
      writes.push(input);
      if (fail) {
        fail = false;
        await route.fulfill({ status: 500, body: "synthetic-sensitive-error" });
        return;
      }
      const model = models.find((m) => m.id === input.id)!;
      expect(input.expectedRevision).toBe(model.adminRevision);
      Object.assign(model, input.patch, { adminRevision: model.adminRevision + 1 });
      result = { ok: true, model };
    } else if (name.includes("uninstallAdminAiModels")) {
      deletes++;
      if (fail) {
        fail = false;
        await route.fulfill({ status: 500, body: "synthetic-sensitive-error" });
        return;
      }
      // These interaction tests select precisely rows 2/3; DB tests verify actual payload and atomicity.
      const removed = models.filter(
        (m) => m.providerModelId === "offline-2" || m.providerModelId === "offline-3",
      );
      models = models.filter((m) => !removed.includes(m));
      result = {
        removed: removed.map((m) => ({
          id: m.id,
          name: m.displayName,
          model: m.providerModelId,
          provider: m.provider,
        })),
      };
    } else if (name.includes("getMyFeatureAccess")) result = { allowed: true };
    else if (name.includes("getHomeResume")) result = { items: [], failedSources: [] };
    else if (name.includes("list") || name.includes("search"))
      result = { users: [], items: [], tracks: [], total: 0 };
    await route.fulfill({ json: { result, context: {} } });
  });
  await page.goto("/management");
  await page.getByRole("button", { name: /^(AI Models|Μοντέλα AI)$/ }).click();
  await expect(page.getByRole("table").getByText("Offline model 2", { exact: true })).toBeVisible();
  return {
    writes,
    failNext: () => {
      fail = true;
    },
    deletes: () => deletes,
  };
}

test("inline independent saves serialize revisions; dark custom menus and rollback", async ({
  page,
}) => {
  const f = await fixture(page);
  const row = page.locator('[data-model-id$="000000000002"]');
  await row.getByRole("switch", { name: "Generator: Offline model 2", exact: true }).click();
  await row.getByRole("switch", { name: "Quality Check: Offline model 2", exact: true }).click();
  await expect.poll(() => f.writes.length).toBe(2);
  expect(f.writes.map((w) => w.expectedRevision)).toEqual([0, 1]);
  expect(Object.keys(f.writes[0]!.patch)).toEqual(["generatorEnabled"]);
  await expect(row.getByRole("switch").first()).toHaveAttribute("aria-checked", "false");
  await expect(row.getByRole("switch").nth(1)).toHaveAttribute("aria-checked", "false");
  await row.getByRole("button", { name: /^(Status|Κατάσταση):/ }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  expect(
    (await row
      .getByRole("button", { name: /^(Status|Κατάσταση):/, includeHidden: true })
      .boundingBox())!.height,
  ).toBeLessThan(44);
  const menuBox = (await menu.boundingBox())!;
  expect(menuBox.y).toBeGreaterThanOrEqual(0);
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await menu.evaluate((e) => e.scrollHeight - e.clientHeight)).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: test.info().outputPath(`dropdown-${test.info().project.name}.png`),
  });
  expect(await menu.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(33, 21, 47)");
  await page.getByRole("menuitem", { name: /^(Testing|Δοκιμή|Δοκιμαστικό)$/ }).click();
  await expect.poll(() => f.writes.length).toBe(3);
  f.failNext();
  await row.getByRole("button", { name: /^(Access|Πρόσβαση):/ }).click();
  await page.getByRole("menuitem", { name: /Admin only|Μόνο/ }).click();
  await expect(row.getByRole("button", { name: /^(Access|Πρόσβαση):/ })).toContainText(
    /All users|Όλοι/,
  );
  expect(await row.locator("select").count()).toBe(0);
  await expect(page.getByText("synthetic-sensitive-error")).toHaveCount(0);
});

test("bulk confirmation is above rows, keeps selection on cancel and deletes atomically", async ({
  page,
}) => {
  const f = await fixture(page);
  const trash = page.getByRole("button", { name: /^(Uninstall models|Απεγκατάσταση μοντέλων)$/ });
  await trash.click();
  await page.getByRole("checkbox", { name: /^(Select|Επιλογή) Offline model 2$/ }).check();
  await page.getByRole("checkbox", { name: /^(Select|Επιλογή) Offline model 3$/ }).check();
  await page.locator("[data-model-id]").last().scrollIntoViewIfNeeded();
  await expect(trash).toBeInViewport();
  await trash.click();
  const panel = page.getByRole("alertdialog");
  await expect(panel).toBeVisible();
  const toolbarBox = (await page.getByTestId("models-sticky-toolbar").boundingBox())!;
  expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(
    toolbarBox.y + toolbarBox.height - 1,
  );
  await expect(panel.getByRole("button", { name: /^(Cancel|Ακύρωση)$/ })).toBeInViewport();
  await expect(panel.getByRole("button", { name: /^(Cancel|Ακύρωση)$/ })).toBeFocused();
  expect(await panel.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(54, 19, 34)");
  await page.screenshot({
    path: test.info().outputPath(`confirmation-${test.info().project.name}.png`),
  });
  expect((await panel.boundingBox())!.y).toBeLessThan(
    (await page.locator("[data-model-id]").first().boundingBox())!.y,
  );
  await panel.getByRole("button", { name: /^(Cancel|Ακύρωση)$/ }).click();
  await expect(
    page.getByRole("checkbox", { name: /^(Select|Επιλογή) Offline model 2$/ }),
  ).toBeChecked();
  await trash.click();
  f.failNext();
  await panel.getByRole("button", { name: /^(Delete|Διαγραφή)$/ }).click();
  await expect.poll(() => f.deletes()).toBe(1);
  await expect(page.getByRole("table").getByText("Offline model 2", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: /^(Delete|Διαγραφή)$/ }).click();
  await expect(page.getByRole("table").getByText("Offline model 2", { exact: true })).toHaveCount(
    0,
  );
  await expect(trash).toBeFocused();
});

test("sticky headers share page scroll, align horizontally and remain accessible", async ({
  page,
}, testInfo) => {
  await fixture(page);
  const header = page.getByTestId("models-sticky-header");
  await header.scrollIntoViewIfNeeded();
  await header.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY + 300));
  await expect
    .poll(async () =>
      Math.abs(
        (await header.boundingBox())!.y -
          (await page.locator("header").boundingBox())!.height -
          (await page.getByTestId("models-sticky-toolbar").boundingBox())!.height,
      ),
    )
    .toBeLessThan(2);
  await expect
    .poll(async () =>
      Math.abs(
        (await page.getByTestId("models-sticky-toolbar").boundingBox())!.y -
          (await page.locator("header").boundingBox())!.height,
      ),
    )
    .toBeLessThan(2);
  const scroll = page.getByTestId("models-horizontal-scroll");
  expect(await scroll.evaluate((e) => e.scrollHeight - e.clientHeight)).toBeLessThanOrEqual(1);
  await scroll.evaluate((e) => {
    e.scrollLeft = 240;
  });
  await expect
    .poll(() => header.getByRole("row").evaluate((e) => getComputedStyle(e).transform))
    .not.toBe("none");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath(`horizontal-${testInfo.project.name}.png`) });
  await scroll.evaluate((e) => {
    e.scrollLeft = 0;
  });
  const axe = await new AxeBuilder({ page })
    .include('section[aria-label="Installed models"],section[aria-label="Εγκατεστημένα μοντέλα"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual(
    [],
  );
  await page.screenshot({ path: testInfo.outputPath(`models-${testInfo.project.name}.png`) });
  const table = page.getByRole("table");
  // Extend the fixture page beyond the table to exercise its bottom sticky bound.
  await page.evaluate(() => {
    const tail = document.createElement("div");
    tail.style.height = "100vh";
    document.body.append(tail);
  });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect((await table.boundingBox())!.y + (await table.boundingBox())!.height).toBeLessThan(
    (await page.locator("header").boundingBox())!.height + 100,
  );
});

test("defaults stay guarded; keyboard menus preserve selected-user workflow", async ({ page }) => {
  const f = await fixture(page);
  await expect(
    page.getByRole("switch", { name: "Generator: Offline model 1", exact: true }),
  ).toBeDisabled();
  const row = page.locator('[data-model-id$="000000000002"]');
  await row.getByRole("button", { name: /^(Access|Πρόσβαση):/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: /Selected users|Επιλεγμένοι/ }).click();
  await expect.poll(() => f.writes.length).toBe(1);
  await expect(
    row.getByRole("button", { name: /Manage user access|Δικαιώματα χρηστών/ }),
  ).toHaveCount(0);
  await expect(row.getByRole("button", { name: /^(Access|Πρόσβαση):/ })).toContainText(
    /Selected users|Επιλεγμένοι/,
  );
  expect(f.writes[0]!.patch).toEqual({ accessPolicy: "selected_users" });
});

test("only active defaults block the concise uninstall confirmation", async ({ page }) => {
  await fixture(page);
  const trash = page.getByRole("button", { name: /^(Uninstall models|Απεγκατάσταση μοντέλων)$/ });
  await trash.click();
  await page.getByRole("checkbox", { name: /^(Select|Επιλογή) Offline model 1$/ }).check();
  await trash.click();
  const panel = page.getByRole("alertdialog");
  await expect(panel.getByRole("button", { name: /^(Delete|Διαγραφή)$/ })).toBeDisabled();
  await expect(panel).toContainText(/Active default|Ενεργή προεπιλογή/);
  await page.getByRole("button", { name: /^(Cancel selection|Ακύρωση επιλογής)$/ }).click();
  await trash.click();
  await page.getByRole("checkbox", { name: /^(Select|Επιλογή) Offline model 2$/ }).check();
  await trash.click();
  await expect(panel.getByRole("button", { name: /^(Delete|Διαγραφή)$/ })).toBeEnabled();
  await expect(panel).not.toContainText(/Reassign user access|Legacy shared fallback/);
});

test("global AI switch saves server state and recovers failed save", async ({ page }) => {
  const f = await fixture(page);
  const toggle = page.getByRole("switch", { name: /AI usage in the app/ });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  f.failNext();
  await toggle.click();
  await expect(page.getByText(/AI setting not saved/)).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect((await toggle.boundingBox())!.y).toBeLessThan(
    (await page.getByRole("table").boundingBox())!.y,
  );
  await page.screenshot({
    path: `test-results/global-ai-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("uninstall explains active work, result recovery and final accounting separately", async ({
  page,
}) => {
  await fixture(page, "super_admin", ["active_jobs", "recovery_pending", "accounting_pending"]);
  const trash = page.getByRole("button", { name: /^(Uninstall models|Απεγκατάσταση μοντέλων)$/ });
  await trash.click();
  await page.getByRole("checkbox", { name: /^(Select|Επιλογή) Offline model 2$/ }).check();
  await trash.click();
  const panel = page.getByRole("alertdialog");
  await expect(panel).toContainText("Active or queued jobs");
  await expect(panel).toContainText("Stored response awaiting validation/recovery");
  await expect(panel).toContainText("Final usage reconciliation pending");
  await expect(panel.getByRole("button", { name: /^(Delete|Διαγραφή)$/ })).toBeDisabled();
});

test("admin defaults keep the entire page within portrait viewport with long model labels", async ({
  page,
}) => {
  await fixture(page);
  // Long native option text previously forced intrinsic minimum widths beyond the viewport.
  await page.locator('[data-testid="ai-model-defaults"] select').evaluateAll((selects) => {
    for (const select of selects) {
      const option = document.createElement("option");
      option.value = "__layout_probe__";
      option.textContent =
        "Extremely long provider model name with unavailable-operation explanation that must not resize the Admin page";
      select.appendChild(option);
    }
  });
  for (const width of [320, 360, 390, 412, 600, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(1);
    const defaults = page.locator('[data-testid="ai-model-defaults"]');
    await expect(defaults).toBeVisible();
    for (const select of await defaults.locator("select").all()) {
      const rect = await select.boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 1);
    }
  }
  const scroll = page.getByTestId("models-horizontal-scroll");
  expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});

test("inconclusive verification never displays historical compatibility as current success", async ({
  page,
}) => {
  const f = await fixture(page);
  const row = page.locator('[data-model-id$="000000000002"]');
  await row.getByRole("button", { name: /Edit|Επεξεργασία/ }).click();
  await page.getByRole("button", { name: /^(Verify|Επαλήθευση)$/ }).click();
  await expect(
    page.getByText(/Generator: (Not verified|Δεν επαληθεύτηκε)/, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Quality Check: (Not verified|Δεν επαληθεύτηκε)/, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/^(Generator|Quality Check): (Verified|Επαληθεύτηκε)$/)).toHaveCount(
    0,
  );
  expect(f.writes).toHaveLength(0);
});
