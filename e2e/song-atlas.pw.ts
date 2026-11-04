import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readAtlasCatalog } from "../src/lib/song-atlas-data.server";
import { readAtlasResearchProfile } from "../src/lib/atlas-research.server";
import { ATLAS_HANDOFF_KEY, ATLAS_SOURCE_SHA } from "../src/lib/song-atlas.shared";

async function fixture(page: Page, initiallyAllowed = true, approvedFixture = false) {
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
  let validationGate: Promise<void> | null = null;
  let releaseGate = () => {};
  let validationRequests = 0;
  let verifiedId = "ca290000-0000-4000-8000-000000000001";
  let verifiedText = "Fixture Atlas-owned directive";
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
      validationRequests++;
      if (validationGate) await validationGate;
      // Positive UI fixtures only; real RC1 validation remains denied on the server/SQL/worker.
      if (approvedFixture) {
        await route.fulfill({
          json: {
            result: {
              handoff: {
                format: "promptbeats-atlas-handoff",
                schemaVersion: 1,
                id: verifiedId,
                sourceSha: ATLAS_SOURCE_SHA,
                selection: {
                  profileIds: ["ru.chastushka"],
                  optionIds: ["ru.chastushka.mode.lively"],
                },
              },
              instructions: verifiedText,
              creativeTechniques: "Fixture technique",
            },
            context: {},
          },
        });
        return;
      }
      await route.fulfill({ status: 403, body: "Atlas transfer requires independent validation" });
      return;
    }
    if (name.includes("getSongAtlasResearch")) {
      if (!allowed) {
        await route.fulfill({ status: 403, body: "Denied" });
        return;
      }
      result = readAtlasResearchProfile("ru.protyazhnaya");
    } else if (name.includes("getMyFeatureAccess")) result = { allowed };
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
    changeReply: () => {
      verifiedId = "ca290000-0000-4000-8000-000000000002";
      verifiedText = "Other Atlas-owned directive";
    },
    pauseValidation: () => {
      validationGate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
    },
    releaseValidation: () => {
      releaseGate();
      validationGate = null;
    },
    validationCount: () => validationRequests,
  };
}

async function browseRussia(page: Page) {
  await page.getByRole("combobox", { name: /^(Continent|Ήπειρος)$/ }).click();
  await page.getByRole("option", { name: /Europe \/ Asia|Ευρώπη \/ Ασία/ }).click();
  await page.getByRole("combobox", { name: /^(Country|Χώρα)$/ }).click();
  await page.getByRole("option", { name: /Russia \/ Russophone|Ρωσία \/ ρωσόφωνη/ }).click();
}

test("V4 evidence is lazy, localized, scoped and never enables transfer", async ({ page }) => {
  await fixture(page);
  await expect(
    page.getByText(/No independently approved techniques|Δεν υπάρχουν ακόμη ανεξάρτητα/),
  ).toBeVisible();
  const card = page.locator('[data-atlas-id="ru.protyazhnaya"]');
  const notes = card.getByTestId("atlas-research");
  await expect(notes.getByRole("heading")).toHaveCount(0);
  await notes.getByRole("button", { name: /View V4 research|Προβολή έρευνας V4/ }).click();
  await expect(
    notes.getByRole("heading", { name: /New V4 research evidence|Νέα ερευνητική τεκμηρίωση V4/ }),
  ).toBeVisible();
  await expect(notes.getByText(/Research evidence is not|Η τεκμηρίωση δεν αποτελεί/)).toBeVisible();
  await expect(notes.locator("article")).toHaveCount(
    readAtlasResearchProfile("ru.protyazhnaya").tasks.length,
  );
  await expect(
    page.getByRole("button", { name: /Review transfer|Έλεγχος μεταφοράς/ }),
  ).toBeDisabled();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.evaluate(() => localStorage.setItem("pb:interface-language", "el"));
  await page.reload();
  await notes.getByRole("button", { name: "Προβολή έρευνας V4" }).click();
  await expect(notes.getByRole("heading", { name: "Νέα ερευνητική τεκμηρίωση V4" })).toBeVisible();
  await expect(notes.locator('p[lang="el"]').first()).toBeVisible();
});

