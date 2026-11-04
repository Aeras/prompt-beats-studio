import { test, expect } from "@playwright/test";
import {
  prepareOfflineAtlasPilot,
  previewOfflineAtlasCandidate,
} from "../src/lib/atlas-candidate-preview.offline";
import { renderAtlasCandidatePreviewHtml } from "../src/lib/atlas-candidate-view.offline";

for (const locale of ["el", "en"] as const) {
  test(`offline candidate exact preview, keyboard and containment: ${locale}`, async ({ page }) => {
    const f = prepareOfflineAtlasPilot("ATLAS-OFFLINE-09");
    const p = previewOfflineAtlasCandidate(f.text, f.request, {
      mode: "offline",
      permission: "local-review",
      actorId: "browser-reviewer",
    });
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.setContent(renderAtlasCandidatePreviewHtml(p, locale));
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator(".diff article").nth(0).locator("pre")).toHaveText(p.diff[0]!.before);
    await expect(page.locator(".diff article").nth(1).locator("pre")).toHaveText(p.diff[0]!.after);
    const summary = page.locator("summary").first();
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("details").first()).toHaveAttribute("open", "");
    const full = page.locator("details").first().locator("pre");
    await full.focus();
    await page.keyboard.press("End");
    await expect(full).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.locator("aside").last().scrollIntoViewIfNeeded();
    await expect(page.locator("aside").last()).toBeVisible();
    expect(requests).toEqual([]);
  });
}
