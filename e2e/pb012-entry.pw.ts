import { expect, test, type Page } from "@playwright/test";

// Browser integration only: no request is sent to the real Auth/API/provider services.
async function accountFixture(page: Page) {
  const user = {
    id: "8c34c798-2d83-47e5-95c9-f3fbc8e29f1b",
    aud: "authenticated",
    role: "authenticated",
    email: "pb012@example.test",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { default_start_screen: "discover" },
    created_at: "2026-01-01T00:00:00Z",
  };
  const token =
    [
      { alg: "HS256", typ: "JWT" },
      { sub: user.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 },
    ]
      .map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"))
      .join(".") + ".test-signature";
  await page.addInitScript(
    ({ user, token }) => {
      localStorage.setItem(
        "sb-qwlksrcsovbncmretjdt-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "test-refresh",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        }),
      );
    },
    { user, token },
  );
  const calls: string[] = [];
  const writes: string[] = [];
  await page.route("**/*.supabase.co/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path.startsWith("/auth/")) {
      if (
        route.request().method() === "PUT" &&
        route.request().postData()?.includes("last_resumable_destination")
      )
        writes.push(route.request().postData() ?? "");
      json = user;
    } else if (path.includes("get_my_account_status"))
      json = { status: "active", is_banned: false };
    else if (path.includes("/rpc/")) json = false;
    else if (path.includes("/profiles"))
      json = { handle: "pb012", display_name: "PB012", profile_completed: true };
    await route.fulfill({ json });
  });
  await page.route("**/_serverFn/**", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/_serverFn/")[1] ?? "";
    const name = Buffer.from(id, "base64url").toString();
    calls.push(name);
    let result: unknown = {};
    if (name.includes("resolveDefaultEntry"))
      result = { status: "valid", destination: { type: "discover" } };
    else if (name.includes("getMyFeatureAccess")) result = { allowed: false };
    else if (name.includes("getHomeResume")) result = { items: [], failedSources: [] };
    else if (name.includes("list") || name.includes("search"))
      result = { tracks: [], projects: [], prompts: [], analyses: [], items: [], creators: [] };
    await route.fulfill({ json: { result, context: {} } });
  });
  return { calls, writes };
}

test("PB-012 default document entry and reopened app use the account preference", async ({
  page,
  context,
}) => {
  const first = await accountFixture(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/discover$/);
  expect(first.calls.filter((name) => name.includes("resolveDefaultEntry"))).toHaveLength(1);
  // Returning to Home within the same document is intentional navigation, not a relaunch.
  await expect(page.getByRole("button", { name: "Tracks", exact: true })).toBeVisible();
  if (await page.getByRole("button", { name: "Open menu", exact: true }).isVisible()) {
    const menu = page.getByRole("button", { name: "Open menu", exact: true });
    await expect(async () => {
      if ((await menu.getAttribute("aria-expanded")) !== "true") await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
    }).toPass();
  }
  await page
    .getByRole("link", { name: "Home", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/$/);
  expect(first.calls.filter((name) => name.includes("resolveDefaultEntry"))).toHaveLength(1);
  const reopened = await context.newPage();
  const second = await accountFixture(reopened);
  await reopened.goto("/");
  await expect(reopened).toHaveURL(/\/discover$/);
  expect(second.calls.some((name) => name.includes("resolveDefaultEntry"))).toBe(true);
  await reopened.close();
});

test("PB-012 explicit next=create takes precedence after authentication", async ({ page }) => {
  const fixture = await accountFixture(page);
  await page.goto("/auth?next=create");
  await expect(page).toHaveURL(/\/create$/);
  expect(fixture.calls.some((name) => name.includes("resolveDefaultEntry"))).toBe(false);
});

test("PB-012 explicit malformed Project never redirects or overwrites Last Work", async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await page.goto("/library?tab=prompts&project=bad-id");
  await expect(
    page.getByText(/project is unavailable|project.*not available|έργο.*διαθέσιμο/i),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("project")).toBe("bad-id");
  expect(fixture.calls.some((name) => name.includes("resolveDefaultEntry"))).toBe(false);
  expect(fixture.writes).toHaveLength(0);
});

test("PB-012 settled My Songs persists account Last Work without a fresh-start URL", async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await page.goto("/library?tab=tracks");
  await expect.poll(() => fixture.writes.length).toBe(1);
  const update = JSON.parse(fixture.writes[0]!);
  expect(update.data.last_resumable_destination.destination).toEqual({ type: "my_songs" });
  expect(fixture.calls.some((name) => name.includes("resolveDefaultEntry"))).toBe(false);
});
