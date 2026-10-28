import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { inspirationResearchSchema } from "../src/lib/music-inspiration.shared";

const research = inspirationResearchSchema.parse({
  version: 1,
  researchPromptVersion: "1",
  request: { kind: "artist", artist: "Mirage", depth: "standard" },
  sources: [
    {
      id: "credits",
      title: "Offline album credits",
      url: "https://example.org/credits",
      publisher: "Offline archive",
      accessedAt: "2026-10-28T00:00:00.000Z",
      locator: "Credits",
      sourceType: "credits",
    },
  ],
  evidence: [
    {
      id: "e1",
      claim: "The credits mention synthesizers.",
      dimension: "instrumentation",
      classification: "bounded",
      sourceIds: ["credits"],
      limitation: "No exact equipment is verified.",
    },
  ],
  unresolvedQuestions: ["The original tempo is unknown."],
  proposal: {
    musicStyles: ["Synth-pop"],
    moods: ["Nostalgic"],
    instruments: ["Synth"],
    bpm: 120,
    productionStyle: "Offline warm synth proposal",
    additionalInstructions: "Create an original melodic hook.",
    songStructure: ["Verse", "Chorus", "Chorus"],
    blueprint: [
      { structureIndex: 0, sectionType: "Verse", instruction: "Sparse", energy: 2 },
      { structureIndex: 1, sectionType: "Chorus", instruction: "Bright", energy: 4 },
      { structureIndex: 2, sectionType: "Chorus", instruction: "Full", energy: 5 },
    ],
    supportingEvidenceIds: ["e1"],
    creativeChoices: ["120 BPM is a creative suggestion, not a measured fact."],
  },
});
type Profile = { id: string; name: string; revision: number; result: typeof research };
type WireNode = { t?: number; s?: unknown; p?: { k?: string[]; v?: WireNode[] } };
function decode(node: WireNode): unknown {
  if (node.p?.k) return Object.fromEntries(node.p.k.map((k, i) => [k, decode(node.p!.v![i])]));
  if (node.t === 2) return node.s === 2;
  return node.s;
}
async function fixture(
  page: Page,
  options: {
    configured?: boolean;
    superAdmin?: boolean;
    allowed?: boolean;
    greek?: boolean;
    partial?: boolean;
    malformed?: "profiles" | "config";
  } = {},
) {
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
      .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
      .join(".") + ".offline";
  await page.addInitScript(
    ({ user, token, greek }) => {
      localStorage.setItem("pb:interface-language", greek ? "el" : "en");
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
    { user, token, greek: options.greek },
  );
  // No browser request can reach a real DB, research provider, audio host or AI service.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
    const path = url.pathname;
    await route.fulfill({
      json: url.hostname.endsWith(".supabase.co")
        ? path.startsWith("/auth/")
          ? user
          : path.includes("get_my_account_status")
            ? { status: "active", is_banned: false }
            : path.includes("/rpc/")
              ? false
              : path.includes("/profiles")
                ? { handle: "beta", display_name: "Beta", profile_completed: true }
                : []
        : {},
    });
  });
  let profiles: Profile[] = [
    {
      id: "ca290000-0000-4000-8000-000000000001",
      name: "Saved offline profile",
      revision: 1,
      result: research,
    },
  ];
  const calls: { name: string; data: Record<string, unknown> }[] = [];
  let finish = true;
  let conflict = false;
  let failPoll = false;
  let loseStartAck = false;
  let unknownOutcome = false;
  const admittedRequests = new Set<string>();
  let gate: Promise<void> | null = null;
  let release = () => {};
  let job = {
    id: "ca290000-0000-4000-8000-000000000002",
    status: "queued",
    result: null as typeof research | null,
    error_code: null as string | null,
    model: "server-live-default",
    budget_usd: 0.25,
    reserved_usd: 0.05,
    search_credits: 2,
  };
  await page.route("**/_serverFn/**", async (route) => {
    const url = new URL(route.request().url());
    const name = Buffer.from(url.pathname.split("/_serverFn/")[1] ?? "", "base64url").toString();
    let data: Record<string, unknown> = {};
    if (route.request().method() === "POST" && name.includes("MusicInspiration")) {
      const body: unknown = route.request().postDataJSON();
      const wire = body as { t?: WireNode; data?: Record<string, unknown> };
      data = wire.t
        ? (decode(wire.t) as { data: Record<string, unknown> }).data
        : (wire.data ?? {});
    }
    calls.push({ name, data });
    let result: unknown = {};
    if (name.includes("getCurrentUserAiModelAccess"))
      result = {
        generator: { modelOptions: [], defaultModel: "" },
        qualityCheck: { modelOptions: [], defaultModel: "" },
        aiTools: { modelOptions: [], defaultModel: "" },
      };
    else if (name.includes("getLatestGenerationJob") || name.includes("getLatestQualityCheckJob"))
      result = { job: null };
    else if (name.includes("getMyFeatureAccess")) result = { allowed: options.allowed !== false };
    else if (name.includes("getMusicInspirationConfig"))
      result = {
        configured: options.configured !== false,
        reason:
          options.configured === false
            ? "Verified model pricing or research budget is unavailable."
            : null,
        superAdmin: options.superAdmin === true,
        defaultModel: "server-live-default",
        models:
          options.malformed === "config"
            ? { items: [] }
            : [{ id: "allowed-override", label: "Allowed override" }],
      };
    else if (name.includes("startMusicInspiration")) {
      const key = String(data.requestId);
      if (!admittedRequests.has(key)) {
        admittedRequests.add(key);
        job = { ...job, status: "queued", result: null };
      }
      if (loseStartAck) {
        loseStartAck = false;
        return route.abort("failed");
      }
      result = job;
    } else if (name.includes("getMusicInspirationJob")) {
      if (gate) await gate;
      if (failPoll) return route.fulfill({ status: 503, body: "Offline failure" });
      if (unknownOutcome) job = { ...job, status: "unknown", result: null };
      else if (finish && job.status !== "cancelled")
        job = { ...job, status: "completed", result: research };
      result = job;
    } else if (name.includes("cancelMusicInspiration")) {
      job = { ...job, status: "cancelled", result: null };
      result = job;
    } else if (name.includes("listMusicInspirationProfiles"))
      result = options.malformed === "profiles" ? { items: [], users: [], total: 0 } : profiles;
    else if (name.includes("saveMusicInspirationProfile")) {
      const p = {
        id: "ca290000-0000-4000-8000-000000000003",
        name: String(data.name),
        revision: 1,
        result: research,
      };
      profiles.push(p);
      result = p;
    } else if (
      name.includes("updateMusicInspirationProfile") ||
      name.includes("deleteMusicInspirationProfile")
    ) {
      const p = profiles.find((p) => p.id === data.id);
      if (conflict || !p || p.revision !== data.revision)
        return route.fulfill({ status: 409, body: "Offline revision conflict" });
      if (name.includes("deleteMusicInspirationProfile")) {
        profiles = profiles.filter((p) => p.id !== data.id);
        result = { deleted: true };
      } else {
        p.revision++;
        if (data.name) p.name = String(data.name);
        result = p;
      }
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
  await page.goto("/generate");
  await page.locator("button[data-generator-mode=advanced]").click();
  return {
    calls,
    loseStartAck: () => {
      loseStartAck = true;
    },
    unknown: (value: boolean) => {
      unknownOutcome = value;
    },
    finish: (value: boolean) => {
      finish = value;
    },
    conflict: () => {
      conflict = true;
    },
    failPoll: () => {
      failPoll = true;
    },
    pause: () => {
      gate = new Promise<void>((r) => {
        release = r;
      });
    },
    release: () => {
      release();
      gate = null;
    },
  };
}
const panel = (page: Page) => page.getByTestId("music-inspiration-panel");
async function startResearch(page: Page, artist = "Mirage") {
  await panel(page).getByRole("button", { name: "Open music research", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "AI Music Inspiration", exact: true });
  await modal.getByLabel("Artist or group", { exact: true }).fill(artist);
  await modal.getByRole("button", { name: "Research", exact: true }).click();
  await modal.getByRole("button", { name: "Close", exact: true }).click();
}
async function selectProfile(page: Page) {
  await panel(page).getByRole("combobox", { name: "Saved inspiration profiles" }).click();
  await page.getByRole("option", { name: "Saved offline profile", exact: true }).click();
}

for (const artist of ["Mirage", "Ласковый май", "Кино"]) {
  test(`offline research, evidence and direct apply: ${artist}`, async ({ page }) => {
    const f = await fixture(page);
    await startResearch(page, artist);
    await expect(panel(page).getByText("Research completed", { exact: true })).toBeVisible();
    await panel(page).getByRole("button", { name: "Apply to empty fields" }).click();
    await expect(panel(page).getByText(/^Applied fields:/)).toBeVisible();
    await panel(page).getByRole("button", { name: "Preview", exact: true }).click();
    await expect(
      panel(page).getByText("The original tempo is unknown.", { exact: true }),
    ).toBeVisible();
    await expect(
      panel(page).getByRole("link", { name: "Offline album credits" }).first(),
    ).toHaveAttribute("href", "https://example.org/credits");
    expect(f.calls.filter((c) => c.name.includes("startMusicInspiration"))).toHaveLength(1);
    expect(
      f.calls.filter((c) => c.name.includes("getMusicInspirationJob")).length,
    ).toBeGreaterThanOrEqual(2);
  });
}
test("missing verified pricing blocks research but saved profiles reuse without AI", async ({
  page,
}) => {
  const f = await fixture(page, { configured: false });
  await expect(panel(page).getByText(/verified model pricing.*missing/)).toBeVisible();
  await selectProfile(page);
  await panel(page).getByRole("button", { name: "Apply to empty fields" }).click();
  await expect(panel(page).getByText(/^Applied fields:/)).toBeVisible();
  expect(f.calls.some((c) => c.name.includes("startMusicInspiration"))).toBe(false);
  await panel(page).getByRole("button", { name: "Open music research" }).click();
  const modal = page.getByRole("dialog", { name: "AI Music Inspiration", exact: true });
  await expect(modal.getByRole("button", { name: "Research", exact: true })).toBeDisabled();
  await expect(modal.getByText(/Maximum research budget/)).toHaveCount(0);
});
test("non-admin sees server default and no extended or override picker", async ({ page }) => {
  await fixture(page);
  await panel(page).getByRole("button", { name: "Open music research" }).click();
  const modal = page.getByRole("dialog", { name: "AI Music Inspiration", exact: true });
  await expect(modal.getByText("Research model: server-live-default", { exact: true })).toHaveCount(
    0,
  );
  await expect(modal.getByRole("combobox", { name: "Research model" })).toHaveCount(0);
  await expect(modal.getByRole("combobox", { name: "Research depth" })).toHaveCount(0);
  await expect(modal.locator("select")).toHaveCount(0);
});
test("super-admin uses allowed compact selectors and free description", async ({ page }) => {
  const f = await fixture(page, { superAdmin: true });
  await panel(page).getByRole("button", { name: "Open music research" }).click();
  const modal = page.getByRole("dialog", { name: "AI Music Inspiration", exact: true });
  for (const [name, option] of [
    ["Research mode", "Free description"],
    ["Research depth", "Extended"],
    ["Research model", "Allowed override"],
  ]) {
    await modal.getByRole("combobox", { name, exact: true }).selectOption({
      label: option,
    });
  }
  await modal
    .getByLabel("Describe the music")
    .fill("Warm electronic music with a sparse verse and bright chorus");
  await modal.getByRole("button", { name: "Research", exact: true }).click();
  await expect
    .poll(() => f.calls.filter((c) => c.name.includes("startMusicInspiration")).length)
    .toBe(1);
  const data = f.calls.find((c) => c.name.includes("startMusicInspiration"))!.data;
  expect(data.modelOverride).toBe("allowed-override");
  expect(data.request).toMatchObject({ kind: "description", depth: "extended" });
});
test("selective replacement requires confirmation; undo preserves later manual production", async ({
  page,
}) => {
  await fixture(page);
  const production = page.getByRole("textbox", {
    name: "Production Style",
    exact: true,
    includeHidden: true,
  });
  await production.fill("Manual production");
  await selectProfile(page);
  await panel(page).getByRole("button", { name: "Apply to empty fields" }).click();
  await expect(production).toHaveValue("Manual production");
  await panel(page).getByRole("button", { name: "Preview", exact: true }).click();
  for (const name of [
    "Music styles",
    "Moods",
    "Instruments",
    "Tempo (BPM)",
    "Additional instructions",
    "Structure, Blueprint and energy",
  ])
    await panel(page).getByRole("checkbox", { name, exact: true }).uncheck();
  await panel(page).getByRole("button", { name: "Replace selected fields" }).click();
  await expect(production).toHaveValue("Manual production");
  await page.getByRole("button", { name: "Confirm replacement", exact: true }).click();
  await expect(production).toHaveValue("Offline warm synth proposal");
  await production.fill("Later manual production");
  await panel(page).getByRole("button", { name: "Undo inspiration" }).click();
  await expect(production).toHaveValue("Later manual production");
  await expect(panel(page).getByText(/Later manual edits preserved: Production/)).toBeVisible();
});
test("saved profile CRUD sends current revision and deletion is explicit", async ({ page }) => {
  const f = await fixture(page);
  await startResearch(page);
  await expect(panel(page).getByText("Research completed", { exact: true })).toBeVisible();
  await panel(page).getByLabel("Profile name", { exact: true }).fill("New offline profile");
  await panel(page).getByRole("button", { name: "Save completed research" }).click();
  await expect(
    panel(page).getByRole("combobox", { name: "Saved inspiration profiles" }),
  ).toHaveText("New offline profile");
  await panel(page).getByLabel("Profile name", { exact: true }).fill("Renamed offline profile");
  await panel(page).getByRole("button", { name: "Rename profile" }).click();
  await expect(
    panel(page).getByRole("combobox", { name: "Saved inspiration profiles" }),
  ).toHaveText("Renamed offline profile");
  await panel(page).getByRole("button", { name: "Update profile from completed research" }).click();
  await expect
    .poll(() => f.calls.filter((c) => c.name.includes("updateMusicInspirationProfile")).length)
    .toBe(2);
  await expect(
    panel(page).getByRole("button", { name: "Delete profile", exact: true }),
  ).toBeEnabled();
  await panel(page).getByRole("button", { name: "Delete profile", exact: true }).click();
  expect(f.calls.some((c) => c.name.includes("deleteMusicInspirationProfile"))).toBe(false);
  await page.getByRole("button", { name: "Confirm deletion", exact: true }).click();
  await expect
    .poll(() => f.calls.filter((c) => c.name.includes("deleteMusicInspirationProfile")).length)
    .toBe(1);
  expect(f.calls.find((c) => c.name.includes("deleteMusicInspirationProfile"))!.data.revision).toBe(
    3,
  );
});
test("revision conflict preserves the saved profile and current manual values", async ({
  page,
}) => {
  const f = await fixture(page);
  await selectProfile(page);
  f.conflict();
  await panel(page).getByLabel("Profile name", { exact: true }).fill("Conflicting rename");
  await panel(page).getByRole("button", { name: "Rename profile" }).click();
  await expect(panel(page).getByRole("alert")).toContainText("another device");
  await expect(
    panel(page).getByRole("combobox", { name: "Saved inspiration profiles" }),
  ).toHaveText("Saved offline profile");
});
test("cancelled research cannot apply a late polling result", async ({ page }) => {
  const f = await fixture(page);
  f.finish(false);
  await startResearch(page);
  await expect(panel(page).getByRole("button", { name: "Cancel research" })).toBeEnabled();
  f.pause();
  await panel(page).getByRole("button", { name: "Cancel research" }).click();
  await expect(panel(page).getByText("Research cancelled", { exact: true })).toBeVisible();
  f.finish(true);
  f.release();
  await expect(panel(page).getByRole("button", { name: "Apply to empty fields" })).toHaveCount(0);
});
test("poll failure reports a real error and preserves manual edits", async ({ page }) => {
  const f = await fixture(page);
  f.failPoll();
  await startResearch(page);
  await expect(panel(page).getByRole("alert")).toContainText(
    "Research status could not be checked.",
  );
  await expect(panel(page).getByRole("button", { name: "Apply to empty fields" })).toHaveCount(0);
});
test("partial result labels limitations", async ({ page }) => {
  await fixture(page, { partial: true });
  await startResearch(page);
  await expect(panel(page).getByText(/Partial research/)).toBeVisible();
  await panel(page).getByRole("button", { name: "Preview", exact: true }).click();
  await expect(panel(page).getByText("The original tempo is unknown.")).toBeVisible();
});
test("Greek resources, keyboard dropdown, mobile layout and accessibility", async ({ page }) => {
  await fixture(page, { greek: true });
  const picker = panel(page).getByRole("combobox", { name: "Αποθηκευμένα προφίλ έμπνευσης" });
  await picker.focus();
  await picker.press("ArrowDown");
  await page.getByRole("option", { name: "Saved offline profile", exact: true }).focus();
  await page.keyboard.press("Enter");
  await panel(page).getByRole("button", { name: "Προεπισκόπηση", exact: true }).click();
  await expect(panel(page).getByText("Πηγές", { exact: true })).toBeVisible();
  await expect(panel(page).locator("select")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const violations = (
    await new AxeBuilder({ page }).include('[data-testid="music-inspiration-panel"]').analyze()
  ).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(violations).toEqual([]);
});
test("denied account cannot open research or read saved profiles", async ({ page }) => {
  const f = await fixture(page, { allowed: false });
  await expect(
    page.getByText("Music Inspiration is unavailable for this account.", { exact: true }),
  ).toBeVisible();
  expect(
    f.calls.some(
      (c) =>
        c.name.includes("listMusicInspirationProfiles") ||
        c.name.includes("getMusicInspirationConfig"),
    ),
  ).toBe(false);
});

test("manual edits made during server revalidation are preserved", async ({ page }) => {
  const f = await fixture(page);
  await startResearch(page);
  await expect(panel(page).getByText("Research completed", { exact: true })).toBeVisible();
  const production = page.getByRole("textbox", { name: "Production Style", exact: true });
  f.pause();
  await panel(page).getByRole("button", { name: "Apply to empty fields" }).click();
  await production.fill("Manual edit while awaiting server");
  f.release();
  await expect(panel(page).getByText(/^Applied fields:/)).toBeVisible();
  await expect(production).toHaveValue("Manual edit while awaiting server");
});

test("signing out during research discards late results and profile actions", async ({ page }) => {
  const f = await fixture(page);
  f.pause();
  await startResearch(page);
  await page.evaluate(() => {
    const key = "sb-qwlksrcsovbncmretjdt-auth-token";
    const oldValue = localStorage.getItem(key);
    localStorage.removeItem(key);
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: "SIGNED_OUT", session: null });
    channel.close();
  });
  f.release();
  await expect(page.getByTestId("music-inspiration-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Apply to empty fields" })).toHaveCount(0);
});

