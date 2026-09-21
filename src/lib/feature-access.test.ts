import { describe, expect, test } from "bun:test";

const phaseB = "supabase/migrations/20260921070000_feature_access_phase_b.sql";
const followEnforcement = "supabase/migrations/20260921070100_feature_access_follow_notifications.sql";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Feature Access Phase B", () => {
  test("registry seeds only approved production features and preserves current availability", async () => {
    const sql = await source(phaseB);
    for (const key of ["smart_presets","export_center","follow_creators","notifications"]) {
      expect(sql).toContain(`('${key}'`);
    }
    expect(sql.match(/'everyone'/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(sql).not.toContain("lyrics_workspace");
    expect(sql).not.toContain("song_analyzer");
  });

  test("policy supports exactly the four canonical access modes", async () => {
    const sql = await source(phaseB);
    expect(sql).toContain("access_mode IN ('disabled','admins_only','selected_users','everyone')");
  });

  test("policy and allowlist tables are not client-writable", async () => {
    const sql = await source(phaseB);
    expect(sql).toContain("REVOKE ALL ON public.feature_access_policies FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("REVOKE ALL ON public.feature_access_users FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT ALL ON public.feature_access_policies TO service_role");
    expect(sql).toContain("GRANT ALL ON public.feature_access_users TO service_role");
  });

  test("canonical feature authorization enforces all four modes", async () => {
    const sql = await source(phaseB);
    expect(sql).toContain("v_mode='disabled'");
    expect(sql).toContain("v_mode='everyone'");
    expect(sql).toContain("v_mode='admins_only'");
    expect(sql).toContain("public._is_admin_level_internal(_user_id)");
    expect(sql).toContain("v_mode='selected_users'");
    expect(sql).toContain("FROM public.feature_access_users");
  });

  test("selected users does not implicitly grant Admin or Super Admin feature usage", async () => {
    const sql = await source(phaseB);
    const start = sql.indexOf("IF v_mode='selected_users'");
    const end = sql.indexOf("END IF;", start);
    const block = sql.slice(start, end + 7);
    expect(block).toContain("feature_access_users");
    expect(block).not.toContain("_is_admin_level_internal");
    expect(block).not.toContain("current_user_is_super_admin");
  });

  test("only Super Admin can manage Feature Access policies and allowlists", async () => {
    const sql = await source(phaseB);
    for (const fn of [
      "feature_access_list",
      "feature_access_selected_users",
      "feature_access_search_users",
      "feature_access_set_policy",
      "feature_access_add_user",
      "feature_access_remove_user",
    ]) {
      const at = sql.indexOf(`FUNCTION public.${fn}`);
      expect(at).toBeGreaterThan(-1);
      expect(sql.slice(at, at + 1800)).toContain("current_user_is_super_admin()");
    }
  });

  test("selected user add/remove is database-idempotent", async () => {
    const sql = await source(phaseB);
    expect(sql).toContain("ON CONFLICT(feature_key,user_id) DO NOTHING");
    expect(sql).toContain("v_inserted:=FOUND");
    expect(sql).toContain("v_removed:=FOUND");
  });

  test("Feature Access mutations are audited in the existing audit log", async () => {
    const sql = await source(phaseB);
    expect(sql).toContain("UPDATE_FEATURE_ACCESS_POLICY");
    expect(sql).toContain("ADD_FEATURE_ACCESS_USER");
    expect(sql).toContain("REMOVE_FEATURE_ACCESS_USER");
    expect(sql).toContain("'previous_access_mode',v_old");
    expect(sql).toContain("'new_access_mode',_access_mode");
  });

  test("Follow RPCs enforce follow_creators and notification fanout enforces notifications", async () => {
    const sql = await source(followEnforcement);
    expect(sql).toContain("current_user_can_use_feature('follow_creators')");
    expect(sql).toContain("can_use_feature(_target_user_id,'notifications')");
    expect(sql).toContain("can_use_feature(f.follower_user_id,'notifications')");
  });

  test("Notification direct table access is also policy-gated", async () => {
    const sql = await source(followEnforcement);
    expect(sql).toContain("recipient_user_id = auth.uid()");
    expect(sql).toContain("current_user_can_use_feature('notifications')");
    expect(sql).toContain("user_id = auth.uid()");
  });

  test("server functions protect Export, Follow and Notifications", async () => {
    const exportFns = await source("src/lib/export-center.functions.ts");
    expect(exportFns.match(/requireFeatureAccess\(context\.supabase, "export_center"\)/g)?.length).toBe(2);

    const socialFns = await source("src/lib/follow-notifications.functions.ts");
    expect(socialFns).toContain('requireFeatureAccess(context.supabase, "follow_creators")');
    expect(socialFns).toContain('requireFeatureAccess(context.supabase, "notifications")');
  });

  test("production feature UI uses the canonical availability hook", async () => {
    const files = {
      smart_presets: "src/components/promptbeats/SmartPresetsPanel.tsx",
      export_center: "src/components/promptbeats/ExportControl.tsx",
      follow_creators: "src/components/promptbeats/FollowCreatorControl.tsx",
      notifications: "src/components/promptbeats/NotificationCenter.tsx",
    } as const;
    for (const [key, path] of Object.entries(files)) {
      const code = await source(path);
      expect(code).toContain(`useFeatureAccess("${key}")`);
      expect(code).toContain("featureAccess.allowed");
    }
  });

  test("Feature Access navigation and panel are Super Admin-only", async () => {
    const ui = await source("src/routes/management.tsx");
    expect(ui).toContain('isSuperAdmin ? [["features"');
    expect(ui).toContain('isSuperAdmin && section === "features"');
    expect(ui).toContain("<FeatureAccessPanel />");
  });

  test("management server functions re-check Super Admin instead of trusting UI", async () => {
    const code = await source("src/lib/feature-access.functions.ts");
    expect(code).toContain('supabase.rpc("current_user_is_super_admin")');
    expect(code).toContain("await requireSuperAdmin(context.supabase)");
  });

  test("Feature Access strings are present in both supported UI languages", async () => {
    const en = await source("src/i18n/locales/en-final.ts");
    const el = await source("src/i18n/locales/el-final.ts");
    for (const key of [
      "management.featureAccess",
      "management.featureModeDisabled",
      "management.featureModeAdmins",
      "management.featureModeSelected",
      "management.featureModeEveryone",
    ]) {
      expect(en).toContain(`"${key}"`);
      expect(el).toContain(`"${key}"`);
    }
  });
});