test("V4 research access failure reveals no cached evidence", async ({ page }) => {
  const f = await fixture(page);
  await page.route("**/_serverFn/**", async (route) => {
    const name = Buffer.from(
      new URL(route.request().url()).pathname.split("/_serverFn/")[1] ?? "",
      "base64url",
    ).toString();
    if (name.includes("getSongAtlasResearch")) await route.fulfill({ status: 403, body: "Denied" });
    else await route.fallback();
  });
  const notes = page.locator('[data-atlas-id="ru.protyazhnaya"]').getByTestId("atlas-research");
  await notes.getByRole("button", { name: /View V4 research|Προβολή έρευνας V4/ }).click();
  await expect(notes.getByRole("alert")).toContainText(
    /Evidence is unavailable|Η τεκμηρίωση δεν είναι διαθέσιμη/,
  );
  await expect(notes.locator("article")).toHaveCount(0);
  expect(f.validationCount()).toBe(0);
});

test("quarantined evidence never exposes its statement or enables transfer", async ({ page }) => {
  const f = await fixture(page);
  const research = readAtlasResearchProfile("ru.protyazhnaya");
  research.tasks[0] = {
    ...research.tasks[0]!,
    quarantined: true,
    researchDecision: null,
    suggestedStatementEl: null,
    suggestedStatementEn: null,
    citations: [],
    validationIssues: ["Synthetic invalid source metadata"],
  };
  await page.route("**/_serverFn/**", async (route) => {
    const name = Buffer.from(
      new URL(route.request().url()).pathname.split("/_serverFn/")[1] ?? "",
      "base64url",
    ).toString();
    if (name.includes("getSongAtlasResearch"))
      await route.fulfill({ json: { result: research, context: {} } });
    else await route.fallback();
  });
  const notes = page.locator('[data-atlas-id="ru.protyazhnaya"]').getByTestId("atlas-research");
  await notes.getByRole("button", { name: /View V4 research|Προβολή έρευνας V4/ }).click();
  const quarantined = notes.locator("article").first();
  await expect(quarantined).toContainText(
    /Source metadata needs correction|Απαιτείται διόρθωση μεταδεδομένων/,
  );
  await expect(quarantined).toContainText(
    /No musical rule proposed|Δεν προτείνεται μουσικός κανόνας/,
  );
  await expect(quarantined.getByRole("link")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Review transfer|Έλεγχος μεταφοράς/ }),
  ).toBeDisabled();
  expect(f.validationCount()).toBe(0);
});

