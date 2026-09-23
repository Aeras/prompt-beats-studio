import { describe, expect, test } from "bun:test";

import { privateReviewExpiryDate, privateReviewUrl } from "@/lib/private-review.shared";

const source = (path: string) => Bun.file(path).text();

describe("Private Review Links Phase 1", () => {
  test("review URLs carry only an opaque token", () => {
    const url = privateReviewUrl("opaque-token", "https://promptbeats.app/");
    expect(url).toBe("https://promptbeats.app/review/opaque-token");
    expect(url).not.toContain("lyrics=");
    expect(url).not.toContain("project=");
  });

  test("expiry helper is bounded to seven days", () => {
    const now = Date.now();
    const expiry = new Date(privateReviewExpiryDate(99)).getTime();
    expect(expiry - now).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(expiry - now).toBeLessThanOrEqual(7.01 * 24 * 60 * 60 * 1000);
  });

  test("database stores a snapshot and hashes bearer secrets", async () => {
    const sql = await source("supabase/migrations/20260923054500_private_review_links_phase1.sql");
    expect(sql).toContain("snapshot jsonb NOT NULL");
    expect(sql).toContain("token_hash text NOT NULL UNIQUE");
    expect(sql).toContain("extensions.digest(v_raw_token, 'sha256')");
    expect(sql).toContain("extensions.crypt(_pin, extensions.gen_salt('bf',10))");
    expect(sql).not.toContain(" token text NOT NULL UNIQUE");
  });

  test("visibility is immutable and supports shared/private modes", async () => {
    const sql = await source("supabase/migrations/20260923054500_private_review_links_phase1.sql");
    expect(sql).toContain("comment_visibility IN ('shared','private')");
    expect(sql).not.toContain("update_private_review_visibility");
    expect(sql).toContain("v_session.comment_visibility = 'shared' OR c.thread_reviewer_id = v_reviewer.id");
  });

  test("private mode prevents a reviewer from entering another reviewer's thread", async () => {
    const sql = await source("supabase/migrations/20260923054500_private_review_links_phase1.sql");
    expect(sql).toContain("v_parent.thread_reviewer_id <> v_reviewer.id");
    expect(sql).toContain("RAISE EXCEPTION 'comment thread unavailable'");
  });

  test("audio requires explicit linked-track selection", async () => {
    const sql = await source("supabase/migrations/20260923054500_private_review_links_phase1.sql");
    expect(sql).toContain("selected audio is not linked to this version");
    expect(sql).toContain("_shared_track_id IS NOT NULL");
    expect(sql).toContain("source_type = 'upload'");
    expect(sql).toContain("moderation_status = 'active'");
  });

  test("closed or expired sessions reject new reviewer comments", async () => {
    const sql = await source("supabase/migrations/20260923054500_private_review_links_phase1.sql");
    expect(sql).toContain("v_session.closed_at IS NOT NULL OR v_session.expires_at <= now()");
    expect(sql).toContain("SET closed_at = COALESCE(closed_at, now())");
    expect(sql).not.toContain("reopen_private_review");
  });

  test("creator dashboard supports reviewer filtering", async () => {
    const sql = await source("supabase/migrations/20260923054500_private_review_links_phase1.sql");
    const manager = await source("src/components/promptbeats/PrivateReviewManager.tsx");
    expect(sql).toContain("_reviewer_id IS NULL OR c.thread_reviewer_id=_reviewer_id");
    expect(manager).toContain("All reviewers");
    expect(manager).toContain("reviewer.commentCount");
  });

  test("reviewer page does not require PromptBeats authentication", async () => {
    const route = await source("src/routes/review.$token.tsx");
    const server = await source("src/lib/private-review.functions.ts");
    expect(route).toContain('createFileRoute("/review/$token")');
    expect(server).toContain("getPrivateReviewLinkInfo");
    expect(server).toContain("joinPrivateReviewSession");
    expect(server).not.toContain("export const joinPrivateReviewSession = createServerFn({ method: \"POST\" })\n  .middleware([requireSupabaseAuth])");
  });

  test("feature is independently controlled and Project Version History exposes the entry point", async () => {
    const access = await source("src/lib/feature-access.functions.ts");
    const history = await source("src/components/promptbeats/ProjectVersionHistory.tsx");
    expect(access).toContain('"private_review_links"');
    expect(history).toContain('useFeatureAccess("private_review_links")');
    expect(history).toContain("<PrivateReviewManager");
  });

  test("anonymous comment rate limiting is enforced server-side", async () => {
    const sql = await source("supabase/migrations/20260923054500_private_review_links_phase1.sql");
    expect(sql).toContain("created_at > now() - interval '1 minute'");
    expect(sql).toContain("IF v_recent >= 10");
  });
});
