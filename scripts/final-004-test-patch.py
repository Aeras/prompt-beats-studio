from pathlib import Path

p = Path("src/lib/feature-access-v2.test.ts")
text = p.read_text()
old = '''  test("Sharing gates management, creation, update, analytics and revocation while preserving public token resolution", async () => {
    const sql = await source(mutationMigration);
    expect(functionBlock(sql, "create_track_share_link")).toContain("sharing_public_links");
    expect(functionBlock(sql, "update_track_share_link")).toContain("sharing_public_links");
    expect(functionBlock(sql, "record_track_public_share")).toContain("sharing_public_links");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.revoke_track_share_link");

    const server = await source("src/lib/track-sharing.functions.ts");
    for (const name of ["listMyShareManagement", "revokeTrackShareLink"]) {
      const start = server.indexOf(`export const ${name}`);
      const next = server.indexOf("export const", start + 20);
      expect(server.slice(start, next === -1 ? server.length : next)).toContain(
        'requireFeatureAccess(context.supabase, "sharing_public_links")',
      );
    }

    const management = await source("src/components/promptbeats/SharedLinksPanel.tsx");
    expect(management).toContain("enabled: sharingAccess.allowed");
    expect(management).toContain("if (!sharingAccess.allowed) return null");
  });'''
new = '''  test("Sharing gates new exposure but preserves owner management and revocation for privacy safety", async () => {
    const sql = await source(mutationMigration);
    expect(functionBlock(sql, "create_track_share_link")).toContain("sharing_public_links");
    expect(functionBlock(sql, "update_track_share_link")).toContain("sharing_public_links");
    expect(functionBlock(sql, "record_track_public_share")).toContain("sharing_public_links");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.revoke_track_share_link");
    expect(sql).toContain("Revocation intentionally remains ungated for privacy/safety");

    const server = await source("src/lib/track-sharing.functions.ts");
    for (const name of ["createTrackShareLink", "updateTrackShareLink", "recordTrackPublicShare"]) {
      const start = server.indexOf(`export const ${name}`);
      const next = server.indexOf("export const", start + 20);
      expect(server.slice(start, next === -1 ? server.length : next)).toContain(
        'requireFeatureAccess(context.supabase, "sharing_public_links")',
      );
    }
    for (const name of ["listMyShareManagement", "revokeTrackShareLink"]) {
      const start = server.indexOf(`export const ${name}`);
      const next = server.indexOf("export const", start + 20);
      expect(server.slice(start, next === -1 ? server.length : next)).not.toContain(
        "requireFeatureAccess",
      );
    }

    const management = await source("src/components/promptbeats/SharedLinksPanel.tsx");
    expect(management).not.toContain("enabled: sharingAccess.allowed");
    expect(management).not.toContain("if (!sharingAccess.allowed) return null");
    expect(management).toContain("You can still revoke any active link you already created.");
  });'''
if text.count(old) != 1:
    raise SystemExit(f"Expected one old sharing test block, found {text.count(old)}")
p.write_text(text.replace(old, new))
