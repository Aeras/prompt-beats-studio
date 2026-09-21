import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Supabase Auth branded email templates", () => {
  const templates = [
    "confirmation.html",
    "recovery.html",
    "magic-link.html",
    "invite.html",
    "email-change.html",
    "reauthentication.html",
  ];

  test("all canonical auth email templates exist and carry PromptBeats branding", async () => {
    for (const name of templates) {
      const html = await source(`supabase/email-templates/${name}`);
      expect(html).toContain("PromptBeats");
      expect(html).toContain("https://promptbeats.app/email-logo");
      expect(html).toContain("https://promptbeats.app/terms");
      expect(html).toContain("https://promptbeats.app/privacy");
      expect(html).toContain("https://promptbeats.app/copyright-ip");
      expect(html).toContain("support@promptbeats.app");
      expect(html).toContain("background:#09090b");
    }
  });

  test("link-based auth templates preserve Supabase confirmation URLs", async () => {
    for (const name of ["confirmation.html", "recovery.html", "magic-link.html", "invite.html", "email-change.html"]) {
      const html = await source(`supabase/email-templates/${name}`);
      expect(html).toContain("{{ .ConfirmationURL }}");
    }
  });

  test("reauthentication preserves the Supabase verification token", async () => {
    const html = await source("supabase/email-templates/reauthentication.html");
    expect(html).toContain("{{ .Token }}");
  });

  test("email-change template preserves the new-email variable", async () => {
    const html = await source("supabase/email-templates/email-change.html");
    expect(html).toContain("{{ .NewEmail }}");
  });

  test("template manifest defines all six production subjects", async () => {
    const manifest = await source("supabase/email-templates/README.md");
    expect(manifest).toContain("Confirm your PromptBeats email");
    expect(manifest).toContain("You’re invited to PromptBeats");
    expect(manifest).toContain("Your PromptBeats sign-in link");
    expect(manifest).toContain("Confirm your new PromptBeats email");
    expect(manifest).toContain("Reset your PromptBeats password");
    expect(manifest).toContain("Your PromptBeats verification code");
  });
});
