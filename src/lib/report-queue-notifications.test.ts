import { describe, expect, test } from "bun:test";

const migrationPath = "supabase/migrations/20260922013000_reports_queue_notifications_fix.sql";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Report queue reliability + staff notifications", () => {
  test("report notifications extend the existing notification contract safely", async () => {
    const sql = await source(migrationPath);
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.content_reports(id) ON DELETE SET NULL");
    expect(sql).toContain("CHECK (type IN ('new_track','new_follower','new_report'))");
    expect(sql).toContain("type='new_report' AND report_id IS NOT NULL");
    expect(sql).toContain("'new_report:'||v_report_id::text||':'||ur.user_id::text");
    expect(sql).toContain("public.app_role_rank(ur.role::text)>=2");
    expect(sql).toContain("public.can_use_feature(ur.user_id,'notifications')");
  });

  test("existing active reports are backfilled into staff notifications", async () => {
    const sql = await source(migrationPath);
    expect(sql).toContain("WHERE r.status IN ('open','under_review')");
    expect(sql).toContain("'new_report:'||r.id::text||':'||ur.user_id::text");
    expect(sql).toContain("ON CONFLICT(event_key) DO NOTHING");
  });

  test("report queue uses service-only RPCs that still validate the staff actor", async () => {
    const sql = await source(migrationPath);
    expect(sql).toContain("FUNCTION public.list_content_reports_for_staff");
    expect(sql).toContain("FUNCTION public.get_content_report_for_staff");
    expect(sql).toContain("public.app_role_rank(ur.role::text)>=2");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.list_content_reports_for_staff(uuid,text) FROM PUBLIC,anon,authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.list_content_reports_for_staff(uuid,text) TO service_role");

    const server = await source("src/lib/content-reports.functions.ts");
    expect(server).toContain('rpc("list_content_reports_for_staff"');
    expect(server).toContain("_actor_id: context.userId");
    expect(server).toContain("Report queue request timed out.");
    expect(server).toContain('rpc("get_content_report_for_staff"');
  });

  test("staff bell exposes new_report and deep-links to the report queue", async () => {
    const server = await source("src/lib/follow-notifications.functions.ts");
    const ui = await source("src/components/promptbeats/NotificationCenter.tsx");
    const management = await source("src/routes/management.tsx");
    const reports = await source("src/components/promptbeats/ReportsManagementPanel.tsx");

    expect(server).toContain('"new_track" | "new_follower" | "new_report"');
    expect(server).toContain("report_id");
    expect(server).toContain('from("content_reports")');
    expect(ui).toContain('item.type === "new_report"');
    expect(ui).toContain("/management?section=reports&reportId=");
    expect(management).toContain('params.get("reportId")');
    expect(management).toContain('setSection("reports")');
    expect(reports).toContain("initialReportId");
  });

  test("report queue stops retry loops and surfaces failures instead of loading forever", async () => {
    const reports = await source("src/components/promptbeats/ReportsManagementPanel.tsx");
    expect(reports).toContain("retry: false");
    expect(reports).toContain("isError");
    expect(reports).toContain('t("management.reportsError")');
  });
});
