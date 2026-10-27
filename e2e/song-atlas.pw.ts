import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readAtlasCatalog } from "../src/lib/song-atlas-data.server";
import { ATLAS_HANDOFF_KEY, ATLAS_SOURCE_SHA } from "../src/lib/song-atlas.shared";

async function fixture(page: Page, initiallyAllowed = true) {
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

  let allowed = initiallyAllowed;
  let previewCalls = 0;
  await page.route("**/_serverFn/**", async (route) => {
    const name = Buffer.from(
      new URL(route.request().url()).pathname.split("/_serverFn/")[1] ?? "",
      "base64url",
    ).toString();
    let result: unknown = {};
    if (name.includes("getCurrentUserAiModelAccess")) {
      await route.fulfill({
        json: {
          result: {
            generator: { modelOptions: [], defaultModel: "" },
            qualityCheck: { modelOptions: [], defaultModel: "" },
            aiTools: { modelOptions: [], defaultModel: "" },
          },
          context: {},
        },
      });
      return;
    }
    if (name.includes("getLatestGenerationJob") || name.includes("getLatestQualityCheckJob")) {
      await route.fulfill({ json: { result: { job: null }, context: {} } });
      return;
    }
    if (name.includes("validateSongAtlasHandoff")) {
      await route.fulfill({ status: 403, body: "Atlas transfer requires independent validation" });
      return;
    }
    if (name.includes("getMyFeatureAccess")) result = { allowed };
    else if (name.includes("getSongAtlasPreview")) {
      previewCalls++;
      if (!allowed) {
        await route.fulfill({ status: 403, body: "Denied" });
        return;
      }
      result = readAtlasCatalog();
    } else if (name.includes("getMyModeration"))
      result = {
        role: "super_admin",
        status: "active",
        can_view_users: true,
        can_manage_roles: true,
      };
    else if (name.includes("getHomeResume")) result = { items: [] };
    else if (name.includes("list") || name.includes("search"))
      result = { items: [], users: [], total: 0 };
    await route.fulfill({ json: { result, context: {} } });
  });
  await page.goto("/song-atlas");
  return {
    revoke: () => {
      allowed = false;
    },
    calls: () => previewCalls,
  };
}

test("Atlas internal preview exposes 58 stable cards, provenance, search and no horizontal overflow", async ({
  page,
}) => {
  await fixture(page);
  await expect(page.locator("[data-atlas-id]")).toHaveCount(58);
  await page.locator('[data-atlas-id="ru.protyazhnaya"] summary').click();
  await expect(page.getByText("S07:", { exact: false }).first()).toBeVisible();
  const serious = (
    await new AxeBuilder({ page }).include('[data-testid="song-atlas-preview"]').analyze()
  ).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious).toEqual([]);
  await page.getByRole("textbox", { name: /Search profiles|Αναζήτηση προφίλ/ }).fill("ru.phonk");
  await expect(page.locator("[data-atlas-id]")).toHaveCount(1);
  await expect(page.locator('[data-atlas-id="ru.phonk"]')).toContainText(
    /Context only|Μόνο πλαίσιο/,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath("atlas-preview.png") });
});
test("Atlas selections stay research-only, conflicts visible, drafts survive refresh", async ({
  page,
}) => {
  await fixture(page);
  const card = page.locator('[data-atlas-id="ru.chastushka"]');
  await card.getByRole("checkbox").check();
  await page.getByRole("checkbox", { name: /^lively/ }).check();
  await page.getByRole("checkbox", { name: /^slow legato/ }).check();
  await expect(page.getByRole("alert")).toContainText(/Conflicting|Σύγκρουση/);
  await expect(
    page.getByRole("button", { name: /Review transfer|Έλεγχος μεταφοράς/ }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.locator('[data-atlas-id="ru.chastushka"]').getByRole("checkbox")).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /^lively/ })).toBeChecked();
});
test("denied or revoked deep links never display cached research content", async ({ page }) => {
  const f = await fixture(page, false);
  await expect(page.locator("[data-atlas-id]")).toHaveCount(0);
  await expect(page.getByRole("alert")).toBeVisible();
  expect(f.calls()).toBe(0);
});
test("fresh page after entitlement revocation hides all Atlas cards", async ({ page }) => {
  const f = await fixture(page);
  await expect(page.locator("[data-atlas-id]")).toHaveCount(58);
  f.revoke();
  await page.reload();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("[data-atlas-id]")).toHaveCount(0);
});

test("ordinary Generator and failed Atlas handoff preserve existing user instructions", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/generate");
  await page.locator("button[data-generator-mode=advanced]").click();
  const input = page.getByRole("textbox", {
    name: /^(Additional Instructions|Πρόσθετες οδηγίες)$/,
  });
  await input.fill("Keep my Blueprint and explicit instructions.");
  await expect(
    page.getByRole("textbox", { name: /Creative Techniques|Δημιουργικές τεχνικές/ }),
  ).toHaveCount(0);
  await page.evaluate(
    ({ key, sha }) => {
      sessionStorage.setItem(
        key + ":bb000000-0000-4000-8000-000000000006",
        JSON.stringify({
          format: "promptbeats-atlas-handoff",
          schemaVersion: 1,
          id: "ca290000-0000-4000-8000-000000000001",
          sourceSha: sha,
          selection: { profileIds: ["ru.chastushka"], optionIds: ["ru.chastushka.mode.lively"] },
        }),
      );
    },
    { key: ATLAS_HANDOFF_KEY, sha: ATLAS_SOURCE_SHA },
  );
  // Remount only the route, preserving existing draft through its normal autosave.
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter((k) => k.startsWith("pb:draft:v1:"))
          .some((k) =>
            localStorage.getItem(k)?.includes("Keep my Blueprint and explicit instructions."),
          ),
      ),
    )
    .toBe(true);
  await page.goto("/song-atlas");
  await page.goto("/generate");
  await expect(
    page.getByRole("button", { name: /Apply reviewed selection|Εφαρμογή ελεγμένης επιλογής/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Apply reviewed selection|Εφαρμογή ελεγμένης επιλογής/ })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: /independent validation|ανεξάρτητη επικύρωση/ }),
  ).toBeVisible();
  await page.locator("button[data-generator-mode=advanced]").click();
  await expect(input).toHaveValue("Keep my Blueprint and explicit instructions.");
});