test("undo never reclaims a manually edited field after its value is restored (ABA)", async ({
  page,
}) => {
  await fixture(page);
  await selectProfile(page);
  await panel(page).getByRole("button", { name: "Apply to empty fields" }).click();
  const production = page.getByRole("textbox", { name: "Production Style", exact: true });
  await expect(production).toHaveValue("Offline warm synth proposal");
  await production.fill("Manual temporary edit");
  await production.fill("Offline warm synth proposal");
  await panel(page).getByRole("button", { name: "Undo inspiration" }).click();
  await expect(production).toHaveValue("Offline warm synth proposal");
  await expect(panel(page).getByText(/Later manual edits preserved: Production/)).toBeVisible();
});

test("lost start acknowledgment retries the same durable idempotency key", async ({ page }) => {
  const f = await fixture(page);
  f.loseStartAck();
  await panel(page).getByRole("button", { name: "Open music research", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "AI Music Inspiration", exact: true });
  await modal.getByLabel("Artist or group", { exact: true }).fill("Mirage");
  await modal.getByRole("button", { name: "Research", exact: true }).click();
  await expect(modal.getByRole("alert")).toBeVisible();
  await modal.getByRole("button", { name: "Retry the same research request", exact: true }).click();
  await modal.getByRole("button", { name: "Close", exact: true }).click();
  await expect(panel(page).getByText("Research completed", { exact: true })).toBeVisible();
  const starts = f.calls.filter((c) => c.name.includes("startMusicInspiration"));
  expect(starts).toHaveLength(2);
  expect(starts[0]!.data.requestId).toBe(starts[1]!.data.requestId);
  const saved = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("pb:music-inspiration-attempt:v1:bb000000-0000-4000-8000-000000000006")!,
    ),
  );
  expect(saved.requestId).toBe(starts[0]!.data.requestId);
  expect(saved.jobId).toBe("ca290000-0000-4000-8000-000000000002");
  expect(saved).not.toHaveProperty("result");
});

