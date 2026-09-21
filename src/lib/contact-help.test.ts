import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Help menu and Contact Us", () => {
  test("global Help menu exposes Contact Us and keeps future items disabled", async () => {
    const menu = await source("src/components/promptbeats/HelpMenu.tsx");
    expect(menu).toContain('to="/contact"');
    expect(menu).toContain("Contact Us");
    expect(menu).toContain("Επικοινωνία");
    expect(menu).toContain("Terms of Use");
    expect(menu).toContain("Privacy Policy");
    expect(menu).toContain('aria-disabled="true"');
  });

  test("Help icon is always visible and is last after authenticated utility icons", async () => {
    const shell = await source("src/components/promptbeats/AppShell.tsx");
    const cases = shell.indexOf("<ModerationCaseCenter");
    const notifications = shell.indexOf("<NotificationCenter");
    const help = shell.indexOf("<HelpMenu");
    expect(cases).toBeGreaterThan(-1);
    expect(notifications).toBeGreaterThan(cases);
    expect(help).toBeGreaterThan(notifications);
    expect(shell).toContain('{authenticated && <ModerationCaseCenter />}');
    expect(shell).toContain('{authenticated && <NotificationCenter />}');
    expect(shell).not.toContain('{authenticated && <HelpMenu />}');
  });

  test("Contact page has the required fields and controls", async () => {
    const page = await source("src/routes/contact.tsx");
    expect(page).toContain('createFileRoute("/contact")');
    expect(page).toContain('type="email"');
    expect(page).toContain("Ψευδώνυμο");
    expect(page).toContain("Θέμα");
    expect(page).toContain("Κείμενο");
    expect(page).toContain("Εκκαθάριση φόρμας");
    expect(page).toContain("Clear form");
    expect(page).toContain("Ακύρωση");
    expect(page).toContain("Cancel");
    expect(page).toContain("Αποστολή");
    expect(page).toContain("Send");
    expect(page).toContain('navigate({ to: "/" })');
    expect(page).toContain('setEmail(user.email)');
    expect(page).toContain('setAlias("@" + profile.handle)');
  });

  test("contact submission is validated and sent only server-side", async () => {
    const fn = await source("src/lib/contact.functions.ts");
    const sender = await source("src/lib/contact-email.server.ts");
    expect(fn).toContain("createServerFn");
    expect(fn).toContain("z.string().trim().email().max(254)");
    expect(fn).toContain("MAX_SENDS_PER_WINDOW = 3");
    expect(fn).toContain("website.trim()");
    expect(fn).toContain('await import("@/lib/contact-email.server")');
    expect(sender).toContain('process.env["RESEND_API_KEY"]');
    expect(sender).toContain('"support@promptbeats.app"');
    expect(sender).toContain("reply_to: payload.email");
    expect(sender).toContain('"PromptBeats <no-reply@promptbeats.app>"');
    expect(sender).toContain("escapeHtml");
  });
});
