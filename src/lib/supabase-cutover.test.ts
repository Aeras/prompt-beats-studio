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

    expect(config).toContain('process.env["EXTERNAL_SUPABASE_URL"] ?? process.env["SUPABASE_URL"]');
    expect(config).toContain('process.env["EXTERNAL_SUPABASE_PUBLISHABLE_KEY"]');
    expect(config).toContain('process.env["EXTERNAL_SUPABASE_SECRET_KEY"]');
    expect(middleware).toContain("getServerSupabasePublicConfig");
    expect(adminClient).toContain("getServerSupabaseAdminConfig");
    expect(publicClient).toContain("getServerSupabasePublicConfig");
  });

  test("tracked browser environment points to the external PromptBeats Supabase project", async () => {
    const env = await source(".env");
    expect(env).toContain('SUPABASE_PROJECT_ID="qwlksrcsovbncmretjdt"');
    expect(env).toContain('VITE_SUPABASE_PROJECT_ID="qwlksrcsovbncmretjdt"');
    expect(env).toContain('SUPABASE_URL="https://qwlksrcsovbncmretjdt.supabase.co"');
    expect(env).toContain('VITE_SUPABASE_URL="https://qwlksrcsovbncmretjdt.supabase.co"');
    expect(env).not.toContain("mncrtljdwofnkvhmctax");
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