test("user can discard uncertain research and start a different request explicitly", async ({
  page,
}) => {
  const f = await fixture(page);
  f.loseStartAck();
  await panel(page).getByRole("button", { name: "Open music research", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "AI Music Inspiration", exact: true });
  await modal.getByLabel("Artist or group", { exact: true }).fill("Mirage");
  await modal.getByRole("button", { name: "Research", exact: true }).click();
  await expect(modal.getByRole("alert")).toBeVisible();
  await modal.getByRole("button", { name: "Discard pending request" }).click();
  await modal.getByLabel("Artist or group", { exact: true }).fill("New artist");
  await modal.getByRole("button", { name: "Research", exact: true }).click();
  const starts = f.calls.filter((call) => call.name.includes("startMusicInspiration"));
  expect(starts).toHaveLength(2);
  expect(starts[0]!.data.requestId).not.toBe(starts[1]!.data.requestId);
});

test("reload recovers a known job with reads and never starts paid research", async ({ page }) => {
  const f = await fixture(page);
  f.finish(false);
  await startResearch(page);
  await expect(
    panel(page).getByRole("button", { name: "Cancel research", exact: true }),
  ).toBeVisible();
  const starts = f.calls.filter((c) => c.name.includes("startMusicInspiration")).length;
  const reads = f.calls.filter((c) => c.name.includes("getMusicInspirationJob")).length;
  await page.reload();
  await page.locator("button[data-generator-mode=advanced]").click();
  await expect
    .poll(() => f.calls.filter((c) => c.name.includes("getMusicInspirationJob")).length)
    .toBeGreaterThan(reads);
  await expect(
    panel(page).getByRole("button", { name: "Cancel research", exact: true }),
  ).toBeVisible();
  expect(f.calls.filter((c) => c.name.includes("startMusicInspiration"))).toHaveLength(starts);
  f.finish(true);
  await panel(page)
    .getByRole("button", { name: "Refresh research status (no new research)", exact: true })
    .click();
  await expect(panel(page).getByText("Research completed", { exact: true })).toBeVisible();
  expect(f.calls.filter((c) => c.name.includes("startMusicInspiration"))).toHaveLength(starts);
});

