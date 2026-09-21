import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("External Supabase cutover", () => {
  test("runtime Supabase clients prefer the external project on the server", async () => {
    const [middleware, adminClient, publicClient, browserClient] = await Promise.all([
      source("src/integrations/supabase/auth-middleware.ts"),
      source("src/integrations/supabase/client.server.ts"),
      source("src/lib/supabase-public.server.ts"),
      source("src/integrations/supabase/client.ts"),
    ]);

    expect(middleware).toContain("EXTERNAL_SUPABASE_URL");
    expect(middleware).toContain("EXTERNAL_SUPABASE_PUBLISHABLE_KEY");
    expect(adminClient).toContain("EXTERNAL_SUPABASE_URL");
    expect(adminClient).toContain("EXTERNAL_SUPABASE_SECRET_KEY");
    expect(publicClient).toContain("EXTERNAL_SUPABASE_URL");
    expect(publicClient).toContain("EXTERNAL_SUPABASE_PUBLISHABLE_KEY");
    expect(browserClient).toContain("EXTERNAL_SUPABASE_URL");
    expect(browserClient).toContain("EXTERNAL_SUPABASE_PUBLISHABLE_KEY");

    expect(middleware.indexOf("EXTERNAL_SUPABASE_URL")).toBeLessThan(middleware.indexOf("process.env['SUPABASE_URL']"));
    expect(middleware.indexOf("EXTERNAL_SUPABASE_PUBLISHABLE_KEY")).toBeLessThan(middleware.indexOf("process.env['SUPABASE_PUBLISHABLE_KEY']"));
    expect(adminClient.indexOf("EXTERNAL_SUPABASE_URL")).toBeLessThan(adminClient.indexOf("process.env['SUPABASE_URL']"));
    expect(publicClient.indexOf('EXTERNAL_SUPABASE_URL')).toBeLessThan(publicClient.indexOf('process.env["SUPABASE_URL"]'));
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
