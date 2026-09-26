import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("September 22 production audit hardening", () => {
  test("public service-role track reads enforce active moderation state", async () => {
    const tracks = await source("src/lib/tracks.functions.ts");
    const profiles = await source("src/lib/profile.functions.ts");

    const listStart = tracks.indexOf("export const listPublishedTracks");
    const detailStart = tracks.indexOf("export const getPublicTrackById");
    const myStart = tracks.indexOf("export const listMyTracks");
    expect(tracks.slice(listStart, detailStart)).toContain('.eq("moderation_status", "active")');
    expect(tracks.slice(detailStart, myStart)).toContain('.eq("moderation_status", "active")');

    const byId = profiles.slice(
      profiles.indexOf("export const getPublicArtistById"),
      profiles.indexOf("export const getPublicArtistByHandle"),
    );
    const byHandle = profiles.slice(
      profiles.indexOf("export const getPublicArtistByHandle"),
      profiles.indexOf("export const getPublicProfile"),
    );
    expect(byId).toContain('.eq("moderation_status", "active")');
    expect(byHandle).toContain('.eq("moderation_status", "active")');
  });

  test("private public lookup and share-token paths do not reveal track titles", async () => {
    const tracks = await source("src/lib/tracks.functions.ts");
    const shareSql = await source(
      "supabase/migrations/20260922115000_private_track_title_privacy.sql",
    );
    expect(tracks).not.toContain("privateTitle: track.title");
    expect(shareSql).toContain("RETURN jsonb_build_object('state','private')");
    expect(shareSql).not.toContain("'state','private','track_id'");
  });

  test("auxiliary AI calls use durable database idempotency before provider work", async () => {
    const setup = await source("src/lib/song-setup-assistant.functions.ts");
    const analyzer = await source("src/lib/song-analyzer.functions.ts");
    const migration = await source(
      "supabase/migrations/20260924200000_auxiliary_ai_durable_idempotency.sql",
    );

    expect(setup).toContain("executeDurableAuxiliaryAiRequest");
    expect(analyzer).toContain("executeDurableAuxiliaryAiRequest");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("UNIQUE (user_id, operation, request_key)");
  });

  test("Lyrics Workspace save is feature-gated before service-role persistence", async () => {
    const workspace = await source("src/lib/lyrics-workspace.functions.ts");
    const gate = workspace.indexOf('requireFeatureAccess(context.supabase, "lyrics_workspace")');
    const admin = workspace.indexOf('import("@/integrations/supabase/client.server")');
    expect(gate).toBeGreaterThan(-1);
    expect(admin).toBeGreaterThan(gate);
  });

  test("Contact Us uses durable admission rather than process-local counters", async () => {
    const contact = await source("src/lib/contact.functions.ts");
    const migration = await source("supabase/migrations/20260922114000_contact_rate_limit.sql");
    expect(contact).not.toContain("new Map<");
    expect(contact).toContain('rpc("admit_contact_request"');
    expect(migration).toContain("v_email_count >= 3 OR v_network_count >= 10");
    expect(migration).toContain("pg_advisory_xact_lock");
  });

  test("server Supabase clients share the canonical external-first config", async () => {
    const config = await source("src/integrations/supabase/config.server.ts");
    const middleware = await source("src/integrations/supabase/auth-middleware.ts");
    const admin = await source("src/integrations/supabase/client.server.ts");
    const publicClient = await source("src/lib/supabase-public.server.ts");
    expect(config).toContain("EXTERNAL_SUPABASE_URL");
    expect(middleware).toContain("getServerSupabasePublicConfig");
    expect(admin).toContain("getServerSupabaseAdminConfig");
    expect(publicClient).toContain("getServerSupabasePublicConfig");
  });

  test("avatar contract and bucket enforce JPEG/PNG/WebP at 5 MB", async () => {
    const helper = await source("src/lib/avatar-upload.ts");
    const migration = await source(
      "supabase/migrations/20260922120000_avatar_bucket_mime_hardening.sql",
    );
    expect(helper).toContain('"image/jpeg"');
    expect(helper).toContain('"image/png"');
    expect(helper).toContain('"image/webp"');
    expect(helper).toContain("5 * 1024 * 1024");
    expect(migration).toContain("allowed_mime_types");
    expect(migration).toContain("5 * 1024 * 1024");
  });

  test("production AI adapters have bounded request deadlines", async () => {
    const provider = await source("src/lib/ai-provider.server.ts");
    const analyzer = await source("src/lib/song-analyzer.functions.ts");
    expect(provider).toContain("providerRequestTimeoutMs");
    expect(provider).toContain("AbortSignal.timeout(providerRequestTimeoutMs(call))");
    expect(provider).toContain("httpOptions: { timeout: providerRequestTimeoutMs(call) }");
    expect(analyzer).toContain("httpOptions: { timeout: 5 * 60 * 1000 }");
  });

  test("default AI models remain enabled and operation-compatible independent of access policy", async () => {
    const admin = await source("src/lib/ai-model-admin.functions.ts");
    const panel = await source("src/components/promptbeats/AiModelsPanel.tsx");
    const provider = await source("src/lib/ai-provider.server.ts");

    expect(admin).toContain('model.status === "enabled"');
    expect(admin).not.toContain("A default AI model must be available to all users.");
    expect(panel).not.toContain('m.accessPolicy === "all_users"');
    expect(panel).not.toContain("handleAccessPolicyChange");
    expect(provider).toContain("const effectiveModels = [");
    expect(provider).toContain("configuredDefault,");
    expect(provider).toContain("defaultModel: configuredDefault.providerModelId");
  });

  test("prompt projects and song analyses expose only owner CRUD to authenticated", async () => {
    const migration = await source(
      "supabase/migrations/20260922151500_restore_project_analysis_table_crud_grants.sql",
    );

    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.prompt_projects FROM anon, authenticated, service_role",
    );
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prompt_projects TO authenticated, service_role",
    );
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.song_analyses FROM anon, authenticated, service_role",
    );
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.song_analyses TO authenticated, service_role",
    );
  });

  test("RLS event helper loses browser-facing EXECUTE grants", async () => {
    const migration = await source(
      "supabase/migrations/20260922115500_harden_rls_auto_enable_grants.sql",
    );
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated",
    );
  });
});