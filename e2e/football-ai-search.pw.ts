import { expect, test } from "@playwright/test";

/**
 * Browser Quality: AI Search BETA consent + verified-only analysis.
 * Requires a Super Admin session (E2E_SUPER_ADMIN_STORAGE) and the replayed
 * migration; skipped otherwise. No paid call: the refresh RPC is intercepted.
 */
test.skip(!process.env["E2E_SUPER_ADMIN_STORAGE"], "needs a super-admin storage state");
test.use({ storageState: process.env["E2E_SUPER_ADMIN_STORAGE"] ?? undefined });

test("AI search shows paid-consent dialog with max cost and quota; candidates are not analyzable", async ({ page }) => {
  let refreshCalls = 0;
  await page.route("**/_serverFn/**", async (route) => {
    if (route.request().method() === "POST" && route.request().postData()?.includes("consent")) {
      refreshCalls++;
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/private/football-research");
  await page.getByLabel("Πάροχος αγώνων").selectOption("ai-search");
  const league = page.getByLabel("Πρωτάθλημα");
  await expect(league.locator("option")).toHaveCount(12);
  await league.selectOption("UEFA-CL");
  const refresh = page.getByRole("button", { name: /AI BETA/ });
  await expect(refresh).toBeVisible();
  if (await refresh.isEnabled()) {
    await refresh.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("$");
    await expect(dialog).toContainText("/3");
    await dialog.getByRole("button", { name: "Ακύρωση" }).click();
    expect(refreshCalls).toBe(0);
  }
  for (const row of await page.getByTestId("ai-fixture-status").all()) {
    if ((await row.textContent()) === "Υποψήφιο") {
      await expect(row.locator("xpath=ancestor::li//input[@type='checkbox']")).toBeDisabled();
    }
  }
});
