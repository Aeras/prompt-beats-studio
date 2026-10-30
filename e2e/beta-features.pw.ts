import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";

async function fixture(page: Page, role = "super_admin", registryUI = false) {
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
  let stage = "beta";
  let revision = 0;
  let promoted = false;
  let loads = 0;
  let tester = false;
  let failTransition = false;
  const calls: string[] = [];
  const catalog = [
    {
      id: "af550000-0000-4000-8000-000000000001",
      label: "Original default",
      family: "legacy",
      builtin_version: "v1",
      digest: "a".repeat(64),
      status: "experimental",
      created_at: "2026-10-30T00:00:00Z",
      ever_used: true,
      is_default: true,
    },
    {
      id: "af550000-0000-4000-8000-000000000002",
      label: "Candidate V5 BETA 2",
      family: "master_v1",
      builtin_version: null,
      digest: "b".repeat(64),
      status: "experimental",
      created_at: "2026-10-30T00:00:00Z",
      ever_used: false,
      is_default: false,
    },
  ];
  await page.route("**/_serverFn/**", async (route) => {
    const name = Buffer.from(
      new URL(route.request().url()).pathname.split("/_serverFn/")[1] ?? "",
      "base64url",
    ).toString();
    calls.push(name);
    const feature = () => ({
      feature_key: "new_studio",
      display_name: "New studio fixture",
      description: "Browser-only fixture",
      stage,
      revision,
      registered_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      updated_by: user.id,
    });
    let result: unknown = {};
    if (name.includes("listGeneratorPrompts")) {
      await route.fulfill({ json: { result: catalog, context: {} } });
      return;
    }
    if (name.includes("readGeneratorPrompt")) {
      await route.fulfill({
        json: {
          result: { label: "Candidate", content: "Offline safe <script> marker" },
          context: {},
        },
      });
      return;
    }
    if (name.includes("mutateGeneratorPrompt")) {
      const body = route.request().postDataJSON();
      const fields = body.t.p.v[0].p;
      const value = (key: string) => fields.v[fields.k.indexOf(key)]?.s;
      const item = catalog.find((p) => p.id === value("id"))!;
      if (value("action") === "default") for (const p of catalog) p.is_default = p.id === item.id;
      else if (value("action") === "archive") item.status = "archived";
      else if (value("action") === "restore") item.status = "experimental";
      await route.fulfill({ json: { result: null, context: {} } });
      return;
    }
    if (name.includes("importGeneratorPrompt")) {
      await route.fulfill({
        json: { result: "af550000-0000-4000-8000-000000000003", context: {} },
      });
      return;
    }
    if (registryUI && name.includes("listFeatureAccessPolicies")) {
      await route.fulfill({
        json: {
          result: [
            {
              feature_key: "ai_generator",
              display_name: "AI Generator",
              description: "Fixture",
              access_mode: "everyone",
              selected_count: 0,
            },
          ],
          context: {},
        },
      });
      return;
    }
    if (name.includes("getMyModeration"))
      result = {
        role,
        status: "active",
        can_view_users: role !== "user",
        can_manage_roles: role === "super_admin",
        can_access_admin_settings: true,
      };
    else if (name.includes("listBetaFeatures")) {
      loads++;
      result = { features: promoted ? [] : [feature()], events: [] };
    } else if (name.includes("transitionBetaFeature")) {
      if (failTransition) {
        failTransition = false;
        await route.fulfill({ status: 500, body: "synthetic-private-token" });
        return;
      }
      // TanStack transports inputs as Seroval objects, not plain JSON fields.
      const body: { t: { p: { v: { p: { k: string[]; v: { s: unknown }[] } }[] } } } = route
        .request()
        .postDataJSON();
      const data = body.t.p.v[0]!.p;
      const action = data.v[data.k.indexOf("action")]?.s;
      expect(data.v[data.k.indexOf("expectedRevision")]?.s).toBe(revision);
      if (action === "stable") stage = "stable";
      else if (action === "archive") stage = "archived";
      else if (action === "restore") stage = "stable";
      else if (action === "promote") {
        stage = "feature_access";
        promoted = true;
      }
      revision++;
      result = feature();
    } else if (name.includes("listFeatureAccessPolicies"))
      result = promoted
        ? [
            {
              feature_key: "new_studio",
              display_name: "New studio fixture",
              description: "",
              access_mode: "everyone",
              selected_count: 0,
              updated_at: "2026-01-01T00:00:00Z",
              updated_by: user.id,
              updated_by_email: null,
            },
          ]
        : [];
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
    else if (name.includes("getBetaTester"))
      result = { enabled: tester, eligible: true, role_access: false };
    else if (name.includes("setBetaTester")) {
      tester = !tester;
      result = { enabled: tester };
    } else if (name.includes("getAdminUserDetail"))
      result = {
        id: "bb000000-0000-4000-8000-000000000001",
        email: "target@example.test",
        handle: "target",
        display_name: "Target fixture",
        created_at: "2026-01-01T00:00:00Z",
        role: "user",
        moderation_status: "active",
        blocked: false,
        is_admin: false,
        generations: 0,
        ai_requests: 0,
        model_access: { mode: "inherit", models: [] },
        block_reason_code: null,
        block_reason_text: null,
        blocked_at: null,
      };
    else if (name.includes("getAdminAiModels")) result = { models: [] };
    else if (name.includes("getSubscriptionEntitlementDetail"))
      result = {
        effectivePlan: "plus",
        stripe: { plan: "free", status: "inactive", currentPeriodEnd: null },
        manualGrants: [
          {
            id: "bb150000-0000-4000-8000-000000000001",
            plan: "plus",
            startsAt: "2026-10-30T08:00:00Z",
            expiresAt: "2026-11-30T08:00:00Z",
            reason: "Browser fixture",
            createdAt: "2026-10-30T08:00:00Z",
            revokedAt: null,
            revokeReason: null,
            active: true,
          },
        ],
        audit: [
          {
            id: "bb150000-0000-4000-8000-000000000002",
            action: "CREATE_SUBSCRIPTION_MANUAL_GRANT",
            createdAt: "2026-10-30T08:00:00Z",
            grantId: "bb150000-0000-4000-8000-000000000001",
            plan: "plus",
          },
        ],
      };
    else if (name.includes("getMyFeatureAccess")) result = { allowed: true };
    else if (name.includes("getHomeResume")) result = { items: [], failedSources: [] };
    else if (name.includes("list") || name.includes("search"))
      result = { users: [], items: [], tracks: [], total: 0 };
    await route.fulfill({ json: { result, context: {} } });
  });
  return {
    calls,
    loads: () => loads,
    failNext: () => {
      failTransition = true;
    },
  };
}

