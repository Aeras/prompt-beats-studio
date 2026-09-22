import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("linked audio results per Project version", () => {
  test("relation schema references existing Project, version and Track records without copying audio", async () => {
    const sql = await source("supabase/migrations/20260923003000_project_version_linked_tracks.sql");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.project_version_tracks");
    expect(sql).toContain("project_id uuid NOT NULL REFERENCES public.prompt_projects(id) ON DELETE CASCADE");
    expect(sql).toContain("version_prompt_id uuid NOT NULL REFERENCES public.saved_prompts(id) ON DELETE CASCADE");
    expect(sql).toContain("track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE");
    expect(sql).not.toContain("audio_url text");
    expect(sql).not.toContain("audio_key text");
  });

  test("same Track cannot be linked twice to the same version and a version has at most one Primary Result", async () => {
    const sql = await source("supabase/migrations/20260923003000_project_version_linked_tracks.sql");

    expect(sql).toContain("UNIQUE (version_prompt_id, track_id)");
    expect(sql).toContain("uq_project_version_tracks_one_primary");
    expect(sql).toContain("WHERE is_primary = true");
  });

  test("relation validation binds user, Project, version and uploaded Track ownership server-side", async () => {
    const sql = await source("supabase/migrations/20260923003000_project_version_linked_tracks.sql");

    expect(sql).toContain("validate_project_version_track_relation");
    expect(sql).toContain("sp.project_id = NEW.project_id");
    expect(sql).toContain("sp.user_id = NEW.user_id");
    expect(sql).toContain("t.user_id = NEW.user_id");
    expect(sql).toContain("t.source_type = 'upload'");
  });

  test("authenticated users may only read their own relation rows and cannot mutate the table directly", async () => {
    const sql = await source("supabase/migrations/20260923003000_project_version_linked_tracks.sql");

    expect(sql).toContain("ALTER TABLE public.project_version_tracks ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("auth.uid() = user_id");
    expect(sql).toContain("REVOKE ALL ON TABLE public.project_version_tracks FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT SELECT ON TABLE public.project_version_tracks TO authenticated, service_role");
  });

  test("Link accepts multiple owned active uploaded tracks and rejects existing links", async () => {
    const sql = await source("supabase/migrations/20260923003000_project_version_linked_tracks.sql");

    expect(sql).toContain("link_project_version_tracks");
    expect(sql).toContain("t.source_type = 'upload'");
    expect(sql).toContain("t.moderation_status = 'active'");
    expect(sql).toContain("One or more tracks are already linked to this version");
    expect(sql).toContain("unnest(v_track_ids)");
  });

  test("Unlink deletes only the relation", async () => {
    const sql = await source("supabase/migrations/20260923003000_project_version_linked_tracks.sql");
    const block = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.unlink_project_version_track"), sql.indexOf("CREATE OR REPLACE FUNCTION public.set_primary_project_version_track"));

    expect(block).toContain("DELETE FROM public.project_version_tracks");
    expect(block).not.toContain("DELETE FROM public.tracks");
  });

  test("Set Primary is serialized and clears the previous Primary before setting the new one", async () => {
    const sql = await source("supabase/migrations/20260923003000_project_version_linked_tracks.sql");

    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("SET is_primary = false");
    expect(sql).toContain("SET is_primary = true");
  });

  test("Project duplication copies references to the same Track IDs and preserves Primary state", async () => {
    const sql = await source("supabase/migrations/20260923003000_project_version_linked_tracks.sql");

    expect(sql).toContain("copy_project_version_track_links_on_duplicate");
    expect(sql).toContain("NEW.duplicated_from_prompt_id");
    expect(sql).toContain("p.duplicated_from_project_id");
    expect(sql).toContain("source_link.track_id");
    expect(sql).toContain("source_link.is_primary");
    expect(sql).not.toContain("INSERT INTO public.tracks");
  });

  test("server selector lists only current user's active PromptBeats uploads", async () => {
    const server = await source("src/lib/project-version-tracks.functions.ts");

    expect(server).toContain('eq("user_id", context.userId)');
    expect(server).toContain('eq("source_type", "upload")');
    expect(server).toContain('eq("moderation_status", "active")');
    expect(server).toContain("listLinkableProjectTracks");
  });

  test("private and public owner tracks remain selectable without changing visibility", async () => {
    const server = await source("src/lib/project-version-tracks.functions.ts");
    const ui = await source("src/components/promptbeats/ProjectVersionLinkedTracks.tsx");

    expect(server).toContain("is_published");
    expect(ui).toContain('track.is_published ? (el ? "Δημόσιο" : "Public") : (el ? "Ιδιωτικό" : "Private")');
    expect(ui).not.toContain("updateTrack");
  });

  test("version history fetches only relation counts until a version is opened", async () => {
    const ai = await source("src/lib/ai.functions.ts");
    const history = await source("src/components/promptbeats/ProjectVersionHistory.tsx");

    expect(ai).toContain('.select("version_prompt_id")');
    expect(ai).toContain("linked_track_count");
    expect(history).toContain("🎵 {version.linked_track_count}");
    expect(history).toContain("<ProjectVersionLinkedTracks");
  });

  test("expanded version lazy-loads compact linked Track metadata", async () => {
    const ui = await source("src/components/promptbeats/ProjectVersionLinkedTracks.tsx");

    expect(ui).toContain('queryKey: ["project-version-linked-tracks", projectId, versionId]');
    expect(ui).toContain("listProjectVersionLinkedTracks");
    expect(ui).toContain("Linked Audio Results");
    expect(ui).not.toContain("TrackCard");
  });

  test("Track selector is multi-select, searchable and does not upload audio", async () => {
    const ui = await source("src/components/promptbeats/ProjectVersionLinkedTracks.tsx");

    expect(ui).toContain("new Set");
    expect(ui).toContain("Search by title");
    expect(ui).toContain("useDeferredValue");
    expect(ui).toContain('queryKey: ["project-version-linkable-tracks", projectId, versionId, deferredQuery]');
    expect(ui).toContain("search: deferredQuery");
    expect(ui).toContain("linkProjectVersionTracks");
    expect(ui).not.toContain('type="file"');
  });

  test("Track selector is portaled and anchored to the pressed action without leaving the viewport", async () => {
    const ui = await source("src/components/promptbeats/ProjectVersionLinkedTracks.tsx");
    const shell = await source("src/components/promptbeats/AppShell.tsx");

    expect(ui).toContain("createPortal");
    expect(ui).toContain("getBoundingClientRect()");
    expect(ui).toContain("SelectorAnchor");
    expect(ui).toContain('[data-pb-mobile-nav="true"]');
    expect(ui).toContain("availableBelow");
    expect(ui).toContain("availableAbove");
    expect(ui).toContain("openBelow");
    expect(shell).toContain('data-pb-mobile-nav="true"');
    expect(ui).toContain("overflow-y-auto");
  });

  test("Link Track action uses the shared pressed-state visual feedback utility", async () => {
    const ui = await source("src/components/promptbeats/ProjectVersionLinkedTracks.tsx");
    const styles = await source("src/styles.css");

    expect(ui).toContain("pb-action-press");
    expect(styles).toContain("@utility pb-action-press");
    expect(styles).toContain("transform: scale(0.96)");
    expect(styles).toContain("box-shadow:");
  });

  test("compact player reuses the global player and disables public play analytics for Project reference listening", async () => {
    const ui = await source("src/components/promptbeats/ProjectVersionLinkedTracks.tsx");
    const player = await source("src/lib/player.tsx");

    expect(ui).toContain("usePlayer");
    expect(ui).toContain("play(playerTrack, [playerTrack], { countPlay: false })");
    expect(player).toContain("countPlay: boolean");
    expect(player).toContain("if (!cycle.countPlay) return");
  });

  test("playback errors stay local and do not remove Project content", async () => {
    const ui = await source("src/components/promptbeats/ProjectVersionLinkedTracks.tsx");
    const player = await source("src/lib/player.tsx");

    expect(player).toContain("playbackError");
    expect(player).toContain("Playback failed.");
    expect(ui).toContain("Playback failed.");
  });

  test("Open Track navigates to the existing Track page and Unlink explicitly says the Track is not deleted", async () => {
    const ui = await source("src/components/promptbeats/ProjectVersionLinkedTracks.tsx");

    expect(ui).toContain('to="/track/$id"');
    expect(ui).toContain("The track will not be deleted from PromptBeats.");
    expect(ui).toContain("unlinkProjectVersionTrack");
  });

  test("Link/Unlink/Primary do not create Project versions or alter creative version metadata", async () => {
    const server = await source("src/lib/project-version-tracks.functions.ts");

    expect(server).not.toContain("create_prompt_revision_version");
    expect(server).not.toContain("next_prompt_project_version");
    expect(server).not.toContain("version_change_metadata");
  });

  test("Version Compare shows linked counts as context but keeps them outside semantic diff calculation", async () => {
    const compare = await source("src/components/promptbeats/ProjectVersionCompare.tsx");
    const diff = await source("src/lib/project-version-diff.shared.ts");

    expect(compare).toContain("linked_track_count");
    expect(compare).toContain("🎵");
    expect(diff).not.toContain("linked_track_count");
  });

  test("same Track may be referenced by different versions because uniqueness is version-scoped", async () => {
    const sql = await source("supabase/migrations/20260923003000_project_version_linked_tracks.sql");

    expect(sql).toContain("UNIQUE (version_prompt_id, track_id)");
    expect(sql).not.toContain("UNIQUE (track_id)");
  });

  test("Project delete removes only relation rows through cascade and never deletes Tracks", async () => {
    const sql = await source("supabase/migrations/20260923003000_project_version_linked_tracks.sql");

    expect(sql).toContain("project_id uuid NOT NULL REFERENCES public.prompt_projects(id) ON DELETE CASCADE");
    expect(sql).not.toContain("DELETE FROM public.tracks WHERE project_id");
  });

  test("Version delete removes its relation rows through cascade and leaves Tracks untouched", async () => {
    const sql = await source("supabase/migrations/20260923003000_project_version_linked_tracks.sql");

    expect(sql).toContain("version_prompt_id uuid NOT NULL REFERENCES public.saved_prompts(id) ON DELETE CASCADE");
    expect(sql).not.toContain("DELETE FROM public.tracks WHERE version_prompt_id");
  });

  test("Track delete safely removes relation rows through cascade", async () => {
    const sql = await source("supabase/migrations/20260923003000_project_version_linked_tracks.sql");

    expect(sql).toContain("track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE");
  });

  test("linked Track loading keeps graceful unavailable state instead of breaking Project content", async () => {
    const server = await source("src/lib/project-version-tracks.functions.ts");

    expect(server).toContain("Track no longer available");
    expect(server).toContain("unavailable: !available");
    expect(server).toContain("audio_url: available ? track.audio_url : null");
  });

  test("selector excludes external Suno, Udio and legacy-link Tracks server-side", async () => {
    const server = await source("src/lib/project-version-tracks.functions.ts");
    const sql = await source("supabase/migrations/20260923003000_project_version_linked_tracks.sql");

    expect(server).toContain('.eq("source_type", "upload")');
    expect(sql).toContain("t.source_type = 'upload'");
    expect(sql).not.toContain("source_type IN ('upload','suno'");
  });

  test("link endpoint validates Project and version ownership before calling relation RPC", async () => {
    const server = await source("src/lib/project-version-tracks.functions.ts");

    expect(server).toContain("assertOwnedProjectVersion");
    expect(server).toContain('.eq("project_id", projectId)');
    expect(server).toContain('.eq("user_id", userId)');
  });

  test("linked private Track metadata is exposed only through authenticated owner-scoped server functions", async () => {
    const server = await source("src/lib/project-version-tracks.functions.ts");

    expect(server).toContain(".middleware([requireSupabaseAuth])");
    expect(server).toContain('.eq("user_id", context.userId)');
    expect(server).not.toContain("createPublicServerClient");
  });

  test("primary ordering is deterministic: Primary first, then link time and Track id", async () => {
    const server = await source("src/lib/project-version-tracks.functions.ts");

    expect(server).toContain("if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1");
    expect(server).toContain("a.relation_created_at.localeCompare(b.relation_created_at)");
    expect(server).toContain("a.track_id.localeCompare(b.track_id)");
  });

  test("RLS auth lookup uses init-plan safe select wrapper", async () => {
    const sql = await source("supabase/migrations/20260923011000_project_version_tracks_rls_perf.sql");

    expect(sql).toContain("(select auth.uid()) = user_id");
  });

  test("existing Projects remain valid because linked audio is represented only by optional relation rows", async () => {
    const sql = await source("supabase/migrations/20260923003000_project_version_linked_tracks.sql");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.project_version_tracks");
    expect(sql).not.toContain("ALTER TABLE public.saved_prompts\n  ALTER COLUMN");
    expect(sql).not.toContain("ALTER TABLE public.prompt_projects\n  ALTER COLUMN");
  });
});