test("unknown provider outcome offers read-only recovery without a new paid request", async ({
  page,
}) => {
  const f = await fixture(page);
  f.unknown(true);
  await startResearch(page);
  await expect(panel(page).getByText(/Provider outcome unknown/)).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Apply to empty fields" })).toHaveCount(0);
  f.unknown(false);
  await panel(page)
    .getByRole("button", { name: "Refresh research status (no new research)", exact: true })
    .click();
  await expect(panel(page).getByText("Research completed", { exact: true })).toBeVisible();
  expect(f.calls.filter((c) => c.name.includes("startMusicInspiration"))).toHaveLength(1);
});

test("another account's persisted job is never recovered or applied", async ({ page }) => {
  const f = await fixture(page);
  await startResearch(page);
  await expect(panel(page).getByText("Research completed", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const own = "pb:music-inspiration-attempt:v1:bb000000-0000-4000-8000-000000000006";
    const foreign = "pb:music-inspiration-attempt:v1:bb000000-0000-4000-8000-000000000099";
    localStorage.setItem(foreign, localStorage.getItem(own)!);
    localStorage.removeItem(own);
  });
  const reads = f.calls.filter((c) => c.name.includes("getMusicInspirationJob")).length;
  await page.reload();
  await page.locator("button[data-generator-mode=advanced]").click();
  await expect(
    panel(page).getByRole("button", { name: "Open music research", exact: true }),
  ).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Apply to empty fields" })).toHaveCount(0);
  expect(f.calls.filter((c) => c.name.includes("getMusicInspirationJob"))).toHaveLength(reads);
});

