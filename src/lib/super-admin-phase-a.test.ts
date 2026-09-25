import { describe, expect, test } from "bun:test";

const enumMigrationPath = "supabase/migrations/20260921060000_add_super_admin_role.sql";
const coreMigrationPath = "supabase/migrations/20260921060100_super_admin_core.sql";
const pathsMigrationPath = "supabase/migrations/20260921060200_super_admin_admin_paths.sql";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Super Admin Phase A", () => {
  test("adds super_admin without renaming existing app roles", async () => {
    const sql = await source(enumMigrationPath);
    expect(sql).toContain("ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin'");
    expect(sql).not.toContain("RENAME VALUE");
  });

  test("keeps exact role checks separate from canonical admin-level inheritance", async () => {
    const sql = await source(coreMigrationPath);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public._is_admin_level_internal");
    expect(sql).toContain("role::text IN ('admin','super_admin')");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.current_user_is_admin_level()");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.current_user_has_role");
  });

  test("role hierarchy ranks Super Admin above Admin", async () => {
    const sql = await source(coreMigrationPath);
    expect(sql).toContain("WHEN 'super_admin' THEN 5");
    expect(sql).toContain("WHEN 'admin' THEN 4");
    expect(sql).toContain("WHEN 'senior_moderator' THEN 3");
    expect(sql).toContain("WHEN 'moderator' THEN 2");
  });

  test("Admin cannot create or modify high roles", async () => {
    const sql = await source(coreMigrationPath);
    expect(sql).toContain("IF v_actor_role = 'admin' THEN");
    expect(sql).toContain(
      "IF v_old IN ('admin','super_admin') THEN RAISE EXCEPTION 'protected account'",
    );
    expect(sql).toContain("IF _role::text NOT IN ('user','moderator','senior_moderator')");
  });

  test("Super Admin role path supports Admin and Super Admin assignments", async () => {
    const sql = await source(coreMigrationPath);
    expect(sql).toContain("'user','moderator','senior_moderator','admin','super_admin'");
    expect(sql).toContain("ASSIGN_ADMIN_ROLE");
    expect(sql).toContain("REMOVE_ADMIN_ROLE");
    expect(sql).toContain("ASSIGN_SUPER_ADMIN_ROLE");
    expect(sql).toContain("REMOVE_SUPER_ADMIN_ROLE");
  });

  test("self-role changes stay prohibited", async () => {
    const sql = await source(coreMigrationPath);
    expect(sql).toContain(
      "IF _target_user_id = v_actor THEN RAISE EXCEPTION 'cannot change your own role'",
    );
  });

  test("last active Super Admin protection is serialized at database level", async () => {
    const sql = await source(coreMigrationPath);
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("promptbeats:super-admin-role-management");
    expect(sql).toContain("v_active_super_admins <= 1");
    expect(sql).toContain("cannot remove the last active Super Admin");
  });

  test("high role audit details retain previous and new role", async () => {
    const sql = await source(coreMigrationPath);
    expect(sql).toContain("'previous_role',v_old");
    expect(sql).toContain("'new_role',_role::text");
  });

  test("public badge mapping hides the technical Super Admin label", async () => {
    const sql = await source(coreMigrationPath);
    expect(sql).toContain("ur.role::text='super_admin'");
    expect(sql).toContain("THEN 'PromptBeats Team'");
    expect(sql).toContain("ur.role::text='admin'");
    expect(sql).toContain("THEN 'Admin'");
    expect(sql).toContain("THEN 'Senior Trusted Safety Moderator'");
    expect(sql).toContain("THEN 'Trusted Safety Moderator'");
    expect(sql).not.toContain("THEN 'Super Admin'");
  });

  test("active Admin database paths inherit to Super Admin", async () => {
    const sql = await source(pathsMigrationPath);
    for (const name of [
      "admin_overview",
      "admin_list_users",
      "admin_user_detail",
      "admin_set_model_access",
      "admin_create_registration_block",
      "admin_set_creator_donations_global",
      "admin_begin_account_deletion",
      "staff_get_track",
      "staff_delete_track",
      "start_generation_job",
      "start_quality_check_job",
    ]) {
      expect(sql).toContain(`FUNCTION public.${name}`);
    }
    expect(sql).toContain("current_user_is_admin_level()");
    expect(sql).toContain("_is_admin_level_internal");
  });

  test("Admin and Super Admin account deletion remains protected", async () => {
    const sql = await source(pathsMigrationPath);
    expect(sql).toContain("public._is_admin_level_internal(_target_user_id)");
    expect(sql).toContain("public._is_admin_level_internal(v_target)");
  });

  test("management UI exposes high roles only through Super Admin option set", async () => {
    const ui = await source("src/routes/management.tsx");
    expect(ui).toContain("moderation.isSuperAdmin");
    expect(ui).toContain('["user", "moderator", "senior_moderator", "admin", "super_admin"]');
    expect(ui).toContain('["user", "moderator", "senior_moderator"]');
    expect(ui).toContain("canEditRole");
    expect(ui).toContain("management.protectedRole");
  });

  test("application Admin helpers use admin-level authorization", async () => {
    const paths = [
      "src/lib/admin.functions.ts",
      "src/lib/ai-model-admin.functions.ts",
      "src/lib/donation.functions.ts",
      "src/lib/ai-analytics.functions.ts",
      "src/lib/generation-jobs.functions.ts",
      "src/lib/song-setup-assistant.functions.ts",
      "src/lib/ai.functions.ts",
      "src/lib/song-analyzer.functions.ts",
    ];
    for (const path of paths) {
      const code = await source(path);
      expect(code).not.toMatch(/current_user_has_role[\s\S]{0,100}_role:\s*"admin"/);
    }
    const provider = await source("src/lib/ai-provider.server.ts");
    expect(provider).toContain("_is_admin_level_internal");
  });

  test("generated role types and moderation context include super_admin", async () => {
    const types = await source("src/integrations/supabase/types.ts");
    const moderation = await source("src/lib/moderation.functions.ts");
    const hook = await source("src/hooks/useModeration.ts");
    expect(types).toContain('"super_admin"');
    expect(types).toContain("current_user_is_admin_level");
    expect(moderation).toContain('"super_admin"');
    expect(hook).toContain('isSuperAdmin: data?.role === "super_admin"');
  });

  test("bootstrap identity is not hardcoded into schema migrations", async () => {
    const all = [
      await source(enumMigrationPath),
      await source(coreMigrationPath),
      await source(pathsMigrationPath),
    ].join("\n");
    expect(all.toLowerCase()).not.toContain("nikos76gr@gmail.com");
    expect(all.toLowerCase()).not.toContain("@promptbeats.app");
  });

  test("rewrites persisted staff badges before enforcing the new badge constraint", async () => {
    const sql = await source(coreMigrationPath);
    const dropConstraint = sql.indexOf("DROP CONSTRAINT IF EXISTS public_staff_badges_badge_check");
    const refreshFunction = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.refresh_public_staff_badge",
    );
    const backfill = sql.indexOf(
      "SELECT public.refresh_public_staff_badge(id) FROM public.profiles",
    );
    const addConstraint = sql.lastIndexOf("ADD CONSTRAINT public_staff_badges_badge_check");
    expect(dropConstraint).toBeGreaterThan(-1);
    expect(refreshFunction).toBeGreaterThan(dropConstraint);
    expect(backfill).toBeGreaterThan(refreshFunction);
    expect(addConstraint).toBeGreaterThan(backfill);
  });

  test("bootstrap migration promotes only the verified primary Admin", async () => {
    const sql = await source(
      "supabase/migrations/20260921060300_bootstrap_primary_super_admin.sql",
    );
    expect(sql).toContain("lower(email) = 'nikos76gr@gmail.com'");
    expect(sql).toContain("v_match_count <> 1");
    expect(sql).toContain("v_current_role <> 'admin'");
    expect(sql).toContain("'super_admin'::public.app_role");
    expect(sql).toContain("'ASSIGN_SUPER_ADMIN_ROLE'");
    expect(sql).toContain("'previous_role', 'admin'");
    expect(sql).toContain("'new_role', 'super_admin'");
    expect(sql).toContain("'bootstrap', true");
    expect(sql).toContain("refresh_public_staff_badge(v_user_id)");
    expect(sql.toLowerCase()).not.toContain("@promptbeats.app");
  });
});