for (const scenario of [
  {
    family: "Rock",
    expected: ["Alternative rock", "Punk rock", "Post-punk"],
    pick: "Alternative rock",
    profile: "ru.russian_alt_rock",
  },
  {
    family: "Pop",
    expected: ["Indie pop", "Synth-pop", "Dance pop"],
    pick: "Indie pop",
    profile: "ru.indie_pop",
  },
  {
    family: "Rap / hip-hop",
    expected: ["Trap", "Drill", "Cloud rap", "Melodic rap", "Pop rap"],
    pick: "Trap",
    profile: "ru.trap",
  },
  {
    family: "Folk",
    expected: ["Chastushka", "Protyazhnaya song", "Wedding ritual songs"],
    pick: "Chastushka",
    profile: "ru.chastushka",
  },
]) {
  test("musical taxonomy navigation: " + scenario.family, async ({ page }) => {
    await fixture(page);
    await browseRussia(page);
    await page.getByRole("combobox", { name: "Musical genre / family", exact: true }).click();
    await page.getByRole("option", { name: scenario.family, exact: true }).click();
    await page.getByRole("combobox", { name: "Subcategory", exact: true }).click();
    const list = page.getByRole("listbox");
    for (const name of scenario.expected)
      await expect(list.getByRole("option").filter({ hasText: name })).toHaveCount(1);
    const labels = await list.getByRole("option").allTextContents();
    expect(labels.join(" ")).not.toMatch(
      /historical_scene|music_style_or_form|thematic_approach|Musical style or form/,
    );
    if (scenario.family === "Rock") {
      const severe = (
        await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
      ).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(severe).toEqual([]);
      await page.screenshot({ path: test.info().outputPath("rock-musical-subcategories.png") });
    }
    await list.getByRole("option").filter({ hasText: scenario.pick }).click();
    await expect(page.locator("[data-atlas-id]")).toHaveCount(1);
    await expect(page.locator('[data-atlas-id="' + scenario.profile + '"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /Review transfer/ })).toBeDisabled();
  });
}

test("typed fallback paths preserve scenes, forms and themes without pretending they are subgenres", async ({
  page,
}) => {
  await fixture(page);
  await browseRussia(page);
  const genre = page.getByRole("combobox", { name: "Musical genre / family", exact: true });
  const subtype = page.getByRole("combobox", { name: "Subcategory", exact: true });
  for (const example of [
    {
      family: "Rock",
      label: "Historical scene",
      name: "Soviet rock of the 1970s",
      profile: "ru.rock_70",
    },
    {
      family: "Rock",
      label: "Form / performance format",
      name: "Rock ballad",
      profile: "ru.russian_rock_ballad",
    },
    {
      family: "Rap / hip-hop",
      label: "Cultural / thematic context",
      name: "Social / conceptual rap",
      profile: "ru.conscious_rap",
    },
    {
      family: "Pop",
      label: "No finer subgenre documented",
      name: "General pop",
      profile: "ru.modern_russian_pop",
    },
  ]) {
    await genre.click();
    await page.getByRole("option", { name: example.family, exact: true }).click();
    await subtype.click();
    const option = page.getByRole("option").filter({ hasText: example.name });
    await expect(option).toContainText(example.label);
    await option.click();
    await expect(page.locator("[data-atlas-id]")).toHaveCount(1);
    await expect(page.locator('[data-atlas-id="' + example.profile + '"]')).toBeVisible();
  }
});

test("Greek musical subcategories have stable localized names with English terminology", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() => localStorage.setItem("pb:interface-language", "el"));
  await page.reload();
  await browseRussia(page);
  await page.getByRole("combobox", { name: "Μουσικό είδος / οικογένεια", exact: true }).click();
  await page.getByRole("option", { name: "Ροκ", exact: true }).click();
  await page.getByRole("combobox", { name: "Υποκατηγορία", exact: true }).click();
  const option = page.getByRole("option").filter({ hasText: "Εναλλακτικό ροκ" });
  await expect(option).toContainText("Alternative rock");
  await expect(option.locator('[lang="en"]')).toContainText("Alternative rock");
  await option.click();
  await expect(page.locator("[data-atlas-id]")).toHaveCount(1);
  await expect(page.locator('[data-atlas-id="ru.russian_alt_rock"] h2')).toHaveAttribute(
    "lang",
    "ru",
  );
});

test("cascading paths show only real options and parent changes retain research selections", async ({
  page,
}) => {
  await fixture(page);
  await expect(page.getByRole("combobox", { name: /^(Country|Χώρα)$/ })).toBeDisabled();
  await page.locator('[data-atlas-id="ru.chastushka"]').getByRole("checkbox").check();
  await browseRussia(page);
  const genre = page.getByRole("combobox", { name: /Musical genre|Μουσικό είδος/ });
  await genre.click();
  await expect(page.getByRole("option")).toHaveCount(10);
  await page.getByRole("option", { name: /^(Folk|Παραδοσιακή μουσική)$/ }).click();
  await expect(page.locator("[data-atlas-id]")).toHaveCount(8);
  const subtype = page.getByRole("combobox", { name: /^(Subcategory|Υποκατηγορία)$/ });
  await subtype.click();
  await expect(
    page.getByRole("option", { name: /Historical scene|Ιστορική μουσική σκηνή/ }),
  ).toHaveCount(0);
  await page.getByRole("option", { name: /Chastushka/ }).click();
  await expect(page.locator("[data-atlas-id]")).toHaveCount(1);
  const profile = page.getByRole("combobox", { name: /^(Musical profile|Μουσικό προφίλ)$/ });
  await profile.click();
  await page.getByRole("option", { name: /Частушка/ }).click();
  await expect(page.locator("[data-atlas-id]")).toHaveCount(1);
  await genre.click();
  await page.getByRole("option", { name: /^(Rock|Ροκ)$/ }).click();
  await expect(subtype).toHaveText(/Subcategory|Υποκατηγορία/);
  await expect(profile).toBeDisabled();
  await expect(page.getByRole("combobox", { name: /^(Country|Χώρα)$/ })).toContainText(
    /Russia|Ρωσία/,
  );
  await page.getByRole("button", { name: /Reset browsing|Καθαρισμός φίλτρων/ }).click();
  await expect(page.locator("[data-atlas-id]")).toHaveCount(58);
  await expect(page.locator('[data-atlas-id="ru.chastushka"]').getByRole("checkbox")).toBeChecked();
});

