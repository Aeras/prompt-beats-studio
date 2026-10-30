import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function fixture(page: Page, role = "super_admin") {
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
  await expect(page.getByRole("combobox").first()).toHaveValue("everyone");
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
  });
