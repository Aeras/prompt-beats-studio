import { describe, expect, test } from "bun:test";

const migrationPath = "supabase/migrations/20260921010000_follow_notifications_v1.sql";

async function migrationSql() {
  return Bun.file(migrationPath).text();
}

describe("Follow + Notifications v1 architecture", () => {
  test("first_published_at is backfilled before producer triggers and protected as write-once", async () => {
    const sql = await migrationSql();
    const backfill = sql.indexOf("SET first_published_at = created_at");
    const notifyTrigger = sql.indexOf("CREATE TRIGGER tracks_first_publication_notify");
    expect(backfill).toBeGreaterThan(-1);
    expect(notifyTrigger).toBeGreaterThan(backfill);
    expect(sql).toContain("RAISE EXCEPTION 'first_published_at is write-once'");
    expect(sql).toContain("BEFORE INSERT OR UPDATE ON public.tracks");
  });

  test("new-track fan-out is set-based and database-idempotent", async () => {
    const sql = await migrationSql();
    expect(sql).toContain("INSERT INTO public.notifications");
    expect(sql).toContain("FROM public.user_follows f");
    expect(sql).toContain("ON CONFLICT DO NOTHING");
    expect(sql).toContain("event_key text NOT NULL UNIQUE");
    expect(sql).toContain("CREATE UNIQUE INDEX notifications_new_track_once_idx");
    expect(sql).toContain("(recipient_user_id, track_id, type)");
  });

  test("follow relationships reject self-follow and duplicates", async () => {
    const sql = await migrationSql();
    expect(sql).toContain("CONSTRAINT user_follows_no_self CHECK (follower_user_id <> followed_user_id)");
    expect(sql).toContain("CONSTRAINT user_follows_unique UNIQUE (follower_user_id, followed_user_id)");
    expect(sql).toContain("v_actor uuid := auth.uid()");
    expect(sql).toContain("ON CONFLICT (follower_user_id, followed_user_id) DO NOTHING");
  });

  test("new follower events are retry-safe while refollow can create a new event", async () => {
    const sql = await migrationSql();
    expect(sql).toContain("'new_follower:' || v_follow_id::text");
    expect(sql).toContain("ON CONFLICT (event_key) DO NOTHING");
    expect(sql).toContain("DELETE FROM public.user_follows");
  });

  test("notification preferences are independent and default enabled", async () => {
    const sql = await migrationSql();
    expect(sql).toContain("CREATE TABLE public.notification_preferences");
    expect(sql).toContain("new_track_enabled boolean NOT NULL DEFAULT true");
    expect(sql).toContain("new_follower_enabled boolean NOT NULL DEFAULT true");
  });

  test("deleted track targets can become unavailable without breaking notification retention", async () => {
    const sql = await migrationSql();
    expect(sql).toContain("track_id uuid REFERENCES public.tracks(id) ON DELETE SET NULL");
    expect(sql).toContain("type = 'new_track'");
    expect(sql).toContain("OR (type = 'new_follower' AND track_id IS NULL)");
  });

  test("v1 notification type constraint excludes likes and other noisy events", async () => {
    const sql = await migrationSql();
    expect(sql).toContain("type text NOT NULL CHECK (type IN ('new_track', 'new_follower'))");
  });

  test("report notification migration adds staff-only new_report events and backfills open reports", async () => {
    const sql = await Bun.file("supabase/migrations/20260921223000_report_notifications_v1.sql").text();
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.content_reports");
    expect(sql).toContain("CHECK (type IN ('new_track','new_follower','new_report'))");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.notify_staff_on_content_report()");
    expect(sql).toContain("public.app_role_rank(ur.role::text) >= 2");
    expect(sql).toContain("ur.moderation_status::text='active'");
    expect(sql).toContain("public.can_use_feature(ur.user_id,'notifications')");
    expect(sql).toContain("COALESCE(pp.is_banned,false)=false");
    expect(sql).toContain("JOIN public.profiles p ON p.id=ur.user_id");
    expect(sql).toContain("'new_report:' || NEW.id::text || ':' || ur.user_id::text");
    expect(sql).toContain("WHERE r.status IN ('open','under_review')");
    expect(sql).toContain("(type='new_track' AND report_id IS NULL)");
    expect(sql).toContain("(type='new_report' AND track_id IS NULL)");
    expect(sql).toContain("ON CONFLICT DO NOTHING");
  });

  test("notification UI supports moderation report events without exposing reporter identity", async () => {
    const server = await Bun.file("src/lib/follow-notifications.functions.ts").text();
    const ui = await Bun.file("src/components/promptbeats/NotificationCenter.tsx").text();
    expect(server).toContain('"new_track" | "new_follower" | "new_report"');
    expect(server).toContain("report_id");
    expect(server).toContain('from("content_reports")');
    expect(ui).toContain('item.type === "new_report"');
    expect(ui).toContain("/management?reportId=");
    expect(ui).toContain("Νέα αναφορά");
  });

  test("Follow control stays visible when summary refresh fails", async () => {
    const component = await Bun.file("src/components/promptbeats/FollowCreatorControl.tsx").text();
    expect(component).not.toContain("if (!user || summary.isError) return null");
    expect(component).not.toMatch(/summary\.isError[^\n]*return null/);
    expect(component).toContain('if (!user || !featureAccess.allowed) return null');
    expect(component).toContain("Ακολουθείς ✓");
    expect(component).toContain("summary.refetch()");
  });

  test("Follow and unfollow mutations verify the persisted database relation", async () => {
    const server = await Bun.file("src/lib/follow-notifications.functions.ts").text();
    expect(server).toContain('if (!summary.isFollowing) throw new Error("Follow could not be verified.")');
    expect(server).toContain('if (summary.isFollowing) throw new Error("Unfollow could not be verified.")');
  });
});
