import { describe, expect, test } from "bun:test";

const migration = "supabase/migrations/20260921110000_content_reports_explicit_lyrics_v1.sql";

async function source(path: string) {
  return Bun.file(path).text();
}

function sqlFunction(sql: string, name: string) {
  const start = sql.indexOf(`FUNCTION public.${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION public.", start + 20);
  return sql.slice(start, next === -1 ? sql.length : next);
}

describe("Reports System + Explicit Lyrics V1", () => {
  test("adds additive Explicit metadata with safe default", async () => {
    const sql = await source(migration);
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS contains_explicit_lyrics boolean NOT NULL DEFAULT false");
    expect(sql).not.toMatch(/UPDATE\s+public\.tracks\s+SET\s+contains_explicit_lyrics/i);
  });

  test("creates a protected generic report entity without broad client table access", async () => {
    const sql = await source(migration);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.content_reports");
    expect(sql).toContain("target_type text NOT NULL CHECK (target_type IN ('track'))");
    expect(sql).toContain("ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON public.content_reports FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT ALL ON public.content_reports TO service_role");
  });

  test("report categories and statuses match the canonical contract", async () => {
    const sql = await source(migration);
    for (const category of [
      "copyright_ip","hate_discrimination","harassment_threats","sexual_inappropriate",
      "impersonation","privacy_personal_info","illegal_content","spam_platform_abuse","other",
    ]) expect(sql).toContain(`'${category}'`);
    for (const status of [
      "open","under_review","resolved_action_taken","resolved_no_violation","dismissed_abuse",
    ]) expect(sql).toContain(`'${status}'`);
  });

  test("submission is authenticated, account-state checked, validates public target, and prevents self-report", async () => {
    const sql = await source(migration);
    const block = sqlFunction(sql, "submit_track_report");
    expect(block).toContain("auth.uid()");
    expect(block).toContain("has_valid_account_state(v_actor)");
    expect(block).toContain("is_published=true");
    expect(block).toContain("moderation_status='active'");
    expect(block).toContain("IF v_owner=v_actor THEN RAISE EXCEPTION 'cannot report own track'");
    expect(block).toContain("_category='other'");
    expect(block).toContain("invalid supporting url");
  });

  test("duplicate and rapid-report abuse protections are server-side", async () => {
    const sql = await source(migration);
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS content_reports_active_duplicate_idx");
    expect(sql).toContain("WHERE status IN ('open','under_review')");
    const block = sqlFunction(sql, "submit_track_report");
    expect(block).toContain("created_at > now()-interval '1 hour'");
    expect(block).toContain("v_recent_count >= 10");
    expect(block).toContain("duplicate active report");
  });

  test("report submission never automatically locks, deletes, or penalizes the track", async () => {
    const sql = await source(migration);
    const block = sqlFunction(sql, "submit_track_report");
    expect(block).not.toContain("staff_lock_track");
    expect(block).not.toContain("staff_delete_track");
    expect(block).not.toContain("UPDATE public.tracks");
    expect(block).not.toContain("DELETE FROM public.tracks");
  });

  test("report queue and detail require canonical moderator capability", async () => {
    const sql = await source(migration);
    for (const name of ["list_content_reports","get_content_report","review_content_report"]) {
      const block = sqlFunction(sql, name);
      expect(block).toContain("has_moderation_capability('can_view_users')");
    }
  });

  test("reporter identity is server-filtered to Admin level and omitted for Moderator/Senior Moderator", async () => {
    const sql = await source(migration);
    for (const name of ["list_content_reports","get_content_report"]) {
      const block = sqlFunction(sql, name);
      expect(block).toContain("v_admin_level:=public.current_user_is_admin_level()");
      expect(block).toContain("'reporter_user_id',CASE WHEN v_admin_level THEN r.reporter_user_id ELSE NULL END");
      expect(block).toContain("'reporter_email',CASE WHEN v_admin_level THEN reporter.email ELSE NULL END");
      expect(block).toContain("'reporter_handle',CASE WHEN v_admin_level THEN reporter_profile.handle ELSE NULL END");
      expect(block).toContain("jsonb_strip_nulls");
      expect(block).toContain("JOIN auth.users reporter ON reporter.id=r.reporter_user_id AND v_admin_level");
    }
  });

  test("ordinary clients cannot recover report rows by direct table reads", async () => {
    const sql = await source(migration);
    expect(sql).not.toContain("CREATE POLICY");
    expect(sql).toContain("REVOKE ALL ON public.content_reports FROM PUBLIC, anon, authenticated");
  });

  test("report review is audited without copying reporter identity into the audit log", async () => {
    const sql = await source(migration);
    const block = sqlFunction(sql, "review_content_report");
    expect(block).toContain("'REVIEW_CONTENT_REPORT'");
    expect(block).toContain("'report_id',_report_id");
    expect(block).toContain("'target_id',v_target_id");
    expect(block).toContain("'previous_status',v_old_status");
    expect(block).toContain("'new_status',_status");
    expect(block).not.toContain("reporter_email");
    expect(block).not.toContain("reporter_user_id");
  });

  test("reports survive account or track deletion for moderation/audit purposes", async () => {
    const sql = await source(migration);
    expect(sql).toContain("reporter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL");
    expect(sql).toContain("target_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL");
    expect(sql).toContain("target_title text NOT NULL");
    expect(sql.match(/LEFT JOIN public\.tracks t ON t\.id=r\.target_id/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql.match(/COALESCE\(t\.title,r\.target_title\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test("Reports tab is visible to moderator level and above, while Feature Access stays Super Admin-only", async () => {
    const ui = await source("src/routes/management.tsx");
    expect(ui).toContain('["reports", t("management.reports"), Flag]');
    expect(ui).toContain(': [["users", t("management.users"), Users], ["reports", t("management.reports"), Flag]]');
    expect(ui).toContain('section === "reports" && <ReportsManagementPanel isAdmin={isAdmin} initialReportId={search.report} />');
    expect(ui).toContain('isSuperAdmin && section === "features"');
  });

  test("Management UI only renders Reporter column for Admin-level users", async () => {
    const ui = await source("src/components/promptbeats/ReportsManagementPanel.tsx");
    expect(ui).toContain('{isAdmin && <th');
    expect(ui).toContain('t("management.reportReporter")');
    expect(ui).toContain('{isAdmin ? (');
    expect(ui).toContain('management.reportNoReporterIdentity');
  });

  test("report detail reuses canonical track moderation controls instead of duplicate moderation actions", async () => {
    const ui = await source("src/components/promptbeats/ReportsManagementPanel.tsx");
    expect(ui).toContain("TrackModerationControls");
    expect(ui).toContain("<TrackModerationControls trackId={report.target_id} />");
    expect(ui).not.toContain("lockStaffTrack");
    expect(ui).not.toContain("deleteStaffTrack");
  });

  test("Report control hides logged-out, self-report, and non-public cases", async () => {
    const ui = await source("src/components/promptbeats/ReportTrackControl.tsx");
    expect(ui).toContain("if (!user || user.id === ownerId || !isPublished) return null");
    expect(ui).toContain("submitTrackReport");
    expect(ui).toContain("confirming");
    expect(ui).toContain("report.receivedTitle");
    expect(ui).toContain("report.legalNotice");
  });

  test("canonical TrackCard keeps Prompt/Lyrics actions and adds visually separated Report control", async () => {
    const card = await source("src/components/promptbeats/TrackCard.tsx");
    expect(card).toContain("<PromptContentIcon");
    expect(card).toContain("<LyricsContentIcon");
    expect(card).toContain("<ReportTrackControl");
    expect(card).toContain('justify-between');
  });

  test("Explicit value persists through canonical create/update contracts", async () => {
    const server = await source("src/lib/tracks.functions.ts");
    expect(server).toContain("contains_explicit_lyrics: z.boolean().default(false)");
    expect(server).toContain("contains_explicit_lyrics: data.contains_explicit_lyrics");
    expect(server).toContain('.eq("user_id", context.userId)');
  });

  test("all current track creation/edit paths expose and persist Explicit declaration", async () => {
    const studio = await source("src/components/promptbeats/StudioModal.tsx");
    expect(studio).toContain("containsExplicitLyrics");
    expect(studio.match(/contains_explicit_lyrics: r\.containsExplicitLyrics/g)?.length).toBeGreaterThanOrEqual(2);
    expect(studio).toContain('t("explicit.label")');

    const owner = await source("src/components/promptbeats/TrackOwnerActions.tsx");
    expect(owner).toContain("containsExplicitLyrics");
    expect(owner).toContain("contains_explicit_lyrics: containsExplicitLyrics");
    expect(owner).toContain('t("explicit.helper")');

    const lab = await source("src/routes/ai-music-lab.tsx");
    expect(lab).toContain("saveContainsExplicitLyrics");
    expect(lab).toContain("contains_explicit_lyrics: saveContainsExplicitLyrics");
  });

  test("Explicit indicator renders across canonical public surfaces and playlists", async () => {
    for (const path of [
      "src/components/promptbeats/TrackCard.tsx",
      "src/routes/track.$id.tsx",
      "src/routes/share.$token.tsx",
      "src/components/promptbeats/PlaylistLibraryPanel.tsx",
    ]) {
      expect(await source(path)).toContain("ExplicitBadge");
    }
    const card = await source("src/components/promptbeats/TrackCard.tsx");
    expect(card).toContain("track.containsExplicitLyrics && <ExplicitBadge");
  });

  test("public projections carry Explicit metadata through Discover, Trending, creator and share paths", async () => {
    const tracks = await source("src/lib/tracks.functions.ts");
    expect(tracks).toContain("contains_explicit_lyrics");
    expect(tracks).toContain("contains_explicit_lyrics: z.boolean()");

    const profiles = await source("src/lib/profile.functions.ts");
    expect(profiles.match(/contains_explicit_lyrics/g)?.length).toBeGreaterThanOrEqual(3);

    const sql = await source(migration);
    expect(sql).toContain("contains_explicit_lyrics boolean");
    expect(sql).toContain("'contains_explicit_lyrics',v_track.contains_explicit_lyrics");
  });

  test("Explicit is informational only: no ranking penalty, automatic report, age block, or profanity detector", async () => {
    const sql = await source(migration);
    const all = [
      sql,
      await source("src/lib/tracks.functions.ts"),
      await source("src/components/promptbeats/ExplicitBadge.tsx"),
    ].join("\n");
    expect(all).not.toContain("explicit_penalty");
    expect(all).not.toContain("age_restricted");
    expect(all).not.toContain("profanity");
    expect(all).not.toContain("swear");
    expect(sqlFunction(sql, "submit_track_report")).not.toContain("contains_explicit_lyrics");
  });


  test("report queue uses service-role staff RPCs to avoid request-scoped auth drift", async () => {
    const server = await source("src/lib/content-reports.functions.ts");
    const fix = await source("supabase/migrations/20260922003000_reports_staff_notifications_fix.sql");
    expect(server).toContain('supabaseAdmin');
    expect(server).toContain('list_content_reports_for_staff');
    expect(server).toContain('get_content_report_for_staff');
    expect(fix).toContain('CREATE OR REPLACE FUNCTION public.list_content_reports_for_staff');
    expect(fix).toContain('CREATE OR REPLACE FUNCTION public.get_content_report_for_staff');
    expect(fix).toContain('REVOKE ALL ON FUNCTION public.list_content_reports_for_staff(uuid,text) FROM PUBLIC,anon,authenticated');
    expect(fix).toContain('GRANT EXECUTE ON FUNCTION public.list_content_reports_for_staff(uuid,text) TO service_role');
  });

  test("new reports create staff notifications and backfill open reports idempotently", async () => {
    const fix = await source("supabase/migrations/20260922003000_reports_staff_notifications_fix.sql");
    expect(fix).toContain("type IN ('new_track','new_follower','new_report')");
    expect(fix).toContain("CREATE TRIGGER content_reports_notify_staff");
    expect(fix).toContain("'new_report:'||NEW.id::text||':'||ur.user_id::text");
    expect(fix).toContain("r.status IN ('open','under_review')");
    expect(fix).toContain("ON CONFLICT(event_key) DO NOTHING");
    expect(fix).toContain("public.app_role_rank(ur.role::text)>=2");
  });

  test("Reporting and Explicit are not added to Feature Access", async () => {
    const access = await source("src/lib/feature-access.functions.ts");
    expect(access).not.toContain('"reporting"');
    expect(access).not.toContain('"content_reports"');
    expect(access).not.toContain('"explicit_lyrics"');
  });

  test("EN/EL strings include report categories, privacy copy, and Explicit labels", async () => {
    const en = await source("src/i18n/locales/en-final.ts");
    const el = await source("src/i18n/locales/el-final.ts");
    for (const key of [
      "report.action",
      "report.category.copyright_ip",
      "report.category.illegal_content",
      "management.reports",
      "management.reportReporter",
      "explicit.label",
      "explicit.tooltip",
    ]) {
      expect(en).toContain(`"${key}"`);
      expect(el).toContain(`"${key}"`);
    }
  });
});