test("Super Admin manages Beta, archive/restore and explicit promotion without duplication", async ({
  page,
}) => {
  const f = await fixture(page);
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/management");
  await page.getByRole("button", { name: /^(Beta Features|Λειτουργίες Beta)$/ }).click();
  await expect(page.getByText("New studio fixture", { exact: true })).toBeVisible();
  const a11y = await new AxeBuilder({ page })
    .include('section[aria-label="Beta Features"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    a11y.violations.filter((item) => item.impact === "critical" || item.impact === "serious"),
  ).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("tab", { name: "Beta", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Stable", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByText("New studio fixture", { exact: true })).toBeVisible();
  const search = page.getByPlaceholder(/Search Beta features|Αναζήτηση λειτουργιών Beta/);
  await search.fill("missing");
  await expect(page.getByText("New studio fixture", { exact: true })).not.toBeVisible();
  await search.fill("");
  await page.getByRole("combobox").selectOption("stable");
  await page.getByRole("tab", { name: "Stable", exact: true }).click();
  await expect(page.getByText("New studio fixture", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^(Archive|Στο αρχείο)$/ }).click();
  await page.getByRole("tab", { name: /^(Archive|Αρχείο)$/ }).click();
  await page.getByRole("button", { name: /^(Restore|Επαναφορά)$/ }).click();
  await page.getByRole("tab", { name: "Stable", exact: true }).click();
  await page
    .getByRole("button", { name: /Move to Feature Access|Μεταφορά σε Feature Access/ })
    .click();
  await expect(page.getByText("New studio fixture", { exact: true })).not.toBeVisible();
  expect(f.loads()).toBeGreaterThan(3);
  expect(f.calls.filter((call) => call.includes("transitionBetaFeature"))).toHaveLength(4);
  await page.getByRole("button", { name: "Feature Access", exact: true }).click();
  await expect(page.getByText("New studio fixture", { exact: true })).toBeVisible();
  await page.getByRole("combobox").first().click();
  await expect(page.getByRole("option", { selected: true })).toHaveText(/Everyone|Όλοι/);
  await page.keyboard.press("Escape");
});

test("Beta Test is independent of role management and refreshes after changes", async ({
  page,
}) => {
  const f = await fixture(page);
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/management?userId=bb000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: /^(Users|Χρήστες)$/ }).click();
  const checkbox = page.getByRole("checkbox", { name: "Beta Test", exact: true });
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  expect(f.calls.filter((call) => call.includes("setBetaTester"))).toHaveLength(2);
  expect(f.calls.some((call) => call.includes("setAdminUserRole"))).toBe(false);
});