test("compact dropdown search, outside dismissal, toggle and Escape restore focus", async ({
  page,
}) => {
  await fixture(page);
  await browseRussia(page);
  const genre = page.getByRole("combobox", { name: /Musical genre|Μουσικό είδος/ });
  const country = page.getByRole("combobox", { name: /^(Country|Χώρα)$/ });
  await genre.click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByRole("combobox", { name: /Search options|Αναζήτηση επιλογών/ }).fill("rap");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(genre).toContainText(/Rap|Ραπ/);
  await expect(genre).toBeFocused();
  await genre.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(genre).toBeFocused();
  await genre.click();
  await country.click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(genre).toHaveAttribute("aria-expanded", "false");
  await country.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await genre.click();
  if (test.info().project.name === "mobile") {
    await page.getByRole("heading", { level: 1 }).tap();
  } else {
    await page.getByRole("heading", { level: 1 }).click();
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.locator("select").count()).toBe(0);
});

test("dropdown touch targets, internal scroll, page scroll and open accessibility", async ({
  page,
}) => {
  await fixture(page);
  await browseRussia(page);
  const genre = page.getByRole("combobox", { name: /Musical genre|Μουσικό είδος/ });
  const triggerHeight = (await genre.boundingBox())!.height;
  expect(triggerHeight).toBeGreaterThanOrEqual(40);
  expect(triggerHeight).toBeLessThanOrEqual(44);
  await genre.click();
  const list = page.getByRole("listbox");
  expect(await list.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  expect((await list.boundingBox())!.height).toBeLessThanOrEqual(281);
  await expect
    .poll(async () => Math.round((await page.getByRole("option").first().boundingBox())!.height))
    .toBeGreaterThanOrEqual(44);
  await expect(page.getByRole("dialog")).toHaveAttribute("data-side", /^(top|bottom)$/);
  await list.evaluate((e) => {
    e.scrollTop = e.scrollHeight;
  });
  await expect(page.getByRole("option").last()).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("atlas-dropdown-open.png") });
  const severe = (
    await new AxeBuilder({ page })
      .include('[data-testid="song-atlas-preview"]')
      .include('[role="dialog"]')
      .analyze()
  ).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(severe).toEqual([]);
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath("atlas-navigation.png") });
});

test("small dropdown supports keyboard-only open, Home/End, selection and viewport collision", async ({
  page,
}) => {
  await fixture(page);
  const continent = page.getByRole("combobox", { name: /^(Continent|Ήπειρος)$/ });
  await continent.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByRole("listbox").focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("option")).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(continent).toContainText(/Europe|Ευρώπη/);
  await expect(continent).toBeFocused();
  await page.getByRole("combobox", { name: /^(Country|Χώρα)$/ }).click();
  const dialog = page.getByRole("dialog");
  const box = (await dialog.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  await page.keyboard.press("Escape");
});

