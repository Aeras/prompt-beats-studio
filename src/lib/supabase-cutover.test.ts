import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("External Supabase cutover", () => {
  test("runtime Supabase server clients share one external-first configuration contract", async () => {
    const [config, middleware, adminClient, publicClient] = await Promise.all([
      source("src/integrations/supabase/config.server.ts"),
      source("src/integrations/supabase/auth-middleware.ts"),
      source("src/integrations/supabase/client.server.ts"),
      source("src/lib/supabase-public.server.ts"),
    ]);

    expect(config).toContain('process.env["EXTERNAL_SUPABASE_URL"]');
    expect(config).toContain('process.env["SUPABASE_URL"]');
    expect(config).toContain('process.env["EXTERNAL_SUPABASE_PUBLISHABLE_KEY"]');
    expect(config).toContain("PREVIEW_FALLBACK_SUPABASE_URL");
    expect(config).toContain("PREVIEW_FALLBACK_SUPABASE_PUBLISHABLE_KEY");
    expect(config).toContain('process.env["EXTERNAL_SUPABASE_SECRET_KEY"]');
    expect(config).toContain('process.env["SUPABASE_SERVICE_ROLE_KEY"]');
    expect(middleware).toContain("getServerSupabasePublicConfig");
    expect(adminClient).toContain("getServerSupabaseAdminConfig");
    expect(publicClient).toContain("getServerSupabasePublicConfig");
  });

  test("public preview fallback never weakens the admin secret contract", async () => {
    const config = await source("src/integrations/supabase/config.server.ts");

    expect(config).toContain("PREVIEW_FALLBACK_SUPABASE_PUBLISHABLE_KEY");
    expect(config).toContain("Missing Supabase environment variable: EXTERNAL_SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.");
    expect(config).not.toContain("PREVIEW_FALLBACK_SUPABASE_SECRET_KEY");
  });

  test("repository documents environment keys without coupling tests to production values", async () => {
    const [example, gitignore] = await Promise.all([source(".env.example"), source(".gitignore")]);

    for (const key of [
      "EXTERNAL_SUPABASE_URL",
      "EXTERNAL_SUPABASE_PUBLISHABLE_KEY",
      "EXTERNAL_SUPABASE_SECRET_KEY",
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_PROJECT_ID",
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_PROJECT_ID",
    ]) {
      expect(example).toContain(`${key}=`);
    }
    expect(example).toContain("YOUR_PROJECT_REF");
    expect(example).toContain("YOUR_SUPABASE_PUBLISHABLE_KEY");
    expect(example).toContain("YOUR_SUPABASE_SECRET_KEY");
    expect(example).not.toContain("eyJhbGciOi");
    expect(gitignore).toContain(".env\n");
    expect(gitignore).toContain(".env.*");
    expect(gitignore).toContain("!.env.example");
  });

  test("active runtime Supabase files do not hardcode the former Lovable project", async () => {
    const files = await Promise.all([
      source("src/integrations/supabase/auth-middleware.ts"),
      source("src/integrations/supabase/client.ts"),
      source("src/integrations/supabase/client.server.ts"),
      source("src/lib/supabase-public.server.ts"),
    ]);
    for (const file of files) {
      expect(file).not.toContain("mncrtljdwofnkvhmctax");
    }
  });
});