for (const malformed of ["profiles", "config"] as const) {
  test(`malformed ancillary ${malformed} reply cannot crash manual Generator fields`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const duplicateKeys: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        message.text().includes("Encountered two children with the same key")
      )
        duplicateKeys.push(message.text());
    });
    const f = await fixture(page, { malformed, superAdmin: true });
    await expect(panel(page).getByRole("alert")).toContainText(
      malformed === "config"
        ? "Research setup could not be loaded."
        : "Saved profiles could not be loaded.",
    );
    const production = page.getByRole("textbox", { name: "Production Style", exact: true });
    const instructions = page.getByRole("textbox", {
      name: "Additional Instructions",
      exact: true,
    });
    await production.fill("Manual production survives malformed ancillary data");
    await instructions.fill("Keep manual instructions and Blueprint");
    await expect(production).toHaveValue("Manual production survives malformed ancillary data");
    await expect(instructions).toHaveValue("Keep manual instructions and Blueprint");
    await panel(page).getByRole("button", { name: "Open music research", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "AI Music Inspiration", exact: true });
    await expect(modal).toBeVisible();
    if (malformed === "config") {
      await modal.getByLabel("Artist or group", { exact: true }).fill("Mirage");
      await expect(modal.getByRole("button", { name: "Research", exact: true })).toBeDisabled();
      await expect(
        modal.getByRole("combobox", { name: "Research model", exact: true }),
      ).toHaveCount(0);
    }
    await modal.getByRole("button", { name: "Close", exact: true }).click();
    await expect(production).toHaveValue("Manual production survives malformed ancillary data");
    await expect(instructions).toHaveValue("Keep manual instructions and Blueprint");
    expect(f.calls.some((c) => c.name.includes("startMusicInspiration"))).toBe(false);
    expect(pageErrors).toEqual([]);
    expect(duplicateKeys).toEqual([]);
  });
}