test("Greek and English UI retain source scripts, truthful fallback and identical stable taxonomy", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() => localStorage.setItem("pb:interface-language", "el"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Πολιτισμικός Άτλας Τραγουδιού" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Ήπειρος", exact: true })).toBeVisible();
  const card = page.locator('[data-atlas-id="ru.protyazhnaya"]');
  await expect(card.locator('h2[lang="ru"]')).toHaveText("Протяжная песня");
  await expect(card.locator('[lang="ru-Latn"]')).toContainText("Protyazhnaya");
  await browseRussia(page);
  await page.getByRole("combobox", { name: "Μουσικό είδος / οικογένεια" }).click();
  await page.getByRole("option", { name: "Παραδοσιακή μουσική", exact: true }).click();
  await expect(page.locator("[data-atlas-id]")).toHaveCount(8);
  await page.evaluate(() => localStorage.setItem("pb:interface-language", "en"));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Cultural Song Atlas", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Greek editorial text (approved English version unavailable).", { exact: true })
      .first(),
  ).toBeVisible();
  await browseRussia(page);
  await page.getByRole("combobox", { name: "Musical genre / family" }).click();
  await page.getByRole("option", { name: "Folk", exact: true }).click();
  await expect(page.locator("[data-atlas-id]")).toHaveCount(8);
  await expect(page.getByRole("button", { name: /Review transfer/ })).toBeDisabled();
});

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
  await page.getByRole("checkbox", { name: /^(lively|Ζωηρή)/ }).check();
  await page.getByRole("checkbox", { name: /^(slow legato|Αργό legato)/ }).check();
  await expect(page.getByRole("alert")).toContainText(/Conflicting|Σύγκρουση/);
  await expect(
    page.getByRole("button", { name: /Review transfer|Έλεγχος μεταφοράς/ }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.locator('[data-atlas-id="ru.chastushka"]').getByRole("checkbox")).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /^(lively|Ζωηρή)/ })).toBeChecked();
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

async function enterAtlasGenerator(page: Page) {
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
  await page.goto("/generate");
  await page.locator("button[data-generator-mode=advanced]").click();
}
test("explicit Atlas layer apply, edit manual, reapply, refresh, replace and remove", async ({
  page,
}) => {
  const f = await fixture(page, true, true);
  await enterAtlasGenerator(page);
  const manual = page.getByRole("textbox", {
    name: /^(Additional Instructions|Πρόσθετες οδηγίες)$/,
  });
  const owned = page.getByRole("textbox", {
    name: /Atlas-owned instructions|Οδηγίες προέλευσης Atlas/,
  });
  const apply = page.getByRole("button", {
    name: /Apply reviewed selection|Εφαρμογή ελεγμένης επιλογής/,
  });
  await manual.fill("My manual instruction");
  f.pauseValidation();
  await apply.click();
  await expect.poll(() => f.validationCount()).toBe(1);
  await manual.fill("My manual edits while validation runs");
  f.releaseValidation();
  await expect(owned).toHaveValue("Fixture Atlas-owned directive");
  await expect(owned).toHaveAttribute("readonly", "");
  await expect(manual).toHaveValue("My manual edits while validation runs");
  await apply.click();
  await expect.poll(() => f.validationCount()).toBe(2);
  await expect(manual).toHaveValue("My manual edits while validation runs");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter((k) => k.startsWith("pb:draft:v1:"))
          .some((k) =>
            localStorage.getItem(k)?.includes('"verifiedText":"Fixture Atlas-owned directive"'),
          ),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(owned).toHaveValue("Fixture Atlas-owned directive");
  await expect(manual).toHaveValue("My manual edits while validation runs");
  f.changeReply();
  await apply.click();
  await expect(owned).toHaveValue("Other Atlas-owned directive");
  await manual.fill("Copied and edited: Other Atlas-owned directive — keep this manual text");
  await page
    .getByRole("button", { name: /Remove Atlas selection|Αφαίρεση επιλογής Atlas/ })
    .click();
  await expect(owned).toHaveCount(0);
  await expect(manual).toHaveValue(
    "Copied and edited: Other Atlas-owned directive — keep this manual text",
  );
});
test("remove during pending validation cannot resurrect an Atlas layer", async ({ page }) => {
  const f = await fixture(page, true, true);
  await enterAtlasGenerator(page);
  f.pauseValidation();
  await page
    .getByRole("button", { name: /Apply reviewed selection|Εφαρμογή ελεγμένης επιλογής/ })
    .click();
  await expect.poll(() => f.validationCount()).toBe(1);
  await page
    .getByRole("button", { name: /Remove Atlas selection|Αφαίρεση επιλογής Atlas/ })
    .click();
  f.releaseValidation();
  await expect(
    page.getByRole("textbox", { name: /Atlas-owned instructions|Οδηγίες προέλευσης Atlas/ }),
  ).toHaveCount(0);
});
