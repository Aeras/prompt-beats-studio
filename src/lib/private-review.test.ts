import { describe, expect, test } from "bun:test";

import {
  PRIVATE_REVIEW_SOURCE_TYPES,
  privateReviewExpiryDate,
  privateReviewUrl,
} from "@/lib/private-review.shared";

const source = (path: string) => Bun.file(path).text();
const trackSourceMigration = "supabase/migrations/20260923073000_private_review_track_source.sql";

describe("Private Review Links Phase 1", () => {
  test("review URLs carry only an opaque token", () => {
    const url = privateReviewUrl("opaque-token", "https://promptbeats.app/");
    expect(url).toBe("https://promptbeats.app/review/opaque-token");
    expect(url).not.toContain("lyrics=");
    expect(url).not.toContain("project=");
    expect(url).not.toContain("track=");
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
    expect(sql).toContain(
      "v_session.comment_visibility = 'shared' OR c.thread_reviewer_id = v_reviewer.id",
    );
  });

  test("private mode prevents a reviewer from entering another reviewer's thread", async () => {
    const sql = await source("supabase/migrations/20260923054500_private_review_links_phase1.sql");
    expect(sql).toContain("v_parent.thread_reviewer_id <> v_reviewer.id");
    expect(sql).toContain("RAISE EXCEPTION 'comment thread unavailable'");
  });

  test("audio requires explicit linked-track selection for Project reviews", async () => {
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

  test("closed or expired sessions no longer return snapshot, comments or audio", async () => {
    const hardening = await source(
      "supabase/migrations/20261016131500_private_review_closed_content_revocation.sql",
    );
    const server = await source("src/lib/private-review.functions.ts");
    const route = await source("src/routes/review.$token.tsx");

    expect(hardening).toContain("IF v_state <> 'active' THEN");
    expect(hardening).toContain("'expiresAt', v_session.expires_at");
    expect(hardening.indexOf("IF v_state <> 'active' THEN")).toBeLessThan(
      hardening.indexOf("SELECT COALESCE(jsonb_agg"),
    );
    expect(hardening.indexOf("IF v_state <> 'active' THEN")).toBeLessThan(
      hardening.indexOf("IF v_session.include_audio"),
    );
    expect(server).toContain('if (state === "closed" || state === "expired")');
    expect(server.indexOf('if (state === "closed" || state === "expired")')).toBeLessThan(
      server.indexOf("hydrateTrackAudioUrl"),
    );
    expect(route).toContain('session.data?.state === "expired" || session.data?.state === "closed"');
    expect(route).not.toContain("read-only.");
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
    expect(server).not.toContain(
      'export const joinPrivateReviewSession = createServerFn({ method: "POST" })\n  .middleware([requireSupabaseAuth])',
    );
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

  test("Private Review has one source model for Project Version or Song", async () => {
    expect(PRIVATE_REVIEW_SOURCE_TYPES).toEqual(["project_version", "track"]);
    const sql = await source(trackSourceMigration);
    const manager = await source("src/components/promptbeats/PrivateReviewManager.tsx");
    expect(sql).toContain("source_type text NOT NULL DEFAULT 'project_version'");
    expect(sql).toContain("source_type = 'track'");
    expect(sql).toContain("create_private_track_review_session");
    expect(manager).toContain('chooseSource("project_version")');
    expect(manager).toContain('chooseSource("track")');
    expect(manager).toContain("Prompt / Project Version");
    expect(manager).toContain("Song");
  });

  test("Song Review always shares audio and snapshots only explicitly selected Prompt/Lyrics", async () => {
    const sql = await source(trackSourceMigration);
    const server = await source("src/lib/private-review.functions.ts");
    expect(sql).toContain("true, v_track.id, v_audio_snapshot");
    expect(sql).toContain("CASE WHEN COALESCE(_include_prompt,false)");
    expect(sql).toContain("CASE WHEN COALESCE(_include_lyrics,false)");
    expect(server).toContain("createPrivateTrackReviewSession");
    expect(server).toContain("_include_prompt: data.includePrompt");
    expect(server).toContain("_include_lyrics: data.includeLyrics");
  });

  test("Song Review reviewer UI exposes Prompt and Lyrics as permission-controlled tabs", async () => {
    const route = await source("src/routes/review.$token.tsx");
    expect(route).toContain('data.sourceType === "track"');
    expect(route).toContain("data.includePrompt");
    expect(route).toContain("data.includeLyrics");
    expect(route).toContain('setSongPanel("prompt")');
    expect(route).toContain('setSongPanel("lyrics")');
    expect(route).toContain("data.snapshot.prompt");
    expect(route).toContain("data.snapshot.lyrics");
  });

  test("Song source is restricted to an owned active uploaded track", async () => {
    const sql = await source(trackSourceMigration);
    expect(sql).toContain("user_id = v_actor");
    expect(sql).toContain("source_type = 'upload'");
    expect(sql).toContain("moderation_status = 'active'");
    expect(sql).toContain("audio_url IS NOT NULL");
  });

  test("owned uploaded song page exposes direct Private Review entry into the same manager", async () => {
    const trackRoute = await source("src/routes/track.$id.tsx");
    expect(trackRoute).toContain('useFeatureAccess("private_review_links")');
    expect(trackRoute).toContain('track.source_type === "upload"');
    expect(trackRoute).toContain("track.user_id === user.id");
    expect(trackRoute).toContain("Private Review");
    expect(trackRoute).toMatch(/<PrivateReviewManager\s+initialTrackId=\{track\.id\}/);
  });
});
