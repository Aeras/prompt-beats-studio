import { describe, expect, test } from "bun:test";

const migrationPath = "supabase/migrations/20260922012500_report_notifications_and_queue_reliability.sql";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Report queue reliability and moderation notifications", () => {
  test("new reports fan out idempotent operational notifications to active moderation staff", async () => {
    const sql = await source(migrationPath);
    expect(sql).toContain("CHECK (type IN ('new_track', 'new_follower', 'new_report'))");
    expect(sql).toContain("'new_report:' || v_report_id::text || ':' || ur.user_id::text");
    expect(sql).toContain("public.app_role_rank(ur.role::text) >= 2");
    expect(sql).toContain("ur.moderation_status::text='active'");
    expect(sql).toContain("ON CONFLICT (event_key) DO NOTHING");
    expect(sql).not.toContain("AND public.can_use_feature(ur.user_id,'notifications')");
  });

  test("open reports are backfilled into the moderation bell", async () => {
    const sql = await source(migrationPath);
    expect(sql).toContain("WHERE r.status IN ('open','under_review')");
    expect(sql).toContain("'new_report:' || r.id::text || ':' || ur.user_id::text");
  });

  test("report notifications bypass end-user notification feature gating only for moderation staff", async () => {
    const sql = await source(migrationPath);
    expect(sql).toContain("type = 'new_report'");
    expect(sql).toContain("public.has_moderation_capability('can_view_users')");
    expect(sql).toContain("public.current_user_can_use_feature('notifications')");
  });

  test("report queue reads use service-role-only explicit actor projections", async () => {
    const sql = await source(migrationPath);
    expect(sql).toContain("FUNCTION public.list_content_reports_for_actor");
    expect(sql).toContain("FUNCTION public.get_content_report_for_actor");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.list_content_reports_for_actor(uuid,text) TO service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.get_content_report_for_actor(uuid,uuid) TO service_role");
    expect(sql).toContain("public.app_role_rank(ur.role::text)>=2");

    const server = await source("src/lib/content-reports.functions.ts");
    expect(server).toContain('import("@/integrations/supabase/client.server")');
    expect(server).toContain('"list_content_reports_for_actor"');
    expect(server).toContain('"get_content_report_for_actor"');
    expect(server).toContain("_actor: context.userId");
    expect(server).toContain("Report request timed out.");
  });

  test("report UI cannot remain in an endless loading state and deep-links report notifications", async () => {
    const reports = await source("src/components/promptbeats/ReportsManagementPanel.tsx");
    expect(reports).toContain("retry: 2");
    expect(reports).toContain("refetch");
    expect(reports).toContain("initialReportId");

    const notifications = await source("src/components/promptbeats/NotificationCenter.tsx");
    expect(notifications).toContain('item.type === "new_report"');
    expect(notifications).toContain("/management?reportId=");
    expect(notifications).toContain("moderation.canViewUsers");
    expect(notifications).toContain("preferencesEnabled={featureAccess.allowed}");

    const management = await source("src/routes/management.tsx");
    expect(management).toContain('params.get("reportId")');
    expect(management).toContain('setSection("reports")');
  });
});