test("Super Admin User Details shows entitlement plan, sources, history and audit", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/management?userId=bb000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: /^(Users|Χρήστες)$/ }).click();

  const panel = page.getByTestId("subscription-entitlements-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Effective plan|Ενεργό πλάνο/)).toBeVisible();
  await expect(panel.getByText("plus", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText(/Stripe source|Πηγή Stripe/)).toBeVisible();
  await expect(panel.getByText(/Browser fixture/)).toBeVisible();
  await expect(panel.getByText(/bb150000-0000-4000-8000-000000000001/)).toBeVisible();

  const a11y = await new AxeBuilder({ page })
    .include('[data-testid="subscription-entitlements-panel"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    a11y.violations.filter((item) => item.impact === "critical" || item.impact === "serious"),
  ).toEqual([]);
});

test("failed lifecycle changes show safe feedback and reload authoritative state", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto("/management");
  await page.getByRole("button", { name: /^(Beta Features|Λειτουργίες Beta)$/ }).click();
  await expect(page.getByText("New studio fixture", { exact: true })).toBeVisible();
  f.failNext();
  await page.getByRole("combobox").selectOption("stable");
  await expect(
    page.getByText(/Beta settings could not be updated|Δεν ενημερώθηκαν οι ρυθμίσεις Beta/),
  ).toBeVisible();
  await expect(page.getByText("synthetic-private-token")).not.toBeVisible();
  await expect.poll(f.loads).toBeGreaterThan(1);
  await expect(page.getByRole("combobox")).toHaveValue("beta");
});

for (const role of ["admin", "moderator", "user"])
  test(`${role} cannot open Super Admin Beta management`, async ({ page }) => {
    const f = await fixture(page, role);
    await page.goto("/management");
    await expect(
      page.getByRole("button", { name: /^(Beta Features|Λειτουργίες Beta)$/ }),
    ).not.toBeVisible();
    expect(f.calls.some((call) => call.includes("listBetaFeatures"))).toBe(false);
    await expect(
      page.getByRole("button", { name: /^(AI Prompt Management|Διαχείριση AI Prompts)$/ }),
    ).toHaveCount(0);
    expect(f.calls.some((call) => call.includes("listGeneratorPrompts"))).toBe(false);
  });

for (const language of ["en", "el"])
  test(`prompt registry ${language} imports, previews safely and confirms default without paid calls`, async ({
    page,
  }) => {
    await page.addInitScript(
      (language) => localStorage.setItem("pb:interface-language", language),
      language,
    );
    const f = await fixture(page, "super_admin", true);
    await page.goto("/management");
    await page
      .getByRole("button", { name: /^(AI Prompt Management|Διαχείριση AI Prompts)$/ })
      .click();
    const panel = page.getByTestId("prompt-registry");
    await expect(panel.getByText("Candidate V5 BETA 2", { exact: true })).toBeVisible();
    await panel.getByLabel(/Name \/ version|Όνομα \/ έκδοση/).fill("Imported test");
    await panel.getByLabel(/UTF-8 template|Πρότυπο UTF-8/).setInputFiles({
      name: "candidate.md",
      mimeType: "text/markdown",
      buffer: readFileSync("docs/prompts/PromptBeats_V5_BETA_2_Master_Prompt_CANDIDATE.md"),
    });
    await panel
      .getByRole("button", { name: /^(Import experimental prompt|Εισαγωγή πειραματικού prompt)$/ })
      .click();
    await expect
      .poll(() => f.calls.filter((c) => c.includes("importGeneratorPrompt")).length)
      .toBe(1);
    const candidate = panel.locator("article").filter({ hasText: "Candidate V5 BETA 2" });
    await candidate.getByRole("button", { name: /^(View|Προβολή)$/ }).click();
    await expect(panel.getByLabel(/Template source|Περιεχόμενο προτύπου/)).toHaveValue(
      "Offline safe <script> marker",
    );
    expect(await page.locator("script").filter({ hasText: "Offline safe" }).count()).toBe(0);
    const downloadReady = page.waitForEvent("download");
    await candidate.getByRole("button", { name: /^(Download|Λήψη)$/ }).click();
    const downloaded = await downloadReady;
    expect(downloaded.suggestedFilename()).toBe("prompt-template.md");
    expect(readFileSync((await downloaded.path())!, "utf8")).toBe("Offline safe <script> marker");
    await candidate
      .getByRole("button", { name: /^(Set production default|Ορισμός παραγωγικής προεπιλογής)$/ })
      .click();
    await expect(panel.getByRole("alertdialog")).toBeVisible();
    expect(f.calls.some((c) => c.includes("mutateGeneratorPrompt"))).toBe(false);
    await panel.getByRole("button", { name: /^(Confirm|Επιβεβαίωση)$/ }).click();
    await expect(candidate.getByText(/Production default|Παραγωγική προεπιλογή/)).toBeVisible();
    await expect(
      candidate.getByRole("button", {
        name: /^(Delete unused prompt|Διαγραφή αχρησιμοποίητου prompt)$/,
      }),
    ).toBeDisabled();
    const axe = await new AxeBuilder({ page })
      .include('[data-testid="prompt-registry"]')
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    expect(f.calls.some((c) => /startGenerationJob|runSongGeneration/.test(c))).toBe(false);
  });

