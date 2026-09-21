import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Help menu and Contact Us", () => {
  test("global Help menu exposes Help, Contact Us and all legal documents", async () => {
    const menu = await source("src/components/promptbeats/HelpMenu.tsx");
    expect(menu).toContain('to="/help"');
    expect(menu).toContain('to="/contact"');
    expect(menu).toContain('to="/terms"');
    expect(menu).toContain('to="/privacy"');
    expect(menu).toContain('to="/copyright-ip"');
    expect(menu).toContain("Contact Us");
    expect(menu).toContain("Επικοινωνία");
    expect(menu).toContain("Terms of Use");
    expect(menu).toContain("Privacy Policy");
    expect(menu).toContain("Copyright / IP Policy");
    expect(menu).not.toContain('aria-disabled="true"');
  });

  test("signup requires explicit legal acceptance and records the accepted version", async () => {
    const [auth, legalRegistry, migration] = await Promise.all([
      source("src/routes/auth.tsx"),
      source("src/lib/legal-documents.ts"),
      source("supabase/migrations/20260921221500_legal_acceptance_v1.sql"),
    ]);

    expect(auth).toContain('type="checkbox"');
    expect(auth).toContain('to="/terms"');
    expect(auth).toContain('to="/privacy"');
    expect(auth).toContain("!legalAccepted");
    expect(auth).toContain("terms_accepted: true");
    expect(auth).toContain("terms_version: LEGAL_VERSION");
    expect(auth).toContain("privacy_policy_version: LEGAL_VERSION");
    expect(legalRegistry).toContain('LEGAL_VERSION = "2026-09-21"');
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.legal_acceptances");
    expect(migration).toContain("record_signup_legal_acceptance_trigger");
    expect(migration).toContain("'terms_of_use'");
    expect(migration).toContain("'privacy_policy'");
  });

  test("all three bilingual legal routes are published", async () => {
    const [terms, privacy, copyright, registry] = await Promise.all([
      source("src/routes/terms.tsx"),
      source("src/routes/privacy.tsx"),
      source("src/routes/copyright-ip.tsx"),
      source("src/lib/legal-documents.ts"),
    ]);
    expect(terms).toContain('createFileRoute("/terms")');
    expect(privacy).toContain('createFileRoute("/privacy")');
    expect(copyright).toContain('createFileRoute("/copyright-ip")');
    expect(registry).toContain("terms.el.md?raw");
    expect(registry).toContain("terms.en.md?raw");
    expect(registry).toContain("privacy.el.md?raw");
    expect(registry).toContain("privacy.en.md?raw");
    expect(registry).toContain("copyright-ip.el.md?raw");
    expect(registry).toContain("copyright-ip.en.md?raw");
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
    expect(page).toContain('setEmail((current) => current || user.email || "")');
    expect(page).toContain('"@" + profile.handle');
  });

  test("signed-in contact form prefills email and alias without racing profile load", async () => {
    const contact = await source("src/routes/contact.tsx");
    expect(contact).toContain("initializedEmail");
    expect(contact).toContain("initializedAlias");
    expect(contact).toContain("setEmail((current) => current || user.email || \"\")");
    expect(contact).toContain('profile?.handle');
    expect(contact).toContain('"@" + profile.handle');
    expect(contact).toContain("profile?.artist_alias");
    expect(contact).toContain("profile?.display_name");
    expect(contact).toContain("setAlias((current) => current || preferredAlias)");
    expect(contact).not.toContain("initialized.current = true");
  });

  test("contact submission is validated and sent only server-side", async () => {
    const fn = await source("src/lib/contact.functions.ts");
    const sender = await source("src/lib/contact-email.server.ts");
    const smtp = await source("src/lib/smtp-email.server.ts");
    expect(fn).toContain("createServerFn");
    expect(fn).toContain("z.string().trim().email().max(254)");
    expect(fn).toContain("MAX_SENDS_PER_WINDOW = 3");
    expect(fn).toContain("website.trim()");
    expect(fn).toContain('await import("@/lib/contact-email.server")');
    expect(sender).toContain('sendSmtpEmail');
    expect(sender).toContain('"support@promptbeats.app"');
    expect(sender).toContain("replyTo: payload.email");
    expect(sender).toContain("escapeHtml");
    expect(smtp).toContain('process.env["SMTP_PASSWORD"]');
    expect(smtp).toContain('"mail.promptbeats.app"');
    expect(smtp).toContain('"no-reply@promptbeats.app"');
    expect(smtp).toContain('"AUTH LOGIN');
    expect(smtp).toContain('rejectUnauthorized: true');
  });

  test("all PromptBeats custom transactional email uses Polar55 SMTP, not Lovable Email or Resend", async () => {
    const [welcome, emailFns, contact, contactFns, smtp, webhook, preview] = await Promise.all([
      source("src/lib/welcome-email.server.ts"),
      source("src/lib/email.functions.ts"),
      source("src/lib/contact-email.server.ts"),
      source("src/lib/contact.functions.ts"),
      source("src/lib/smtp-email.server.ts"),
      source("src/routes/lovable/email/auth/webhook.ts"),
      source("src/routes/lovable/email/auth/preview.ts"),
    ]);

    for (const file of [welcome, emailFns, contact, contactFns, smtp]) {
      expect(file).not.toContain("RESEND_API_KEY");
      expect(file).not.toContain("api.resend.com");
      expect(file).not.toContain("sendLovableEmail");
      expect(file).not.toContain("LOVABLE_API_KEY");
    }

    expect(welcome).toContain("sendWelcomeEmailViaSmtp");
    expect(contact).toContain("sendContactEmailViaSmtp");
    expect(emailFns).toContain("sendWelcomeEmailViaSmtp");
    expect(contactFns).toContain("sendContactEmailViaSmtp");
    expect(smtp).toContain('fromEmail = process.env["SMTP_FROM_EMAIL"] ?? "no-reply@promptbeats.app"');
    expect(webhook).toContain("Lovable Email has been retired");
    expect(preview).toContain("Lovable Email has been retired");
    expect(webhook).not.toContain("@lovable.dev/email-js");
    expect(preview).not.toContain("@lovable.dev/email-js");
  });
});
