import { describe, expect, test } from "bun:test";

const registryMigration =
  "supabase/migrations/20260921090000_feature_access_v2_registry_and_ai_admission.sql";
const mutationMigration =
  "supabase/migrations/20260921090100_feature_access_v2_mutation_enforcement.sql";
const songSetupMigration =
  "supabase/migrations/20260922105500_add_song_setup_assistant_feature_access.sql";
const lyricsReviewMigration =
  "supabase/migrations/20260923043000_add_lyrics_review_feature_access.sql";
const privateReviewMigration = "supabase/migrations/20260923054500_private_review_links_phase1.sql";
const dependentSurfaceMigration =
  "supabase/migrations/20260922182136_feature_access_dependent_surface_rls.sql";

const CANONICAL_KEYS = [
  "ai_generator",
  "quality_check",
  "song_analyzer",
  "lyrics_workspace",
  "lyrics_review",
  "smart_presets",
  "song_setup_assistant",
  "inspiration_wall",
  "story_map",
  "song_universe",
  "export_center",
  "track_uploads",
  "sharing_public_links",
  "private_review_links",
  "playlists",
  "favorites",
  "likes",
  "follow_creators",
  "notifications",
] as const;

async function source(path: string) {
  return Bun.file(path).text();
}

function functionBlock(sql: string, name: string) {
  const start = sql.indexOf(`FUNCTION public.${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION public.", start + 20);
  return sql.slice(start, next === -1 ? sql.length : next);
}

describe("Feature Access V2 — 19 features", () => {
  test("canonical TypeScript registry contains exactly 19 unique feature keys", async () => {
    const code = await source("src/lib/feature-access.functions.ts");
    const match = code.match(/FEATURE_KEYS = \[([^\]]+)\] as const/);
    expect(match).not.toBeNull();
    const keys = [...(match?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((item) => item[1]);
    expect(keys).toEqual(CANONICAL_KEYS);
    expect(new Set(keys).size).toBe(19);
    expect(keys.filter((key) => key === "notifications")).toHaveLength(1);
  });

  test("V2 migration keeps its original active definitions while later features are seeded separately", async () => {
    const sql = await source(registryMigration);
    const laterKeys = [
      "smart_presets",
      "song_setup_assistant",
      "inspiration_wall",
      "story_map",
      "song_universe",
      "lyrics_review",
      "private_review_links",
      "export_center",
      "follow_creators",
      "notifications",
    ];
    const originalKeys = CANONICAL_KEYS.filter((key) => !laterKeys.includes(key));
    for (const key of originalKeys) {
      expect(sql).toContain(`('${key}'`);
      const row = new RegExp(`\\('${key}'[^\\n]+,'everyone'\\)`);
      expect(sql).toMatch(row);
    }
    for (const existing of laterKeys) {
      expect(sql).not.toMatch(new RegExp(`\\('${existing}'[^\\n]+,'everyone'\\)`));
    }
    expect(sql).toContain("ON CONFLICT(feature_key) DO NOTHING");
  });

  test("Song Setup Assistant is seeded independently as admins_only", async () => {
    const sql = await source(songSetupMigration);
    expect(sql).toMatch(/VALUES\s*\(\s*'song_setup_assistant'/m);
    expect(sql).toContain("'Song Setup Assistant'");
    expect(sql).toContain("'admins_only'");
    expect(sql).toContain("ON CONFLICT(feature_key) DO NOTHING");
  });

  test("Lyrics Review is seeded independently as admins_only", async () => {
    const sql = await source(lyricsReviewMigration);
    expect(sql).toMatch(/VALUES\s*\(\s*'lyrics_review'/m);
    expect(sql).toContain("'Lyrics Review'");
    expect(sql).toContain("'admins_only'");
    expect(sql).toContain("ON CONFLICT(feature_key) DO NOTHING");
  });

  test("Private Review Links is seeded independently as admins_only", async () => {
    const sql = await source(privateReviewMigration);
    expect(sql).toMatch(/VALUES\s*\(\s*'private_review_links'/m);
    expect(sql).toContain("'Private Review Links'");
    expect(sql).toContain("'admins_only'");
    expect(sql).toContain("ON CONFLICT(feature_key) DO NOTHING");
  });

  test("Feature Access panel keeps stable feature_key identity and Super Admin boundary", async () => {
    const ui = await source("src/routes/management.tsx");
    expect(ui).toContain("key={policy.feature_key}");
    expect(ui).toContain('isSuperAdmin && section === "features"');
    expect(ui).toContain("<FeatureAccessPanel />");
  });

  test("AI Generator durable admission preserves recovery but gates before new credit/job creation", async () => {
    const sql = await source(registryMigration);
    const block = functionBlock(sql, "start_generation_job");
    const idempotent = block.indexOf("idempotency_key=_idempotency_key");
    const feature = block.indexOf("public.can_use_feature(v_user,v_feature_key)");
    const credit = block.indexOf("INSERT INTO public.ai_generations");
    const job = block.indexOf("INSERT INTO public.ai_generation_jobs");
    expect(idempotent).toBeGreaterThan(-1);
    expect(feature).toBeGreaterThan(idempotent);
    expect(credit).toBeGreaterThan(feature);
    expect(job).toBeGreaterThan(feature);
    expect(block).toContain("lyrics_section_edit");
    expect(block).toContain("'lyrics_workspace'");
    expect(block).toContain("'ai_generator'");
  });

  test("Generator server entry points and Song Setup Assistant are gated before provider/model work", async () => {
    const jobs = await source("src/lib/generation-jobs.functions.ts");
    expect(jobs).toContain('requireFeatureAccess(context.supabase, "ai_generator")');
    expect(jobs).toContain('requireFeatureAccess(context.supabase, "lyrics_workspace")');

    const legacy = await source("src/lib/ai.functions.ts");
    expect(legacy).toContain('requireFeatureAccess(context.supabase, "ai_generator")');
    expect(legacy).toContain('requireFeatureAccess(context.supabase, "quality_check")');

    const setup = await source("src/lib/song-setup-assistant.functions.ts");
    const generatorGate = setup.indexOf('requireFeatureAccess(context.supabase, "ai_generator")');
    const assistantGate = setup.indexOf(
      'requireFeatureAccess(context.supabase, "song_setup_assistant")',
    );
    const provider = setup.indexOf('import("@/lib/ai-provider.server")');
    expect(generatorGate).toBeGreaterThan(-1);
    expect(assistantGate).toBeGreaterThan(generatorGate);
    expect(provider).toBeGreaterThan(assistantGate);
    expect(setup).not.toContain("current_user_is_admin_level");

    const route = await source("src/routes/generate.tsx");
    expect(route).toContain('useFeatureAccess("song_setup_assistant")');
    expect(route).toContain("songSetupFeature.allowed");
  });

  test("Quality Check recovery remains readable while new durable admission is gated before creation", async () => {
    const sql = await source(registryMigration);
    for (const name of ["start_quality_check_job", "claim_quality_check"]) {
      const block = functionBlock(sql, name);
      const existing = block.indexOf("idempotency_key=_idempotency_key");
      const feature = block.indexOf("can_use_feature(v_user,'quality_check')");
      expect(existing).toBeGreaterThan(-1);
      expect(feature).toBeGreaterThan(existing);
      if (name === "start_quality_check_job") {
        expect(block.indexOf("INSERT INTO public.ai_quality_check_actions")).toBeGreaterThan(
          feature,
        );
        expect(block.indexOf("kick_quality_check_runner")).toBeGreaterThan(feature);
      }
    }
    const server = await source("src/lib/quality-check-jobs.functions.ts");
    const gate = server.indexOf('requireFeatureAccess(context.supabase, "quality_check")');
    const model = server.indexOf("getModelForUser");
    expect(gate).toBeGreaterThan(-1);
    expect(model).toBeGreaterThan(gate);
  });

  test("Song Analyzer provider path and route admission are Feature Access protected", async () => {
    const server = await source("src/lib/song-analyzer.functions.ts");
    expect(server).toContain('requireFeatureAccess(context.supabase, "song_analyzer")');
    expect(server).not.toContain("async function requireAdmin");
    const route = await source("src/routes/song-analyzer.tsx");
    expect(route).toContain("getSongAnalyzerAccess()");
    expect(route).toContain("access.isError");
    const nav = await source("src/components/promptbeats/Sidebar.tsx");
    expect(nav).toContain('useFeatureAccess("song_analyzer")');
  });

  test("Lyrics Workspace blocks dedicated UI and AI section edits but does not gate plain lyric display", async () => {
    const jobs = await source("src/lib/generation-jobs.functions.ts");
    expect(jobs).toContain('requireFeatureAccess(context.supabase, "lyrics_workspace")');
    const route = await source("src/routes/generate.tsx");
    expect(route).toContain('useFeatureAccess("lyrics_workspace")');
    expect(route).toContain('t("lyricsWorkspace.featureUnavailable")');
    expect(route).not.toContain(">Lyrics Workspace is currently unavailable.<");
    const trackCard = await source("src/components/promptbeats/TrackCard.tsx");
    expect(trackCard).not.toContain('useFeatureAccess("lyrics_workspace")');
  });

  test("Track Uploads rejects before storage admission and gates new uploaded-track records only", async () => {
    const api = await source("src/routes/api/upload.ts");
    const gate = api.indexOf('_feature_key: "track_uploads"');
    const admit = api.indexOf('rpc("admit_track_upload")');
    const bodyRead = api.indexOf("readBoundedBody(request, declaredLength)");
    const r2Upload = api.search(/uploadToR2\(\s*key\s*,/);
    expect(gate).toBeGreaterThan(-1);
    expect(admit).toBeGreaterThan(gate);
    expect(bodyRead).toBeGreaterThan(admit);
    expect(r2Upload).toBeGreaterThan(bodyRead);

    const sql = await source(mutationMigration);
    expect(functionBlock(sql, "admit_track_upload")).toContain(
      "can_use_feature(v_user_id,'track_uploads')",
    );
    expect(sql).toContain(
      "(source_type<>'upload' OR public.current_user_can_use_feature('track_uploads'))",
    );

    const tracks = await source("src/lib/tracks.functions.ts");
    expect(tracks).toContain('requireFeatureAccess(context.supabase, "track_uploads")');
    expect(tracks).toContain("data.new_audio_key");
    expect(tracks).toContain("listMyTracks");
  });

  test("Sharing gates new exposure but preserves owner management and revocation for privacy safety", async () => {
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
  });

  test("Playlists reads and mutations are gated and the dependent Library surface does not query when unavailable", async () => {
    const server = await source("src/lib/playlists.functions.ts");
    for (const name of [
      "createPlaylist",
      "updatePlaylist",
      "deletePlaylist",
      "addTrackToPlaylist",
      "removeTrackFromPlaylist",
      "reorderPlaylistTracks",
    ]) {
      const start = server.indexOf(`export const ${name}`);
      const next = server.indexOf("export const", start + 20);
      expect(server.slice(start, next === -1 ? server.length : next)).toContain(
        'requireFeatureAccess(context.supabase, "playlists")',
      );
    }
    for (const name of ["listPlaylists", "getPlaylist"]) {
      const start = server.indexOf(`export const ${name}`);
      const next = server.indexOf("export const", start + 20);
      expect(server.slice(start, next === -1 ? server.length : next)).toContain(
        'requireFeatureAccess(context.supabase, "playlists")',
      );
    }
    const ui = await source("src/components/promptbeats/PlaylistLibraryPanel.tsx");
    expect(ui).toContain('useFeatureAccess("playlists")');
    expect(ui).toContain("enabled: featureAccess.allowed");
    expect(ui).toContain("if (!featureAccess.allowed) return null");
  });

  test("Favorites reads and mutations are gated while stored rows are preserved", async () => {
    const server = await source("src/lib/playlists.functions.ts");
    const toggleStart = server.indexOf("export const toggleFavorite");
    const toggleEnd = server.indexOf("export const", toggleStart + 20);
    expect(server.slice(toggleStart, toggleEnd)).toContain(
      'requireFeatureAccess(context.supabase, "favorites")',
    );

    for (const name of ["listFavoriteTrackIds", "listFavoriteTracks"]) {
      const readStart = server.indexOf(`export const ${name}`);
      const readEnd = server.indexOf("export const", readStart + 20);
      expect(server.slice(readStart, readEnd === -1 ? server.length : readEnd)).toContain(
        'requireFeatureAccess(context.supabase, "favorites")',
      );
    }

    const sql = await source(mutationMigration);
    expect(sql).toContain("current_user_can_use_feature('favorites')");
  });

  test("Likes actions and liked-track Library reads disappear when unavailable while stored rows are preserved", async () => {
    const sql = await source(mutationMigration);
    expect(sql).toContain("current_user_can_use_feature('likes')");
    expect(sql).not.toContain("DELETE FROM public.likes");
    const button = await source("src/components/promptbeats/LikeButton.tsx");
    expect(button).toContain('useFeatureAccess("likes")');
    expect(button).toContain("if (!featureAccess.allowed) return null");
    expect(button).toContain("enabled && featureAccess.allowed");

    const tracks = await source("src/lib/tracks.functions.ts");
    const likedStart = tracks.indexOf("export const listLikedTracks");
    expect(tracks.slice(likedStart)).toContain('requireFeatureAccess(context.supabase, "likes")');
  });

  test("Feature-owned stored data becomes unreadable through direct RLS access while access is unavailable", async () => {
    const sql = await source(dependentSurfaceMigration);
    for (const [table, feature] of [
      ["playlists", "playlists"],
      ["playlist_tracks", "playlists"],
      ["favorites", "favorites"],
      ["likes", "likes"],
      ["track_share_links", "sharing_public_links"],
      ["song_analyses", "song_analyzer"],
    ] as const) {
      expect(sql).toContain(`ON public.${table}`);
      expect(sql).toContain(`current_user_can_use_feature('${feature}')`);
    }
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\./i);
  });

  test("new mutations do not delete historical user data or auto-revoke share links", async () => {
    const sql = (await source(registryMigration)) + "\n" + (await source(mutationMigration));
    for (const table of [
      "ai_generation_jobs",
      "ai_quality_check_actions",
      "playlists",
      "playlist_tracks",
      "favorites",
      "likes",
      "track_share_links",
      "tracks",
    ]) {
      expect(sql).not.toMatch(new RegExp(`DELETE FROM public\\.${table}\\b`, "i"));
    }
    expect(sql).not.toContain("revoked_at=now()");
  });

  test("Library feature-owned tabs, Analyzer results and prompt actions follow effective Feature Access with safe fallback", async () => {
    const library = await source("src/routes/library.tsx");
    for (const key of ["playlists", "favorites", "likes", "song_analyzer"]) {
      expect(library).toContain(`useFeatureAccess("${key}")`);
    }
    expect(library).toContain("availableTabs");
    expect(library).toContain('if (item === "shared") return true;');
    expect(library).toContain('{tab === "shared" && user && <SharedLinksPanel />}');
    expect(library).toContain("availableTabs.includes(requestedTab)");
    expect(library).toContain("replace: true");
    expect(library).toContain('promptView === "analyses" && !analyzerAccess.allowed');
    expect(library).toContain("enabled: Boolean(user && analyzerAccess.allowed)");
    expect(library).toContain("enabled: Boolean(user && likesAccess.allowed)");
    expect(library).toContain("enabled: Boolean(user && favoritesAccess.allowed)");
    expect(library).toContain("showAnalyses={analyzerAccess.allowed}");
    expect(library).toContain("lyricsWorkspaceAccess.allowed");
    expect(library).toContain("generatorAccess.allowed");

    const analyzer = await source("src/lib/song-analyzer.functions.ts");
    for (const name of [
      "listSongAnalyses",
      "updateSongAnalysisOrganization",
      "deleteSongAnalysis",
    ]) {
      const start = analyzer.indexOf(`export const ${name}`);
      const next = analyzer.indexOf("export const", start + 20);
      expect(analyzer.slice(start, next === -1 ? analyzer.length : next)).toContain(
        'requireFeatureAccess(context.supabase, "song_analyzer")',
      );
    }
  });

  test("Feature-owned navigation entries disappear when the main feature is unavailable", async () => {
    const sidebar = await source("src/components/promptbeats/Sidebar.tsx");
    expect(sidebar).toContain('useFeatureAccess("ai_generator")');
    expect(sidebar).toContain('useFeatureAccess("lyrics_review")');
    expect(sidebar).toContain('item.id !== "studio" || generatorAccess.allowed');
    expect(sidebar).toContain('item.id !== "songAnalyzer" || analyzerAccess.allowed');
    expect(sidebar).toContain('item.id !== "lyricsReview" || lyricsReviewAccess.allowed');

    const shell = await source("src/components/promptbeats/AppShell.tsx");
    expect(shell).toContain('useFeatureAccess("ai_generator")');
    expect(shell).toContain('tab.id !== "studio" || generatorAccess.allowed');
    expect(shell).toContain('lyricsReview: "/lyrics-review"');
  });

  test("existing four feature integrations remain present", async () => {
    const files = {
      smart_presets: "src/components/promptbeats/SmartPresetsPanel.tsx",
      export_center: "src/components/promptbeats/ExportControl.tsx",
      follow_creators: "src/components/promptbeats/FollowCreatorControl.tsx",
      notifications: "src/components/promptbeats/NotificationCenter.tsx",
    } as const;
    for (const [key, path] of Object.entries(files)) {
      expect(await source(path)).toContain(`useFeatureAccess("${key}")`);
    }
  });
});