for (const language of ["en", "el"])
  test(`three scoped admin dropdowns ${language} use dark accessible non-native menus with unchanged choices`, async ({
    page,
  }) => {
    await page.addInitScript(
      (language) => localStorage.setItem("pb:interface-language", language),
      language,
    );
    const f = await fixture(page, "super_admin", true);
    await page.goto("/management?userId=bb000000-0000-4000-8000-000000000001");
    await page.getByRole("button", { name: /^(Users|Χρήστες)$/ }).click();
    const panel = page.getByTestId("subscription-entitlements-panel");
    const plan = panel.getByRole("combobox", { name: /^(Manual plan|Χειροκίνητο πλάνο)$/ });
    await plan.click();
    await expect(page.getByRole("option")).toHaveText(["Plus", "Pro"]);
    await page.keyboard.press("Escape");
    await expect(plan).toBeFocused();
    await plan.click();
    await page.getByRole("option", { name: "Pro", exact: true }).click();
    await expect(plan).toHaveText("Pro");
    await plan.click();
    await expect(page.getByRole("option", { selected: true })).toHaveText("Pro");
    await page.keyboard.press("Escape");
    const duration = panel.getByRole("combobox", { name: /Duration|Διάρκεια/ });
    await duration.click();
    await expect(page.getByRole("option")).toHaveText(
      language === "el"
        ? [
            "7 ημέρες",
            "1 μήνας",
            "2 μήνες",
            "3 μήνες",
            "6 μήνες",
            "12 μήνες",
            "Χωρίς λήξη",
            "Προσαρμοσμένη ημερομηνία/ώρα",
          ]
        : [
            "7 days",
            "1 month",
            "2 months",
            "3 months",
            "6 months",
            "12 months",
            "Never",
            "Custom date/time",
          ],
    );
    await page.keyboard.press("Escape");
    await expect(duration).toBeFocused();
    await duration.click();
    await page
      .getByRole("option", { name: /^(Custom date\/time|Προσαρμοσμένη ημερομηνία\/ώρα)$/ })
      .click();
    await expect(panel.locator('input[type="datetime-local"]')).toBeVisible();
    await expect(duration).toHaveText(
      language === "el" ? "Προσαρμοσμένη ημερομηνία/ώρα" : "Custom date/time",
    );
    expect(f.calls.some((c) => c.includes("createSubscriptionManualGrant"))).toBe(false);
    await page
      .getByRole("button", { name: /^(Close|Κλείσιμο)$/ })
      .last()
      .click();
    await page.getByRole("button", { name: /^(Feature Access|Πρόσβαση λειτουργιών)$/ }).click();
    const access = page.getByRole("combobox", { name: /Access mode|Τρόπος πρόσβασης/ });
    await access.click();
    await expect(page.getByRole("option")).toHaveText(
      language === "el"
        ? [
            "Απενεργοποιημένο",
            "Μόνο Admins",
            "Επιλεγμένοι χρήστες",
            "Όλοι",
            "Plus & Pro",
            "Μόνο Pro",
          ]
        : ["Disabled", "Admins only", "Selected users", "Everyone", "Plus & Pro", "Pro only"],
    );
    const background = await page
      .getByRole("listbox")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background).not.toBe("rgb(255, 255, 255)");
    await page.keyboard.press("Escape");
    await expect(access).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  });
