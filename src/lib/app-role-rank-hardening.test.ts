import { describe, expect, test } from "bun:test";

describe("app_role_rank search_path hardening", () => {
  // Behavior guard: hardening must not change the existing role ordering.
  test("keeps the role ranking unchanged and pins search_path", async () => {
    const sql = await Bun.file(
      "supabase/migrations/20260921080000_harden_app_role_rank_search_path.sql",
    ).text();
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.app_role_rank(_role text)");
    expect(sql).toContain("IMMUTABLE");
    expect(sql).toContain("PARALLEL SAFE");
    expect(sql).toContain("SET search_path = pg_catalog");
    expect(sql).toContain("WHEN 'super_admin' THEN 5");
    expect(sql).toContain("WHEN 'admin' THEN 4");
    expect(sql).toContain("WHEN 'senior_moderator' THEN 3");
    expect(sql).toContain("WHEN 'moderator' THEN 2");
    expect(sql).toContain("ELSE 1");
  });
});
