import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("PB-004 privileged RPC authorization", () => {
  test("legacy set_user_banned is no longer authenticated-callable", async () => {
    const migration = await source(
      "supabase/migrations/20261001194000_pb004_revoke_legacy_set_user_banned.sql",
    );

    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.set_user_banned(uuid, boolean)",
    );
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.set_user_banned(uuid, boolean) TO service_role",
    );
  });

  test("current application mutation path uses admin_set_user_banned", async () => {
    const [adminFunctions, moderationFunctions] = await Promise.all([
      source("src/lib/admin.functions.ts"),
      source("src/lib/moderation.functions.ts"),
    ]);

    expect(adminFunctions).toContain('rpc("admin_set_user_banned"');
    expect(moderationFunctions).toContain('"admin_set_user_banned"');
    expect(adminFunctions).not.toContain('rpc("set_user_banned"');
    expect(moderationFunctions).not.toContain('"set_user_banned"');
  });
});
