import { describe, expect, test } from "bun:test";

// Privacy withdrawal stays available even when Feature Access no longer permits new exposure.
async function source(path: string) {
  return Bun.file(path).text();
}

function block(sourceText: string, start: string, end: string) {
  const from = sourceText.indexOf(start);
  const to = sourceText.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return sourceText.slice(from, to);
}

describe("FINAL-004 privacy revocation safety", () => {
  test("public share creation/update stay gated while owner listing/revocation remain available", async () => {
    const src = await source("src/lib/track-sharing.functions.ts");

    const create = block(
      src,
      "export const createTrackShareLink",
      "export const updateTrackShareLink",
    );
    const update = block(
      src,
      "export const updateTrackShareLink",
      "export const revokeTrackShareLink",
    );
    const revoke = block(
      src,
      "export const revokeTrackShareLink",
      "export const recordTrackPublicShare",
    );
    const list = src.slice(src.indexOf("export const listMyShareManagement"));

    expect(create).toContain('requireFeatureAccess(context.supabase, "sharing_public_links")');
    expect(update).toContain('requireFeatureAccess(context.supabase, "sharing_public_links")');
    expect(revoke).not.toContain("requireFeatureAccess");
    expect(list).not.toContain("requireFeatureAccess");
    expect(revoke).toContain('rpc("revoke_track_share_link"');
    expect(list).toContain('rpc("list_my_share_management"');
  });

  test("private review creation/replies stay gated while existing owner sessions can be listed, read and closed", async () => {
    const src = await source("src/lib/private-review.functions.ts");

    const create = block(
      src,
      "export const createPrivateReviewSession",
      "export const createPrivateTrackReviewSession",
    );
    const createTrack = block(
      src,
      "export const createPrivateTrackReviewSession",
      "export const getPrivateReviewLinkInfo",
    );
    const list = block(
      src,
      "export const listMyPrivateReviewSessions",
      "export const getMyPrivateReviewSession",
    );
    const get = block(
      src,
      "export const getMyPrivateReviewSession",
      "export const closePrivateReviewSession",
    );
    const close = block(
      src,
      "export const closePrivateReviewSession",
      "export const addPrivateReviewCreatorReply",
    );
    const reply = src.slice(src.indexOf("export const addPrivateReviewCreatorReply"));

    expect(create).toContain('requireFeatureAccess(context.supabase, "private_review_links")');
    expect(createTrack).toContain('requireFeatureAccess(context.supabase, "private_review_links")');
    expect(reply).toContain('requireFeatureAccess(context.supabase, "private_review_links")');
    expect(list).not.toContain("requireFeatureAccess");
    expect(get).not.toContain("requireFeatureAccess");
    expect(close).not.toContain("requireFeatureAccess");
    expect(close).toContain('rpc("close_private_review_session"');
  });

  test("management UI stays reachable after Feature Access removal without re-enabling creation", async () => {
    const [library, shared, history, track, manager] = await Promise.all([
      source("src/routes/library.tsx"),
      source("src/components/promptbeats/SharedLinksPanel.tsx"),
      source("src/components/promptbeats/ProjectVersionHistory.tsx"),
      source("src/routes/track.$id.tsx"),
      source("src/components/promptbeats/PrivateReviewManager.tsx"),
    ]);

    expect(library).toContain('if (item === "shared") return true;');
    expect(library).toContain('{tab === "shared" && user && <SharedLinksPanel />}');
    expect(shared).not.toContain("enabled: sharingAccess.allowed");
    expect(shared).toContain("You can still revoke any active link you already created.");
    expect(shared).toContain("disabled={!sharingAccess.allowed || updating === link.id}");

    expect(history).toContain("canCreateNew={privateReviewFeature.allowed}");
    expect(history).toContain("{versions.length > 0 && (");
    expect(track).toContain("canCreateNew={privateReviewAccess.allowed}");
    expect(manager).toContain("canCreateNew?: boolean;");
    expect(manager).toContain("!canCreateNew ||");
    expect(manager).toContain("You can still view and close links you already created.");
    expect(manager).toContain('{canCreateNew && ownerSession.data.state === "active" && (');
    expect(manager).toContain("{canCreateNew && replyParentId && (");
  });
});
