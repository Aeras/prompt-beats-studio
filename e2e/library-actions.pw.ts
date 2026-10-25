import { expect, test } from "@playwright/test";

test("track menu favorites and playlists refresh after success and safely report failure", async ({
  page,
}) => {
  const user = {
    id: "a7000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "library@example.test",
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
    const json = path.startsWith("/auth/")
      ? user
      : path.includes("get_my_account_status")
        ? { status: "active", is_banned: false }
        : path.includes("/rpc/")
          ? false
          : path.includes("/profiles")
            ? { handle: "library", display_name: "Library", profile_completed: true }
            : [];
    await route.fulfill({ json });
  });
  const trackId = "a8000000-0000-4000-8000-000000000002";
  const playlistId = "a9000000-0000-4000-8000-000000000001";
  let favorite = false;
  let created = false;
  let failCreate = false;
  let creates = 0;
  let playlistLoads = 0;
  await page.route("**/_serverFn/**", async (route) => {
    const encoded = new URL(route.request().url()).pathname.split("/_serverFn/")[1] ?? "";
    const name = Buffer.from(encoded, "base64url").toString();
    let result: unknown = {};
    if (name.includes("getMyFeatureAccess")) result = { allowed: true };
    else if (name.includes("listEligiblePublicTracks"))
      result = {
        tracks: [
          {
            id: trackId,
            user_id: "a7000000-0000-4000-8000-000000000002",
            title: "Library fixture",
            source_type: "upload",
            audio_type: "upload",
            audio_url: "/offline.mp3",
            genre: "Pop",
            is_published: true,
            duration_seconds: 120,
            plays: 0,
            prompt: "",
            lyrics: "",
            handle: "fixture",
          },
        ],
      };
    else if (name.includes("listFavoriteTrackIds"))
      result = { trackIds: favorite ? [trackId] : [] };
    else if (name.includes("toggleFavorite")) {
      favorite = !favorite;
      result = { favorite };
    } else if (name.includes("listPlaylists")) {
      playlistLoads++;
      result = {
        playlists: [
          { id: playlistId, name: "Existing playlist", track_count: 0 },
          ...(created
            ? [{ id: "a9000000-0000-4000-8000-000000000002", name: "New playlist", track_count: 1 }]
            : []),
        ],
      };
    } else if (name.includes("createPlaylist")) {
      creates++;
      if (failCreate) {
        await route.fulfill({ status: 500, body: "synthetic-private-database-marker" });
        return;
      }
      created = true;
      result = { playlist: { id: "a9000000-0000-4000-8000-000000000002" } };
    } else if (name.includes("addTrackToPlaylist")) result = { status: "added" };
    else if (name.includes("getTrackDownloadAvailability")) result = { allowed: {} };
    else if (name.includes("getHomeResume")) result = { items: [], failedSources: [] };
    else if (name.includes("list") || name.includes("search"))
      result = { tracks: [], items: [], creators: [] };
    await route.fulfill({ json: { result, context: {} } });
  });
  await page.goto("/discover");
  await expect(page.getByText("Library fixture", { exact: true })).toBeVisible();
  const menu = page
    .getByRole("button", { name: /More track actions|Περισσότερες ενέργειες/ })
    .first();
  await menu.click();
  await page.getByRole("menuitem", { name: /Add to Favorites|Προσθήκη στα Αγαπημένα/ }).click();
  await menu.click();
  await expect(
    page.getByRole("menuitem", { name: /Remove from Favorites|Αφαίρεση από τα Αγαπημένα/ }),
  ).toBeVisible();
  await page
    .getByRole("menuitem", { name: /Remove from Favorites|Αφαίρεση από τα Αγαπημένα/ })
    .click();
  await menu.click();
  await page.getByRole("menuitem", { name: /Add to playlist|Προσθήκη σε λίστα/ }).click();
  await page.getByPlaceholder(/Playlist name|Όνομα λίστας/).fill("New playlist");
  await page.getByRole("button", { name: /Create and add|Δημιουργία και προσθήκη/ }).click();
  await expect.poll(() => creates).toBe(1);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await menu.click();
  await page.getByRole("menuitem", { name: /Add to playlist|Προσθήκη σε λίστα/ }).click();
  await expect(page.getByRole("button", { name: /New playlist.*1 tracks/ })).toBeVisible();
  await page.getByRole("button", { name: /Existing playlist/ }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(playlistLoads).toBeGreaterThan(1);
  failCreate = true;
  await menu.click();
  await page.getByRole("menuitem", { name: /Add to playlist|Προσθήκη σε λίστα/ }).click();
  await page.getByPlaceholder(/Playlist name|Όνομα λίστας/).fill("Failure fixture");
  await page.getByRole("button", { name: /Create and add|Δημιουργία και προσθήκη/ }).click();
  await expect(
    page.getByText(
      /The playlist with this track could not be created|Δεν δημιουργήθηκε η λίστα με το τραγούδι/,
    ),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByPlaceholder(/Playlist name|Όνομα λίστας/)).toHaveValue("Failure fixture");
  await expect(page.locator("body")).not.toContainText("synthetic-private-database-marker");
});
