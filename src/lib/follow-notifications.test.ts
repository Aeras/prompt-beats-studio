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
