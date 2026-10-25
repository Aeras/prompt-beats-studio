import { describe, expect, test } from "bun:test";

describe("Private Review hard delete safety", () => {
  test("migration requires ownership, finished status, child cascades and explicit RPC grants", async () => {
    const sql = await Bun.file("supabase/migrations/20261025132100_private_review_finished_hard_delete.sql").text();
    expect(sql).toContain("v_session.owner_id <> (SELECT auth.uid())");
    expect(sql).toContain("v_session.closed_at IS NULL AND v_session.expires_at > statement_timestamp()");
    expect(sql).toContain("v_active <> 0");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("DELETE FROM public.private_review_sessions");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.delete_finished_private_review_session(uuid) FROM PUBLIC, anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.delete_finished_private_review_track(uuid) FROM PUBLIC, anon");
  });

  test("individual and whole-track delete controls cannot be used for active reviews", async () => {
    const panel = await Bun.file("src/components/promptbeats/PrivateReviewsLibraryPanel.tsx").text();
    const manager = await Bun.file("src/components/promptbeats/PrivateReviewManager.tsx").text();
    expect(panel).toContain("!active &&");
    expect(manager).toContain('session.state === "closed" || session.state === "expired"');
    expect(panel).toContain("deleteFinishedPrivateReviewTrack");
    expect(manager).toContain("deleteFinishedPrivateReviewSession");
    expect(panel).toContain("queryClient.invalidateQueries");
    expect(manager).toContain("queryClient.invalidateQueries");
  });

  test("the existing expandable song-row layout is retained", async () => {
    const source = await Bun.file("src/components/promptbeats/PrivateReviewsLibraryPanel.tsx").text();
    expect(source).toContain("aria-expanded={selectedTrackId === track.id}");
    expect(source).toContain("historyOnly");
    expect(source).toContain("inline");
    expect(source).toContain("tracks.map((track)");
  });
});
