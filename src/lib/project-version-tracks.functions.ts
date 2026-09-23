import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idsSchema = z.array(z.string().uuid()).min(1).max(50);

type LinkableTrack = {
  id: string;
  title: string;
  duration_seconds: number | null;
  cover_url: string | null;
  is_published: boolean;
  linked: boolean;
};

async function assertOwnedProjectVersion(
  supabase: any,
  userId: string,
  projectId: string,
  versionId: string,
) {
  const { data: project, error: projectError } = await supabase
    .from("prompt_projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (projectError) throw new Error(projectError.message);
  if (!project) throw new Error("Project not found.");

  const { data: version, error: versionError } = await supabase
    .from("saved_prompts")
    .select("id")
    .eq("id", versionId)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (versionError) throw new Error(versionError.message);
  if (!version) throw new Error("Project version not found.");
}

export const listProjectVersionLinkedTracks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      versionId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwnedProjectVersion(context.supabase, context.userId, data.projectId, data.versionId);

    const { data: links, error: linksError } = await (context.supabase as any)
      .from("project_version_tracks")
      .select("track_id, is_primary, created_at")
      .eq("user_id", context.userId)
      .eq("project_id", data.projectId)
      .eq("version_prompt_id", data.versionId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (linksError) throw new Error(linksError.message);

    const rows = (links ?? []) as Array<{ track_id: string; is_primary: boolean; created_at: string }>;
    if (rows.length === 0) return { tracks: [] };

    const ids = rows.map((row) => row.track_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tracks, error: tracksError } = await (supabaseAdmin.from("tracks") as any)
      .select("id, user_id, title, audio_url, audio_type, source_type, art_url, cover_url, duration_seconds, is_published, moderation_status, created_at")
      .eq("user_id", context.userId)
      .in("id", ids);
    if (tracksError) throw new Error(tracksError.message);

    const byId = new Map<string, any>((tracks ?? []).map((track: any) => [track.id, track]));
    const result = rows.map((link) => {
      const track = byId.get(link.track_id);
      const available = Boolean(
        track
        && track.user_id === context.userId
        && track.source_type === "upload"
        && track.moderation_status === "active"
        && track.audio_url,
      );
      return {
        relation_created_at: link.created_at,
        is_primary: link.is_primary,
        track_id: link.track_id,
        title: track?.title ?? "Track no longer available",
        duration_seconds: track?.duration_seconds ?? null,
        cover_url: track?.cover_url ?? track?.art_url ?? null,
        audio_url: available ? track.audio_url : null,
        is_published: track?.is_published ?? false,
        unavailable: !available,
      };
    });

    result.sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      const byDate = a.relation_created_at.localeCompare(b.relation_created_at);
      return byDate || a.track_id.localeCompare(b.track_id);
    });

    return { tracks: result };
  });

export const listLinkableProjectTracks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      versionId: z.string().uuid(),
      search: z.string().trim().max(120).optional().default(""),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwnedProjectVersion(context.supabase, context.userId, data.projectId, data.versionId);

    const { data: links, error: linksError } = await (context.supabase as any)
      .from("project_version_tracks")
      .select("track_id")
      .eq("user_id", context.userId)
      .eq("project_id", data.projectId)
      .eq("version_prompt_id", data.versionId);
    if (linksError) throw new Error(linksError.message);
    const linkedIds = new Set<string>((links ?? []).map((row: any) => row.track_id));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = (supabaseAdmin.from("tracks") as any)
      .select("id, title, duration_seconds, art_url, cover_url, is_published, created_at")
      .eq("user_id", context.userId)
      .eq("source_type", "upload")
      .eq("moderation_status", "active")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.search) query = query.ilike("title", `%${data.search}%`);

    const { data: tracks, error } = await query;
    if (error) throw new Error(error.message);

    const result: LinkableTrack[] = (tracks ?? []).map((track: any) => ({
      id: track.id,
      title: track.title,
      duration_seconds: track.duration_seconds,
      cover_url: track.cover_url ?? track.art_url ?? null,
      is_published: track.is_published === true,
      linked: linkedIds.has(track.id),
    }));

    return { tracks: result };
  });

export const linkProjectVersionTracks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      versionId: z.string().uuid(),
      trackIds: idsSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase.rpc as any)("link_project_version_tracks", {
      _project_id: data.projectId,
      _version_prompt_id: data.versionId,
      _track_ids: data.trackIds,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; linked_count: number };
  });

export const unlinkProjectVersionTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      versionId: z.string().uuid(),
      trackId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase.rpc as any)("unlink_project_version_track", {
      _project_id: data.projectId,
      _version_prompt_id: data.versionId,
      _track_id: data.trackId,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean };
  });

export const setPrimaryProjectVersionTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      versionId: z.string().uuid(),
      trackId: z.string().uuid().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase.rpc as any)("set_primary_project_version_track", {
      _project_id: data.projectId,
      _version_prompt_id: data.versionId,
      _track_id: data.trackId,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; primary_track_id: string | null };
  });
