import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanTrackStorage } from "@/lib/track-moderation.functions";
import { isSafeOwnedAudioKey, isSafeOwnedCoverPath } from "@/lib/storage-paths";
import { normalizeExternalTrackSource, type ExternalTrackSourceType } from "@/lib/track-sources";
import { CREATED_WITH_OPTIONS } from "@/lib/created-with";

const createdWithSchema = z.enum(CREATED_WITH_OPTIONS);

const trackInput = z.object({
  title: z.string().trim().min(1).max(120),
  genre: z.string().trim().min(1).max(60).default("Other / Experimental"),
  prompt: z.string().trim().max(4000).default(""),
  lyrics: z.string().trim().max(8000).default(""),
  audio_url: z.string().url(),
  audio_type: z.enum(["link", "upload"]).default("upload"),
  source_type: z.enum(["upload", "suno", "udio"]).default("upload"),
  created_with: createdWithSchema.nullable().optional(),
  audio_key: z.string().max(500).nullable().optional(),
  duration_seconds: z.number().int().min(0).max(60 * 60).optional(),
  cover_url: z.string().url().max(1000).optional(),
  is_published: z.boolean().default(true),
  prompt_is_public: z.boolean().default(true),
  lyrics_is_public: z.boolean().default(true),
  allow_download: z.boolean().default(false),
});

const TRACK_COLUMNS =
  "id, user_id, title, genre, prompt, lyrics, prompt_is_public, lyrics_is_public, audio_url, audio_type, source_type, source_url, source_id, created_with, allow_download, art_url, cover_url, duration_seconds, plays, is_published, created_at";


function sanitizeTrackContent(track: any, viewerId?: string | null) {
  if (!track) return track;
  const owner = Boolean(viewerId && track.user_id === viewerId);
  return {
    ...track,
    prompt: owner || track.prompt_is_public !== false ? (track.prompt ?? "") : "",
    lyrics: owner || track.lyrics_is_public !== false ? (track.lyrics ?? "") : "",
  };
}

const SUNO_HOSTS = new Set(["suno.com", "www.suno.com"]);
const SUNO_ID = /^[A-Za-z0-9_-]{6,128}$/;

function hasExplicitUrlPort(value: string): boolean {
  const authority = value.match(/^(?:https?:)?\/\/([^/?#]*)/i)?.[1];
  if (!authority) return false;
  return /:\d+$/.test(authority.split("@").at(-1) ?? "");
}

async function resolveSunoShareLink(rawUrl: string): Promise<ReturnType<typeof normalizeExternalTrackSource>> {
  let current: URL;
  try { current = new URL(rawUrl.trim()); } catch { return null; }
  if (current.protocol !== "https:" || current.port !== "" || hasExplicitUrlPort(rawUrl) || current.username || current.password || !SUNO_HOSTS.has(current.hostname.toLowerCase())) return null;
  const parts = current.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "s" || !SUNO_ID.test(parts[1] ?? "")) return null;

  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
      if (response.status < 300 || response.status >= 400) return normalizeExternalTrackSource("suno", current.toString());
      const location = response.headers.get("location");
      if (!location) return null;
      let next: URL;
      try { next = new URL(location, current); } catch { return null; }
      if (next.protocol !== "https:" || next.port !== "" || hasExplicitUrlPort(location) || next.username || next.password || !SUNO_HOSTS.has(next.hostname.toLowerCase())) return null;
      current = next;
    }
  } catch {
    return null;
  }
  return null;
}

async function resolveExternalTrackSource(sourceType: ExternalTrackSourceType, rawUrl: string) {
  const direct = normalizeExternalTrackSource(sourceType, rawUrl);
  if (direct || sourceType !== "suno") return direct;
  return resolveSunoShareLink(rawUrl);
}

export const incrementTrackPlay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ trackId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: plays, error } = await supabase.rpc("increment_track_play", { _track_id: data.trackId });
    if (error) throw new Error("Could not record track play");
    return { plays: typeof plays === "number" ? plays : null };
  });

export const listPublishedTracks = createServerFn({ method: "GET" }).handler(async () => {
  const { createPublicServerClient } = await import("@/lib/supabase-public.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const supabase = createPublicServerClient();
  const { data, error } = await (supabaseAdmin.from("tracks") as any)
    .select(TRACK_COLUMNS)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { tracks: [], error: error.message };

  const ids = [...new Set((data ?? []).map((t: any) => t.user_id))] as string[];
  const handles = new Map<string, string>();
  const names = new Map<string, string>();
  const badges = new Map<string, string | null>();
  if (ids.length) {
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, handle, display_name, artist_alias, staff_badge")
      .in("id", ids);
    for (const p of profiles ?? []) {
      if (!p.id) continue;
      handles.set(p.id, p.handle ?? "unknown");
      names.set(p.id, p.artist_alias || p.display_name || p.handle || "");
      badges.set(p.id, p.staff_badge);
    }
  }
  return {
    tracks: (data ?? []).map((t: any) => ({
      ...sanitizeTrackContent(t),
      handle: `@${handles.get(t.user_id) ?? "unknown"}`,
      creator_name: names.get(t.user_id) ?? "",
      staff_badge: badges.get(t.user_id) ?? null,
    })),
    error: null as string | null,
  };
});

export const getPublicTrackById = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { createPublicServerClient, getUserIdFromRequest } = await import("@/lib/supabase-public.server");
    const request = getRequest();
    const authorization = request?.headers.get("authorization") ?? null;
    const accessToken = authorization?.replace(/^Bearer\s+/i, "") ?? null;
    const viewerId = request && accessToken ? await getUserIdFromRequest(request) : null;
    const supabase = viewerId && accessToken ? createPublicServerClient(accessToken) : createPublicServerClient();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: track } = await (supabaseAdmin.from("tracks") as any)
      .select(TRACK_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (!track || (!track.is_published && track.user_id !== viewerId)) return { track: null, artist: null };
    const { data: artist } = await supabase
      .from("public_profiles")
      .select("id, handle, display_name, artist_alias, avatar_url, staff_badge")
      .eq("id", track.user_id)
      .maybeSingle();
    return { track: sanitizeTrackContent(track, viewerId), artist: artist?.id ? { ...artist, id: artist.id, handle: artist.handle ?? "" } : null };
  });

export const listMyTracks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin.from("tracks") as any)
      .select(TRACK_COLUMNS)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { tracks: data ?? [] };
  });

export const createTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => trackInput.parse(input))
  .handler(async ({ data, context }) => {
    if (data.source_type === "upload" && (!data.audio_key || !isSafeOwnedAudioKey(data.audio_key, context.userId) || data.audio_type !== "upload")) {
      throw new Error("Invalid uploaded audio reference");
    }
    if (data.source_type !== "upload" && data.created_with) throw new Error("Created with is only available for uploaded tracks");

    const externalSource = data.source_type === "upload"
      ? null
      : await resolveExternalTrackSource(data.source_type as ExternalTrackSourceType, data.audio_url);
    if (data.source_type !== "upload" && !externalSource) throw new Error("Invalid external track link");

    const { data: row, error } = await (context.supabase.from("tracks") as any)
      .insert({
        ...data,
        created_with: externalSource ? null : data.created_with ?? null,
        audio_url: externalSource?.sourceUrl ?? data.audio_url,
        audio_type: externalSource ? "link" : data.audio_type,
        audio_key: externalSource ? null : data.audio_key ?? null,
        cover_url: externalSource ? null : data.cover_url ?? null,
        allow_download: externalSource ? false : data.allow_download === true,
        source_type: externalSource?.sourceType ?? "upload",
        source_url: externalSource?.sourceUrl ?? null,
        source_id: externalSource?.sourceId ?? null,
        duration_seconds: data.duration_seconds ?? null,
        user_id: context.userId,
      })
      .select(TRACK_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { track: row };
  });

export const updateTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(120),
      genre: z.string().trim().min(1).max(60),
      prompt: z.string().trim().max(4000).default(""),
      lyrics: z.string().trim().max(8000).default(""),
      is_published: z.boolean(),
      prompt_is_public: z.boolean().default(true),
      lyrics_is_public: z.boolean().default(true),
      allow_download: z.boolean().default(false),
      source_type: z.enum(["upload", "suno", "udio", "legacy_link"]),
      created_with: createdWithSchema.nullable().optional(),
      source_url: z.string().url().max(1000).optional(),
      new_audio_url: z.string().url().max(1000).optional(),
      new_audio_key: z.string().max(500).optional(),
      new_cover_url: z.string().url().max(1000).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.source_type === "upload" && data.new_audio_key && !isSafeOwnedAudioKey(data.new_audio_key, context.userId)) {
      throw new Error("Invalid uploaded audio reference");
    }
    if (data.source_type !== "upload" && data.created_with) throw new Error("Created with is only available for uploaded tracks");
    const externalSource = data.source_type === "upload" || data.source_type === "legacy_link"
      ? null
      : await resolveExternalTrackSource(data.source_type, data.source_url ?? "");
    if (data.source_type !== "upload" && data.source_type !== "legacy_link" && !externalSource) {
      throw new Error("Invalid external track link");
    }
    const { data: result, error } = await context.supabase.rpc("edit_track_with_cleanup", {
      _track_id: data.id,
      _title: data.title,
      _genre: data.genre,
      _prompt: data.prompt,
      _lyrics: data.lyrics,
      _is_published: data.is_published,
      _source_type: data.source_type,
      _created_with: data.source_type === "upload" ? data.created_with ?? null : null,
      _source_url: externalSource?.sourceUrl ?? null,
      _source_id: externalSource?.sourceId ?? null,
      _new_audio_url: data.new_audio_url ?? null,
      _new_audio_key: data.new_audio_key ?? null,
      _new_cover_url: data.new_cover_url ?? null,
      _allow_download: data.source_type === "upload" ? data.allow_download === true : false,
    } as never);
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: visibilityError } = await supabaseAdmin
      .from("tracks")
      .update({
        prompt_is_public: data.prompt_is_public,
        lyrics_is_public: data.lyrics_is_public,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (visibilityError) throw new Error(visibilityError.message);
    const payload = result as { track?: unknown; cleanup_id?: string | null } | null;
    if (payload?.cleanup_id) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      try {
        await cleanTrackStorage(supabaseAdmin, payload.cleanup_id);
      } catch {
        return { track: payload?.track ?? null, storageCleanupPending: true };
      }
    }
    return { track: payload?.track ?? null, storageCleanupPending: false };
  });

export const discardUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ audioKey: z.string().max(500).optional(), coverPath: z.string().max(500).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let audioKey: string | null = null;
    let coverPath: string | null = null;

    if (data.audioKey && isSafeOwnedAudioKey(data.audioKey, context.userId)) {
      const { data: inUse, error } = await supabaseAdmin.from("tracks").select("id").eq("audio_key", data.audioKey).limit(1);
      if (error) throw new Error(`Could not inspect orphan audio reference: ${error.message}`);
      if (!inUse?.length) audioKey = data.audioKey;
    }

    if (data.coverPath && isSafeOwnedCoverPath(data.coverPath, context.userId)) {
      const { data: coverInUse, error } = await supabaseAdmin.from("tracks").select("id").like("cover_url", `%/track-covers/${data.coverPath}`).limit(1);
      if (error) throw new Error(`Could not inspect orphan cover reference: ${error.message}`);
      if (!coverInUse?.length) coverPath = data.coverPath;
    }

    if (!audioKey && !coverPath) return { ok: true };

    const { data: cleanup, error: cleanupError } = await supabaseAdmin
      .from("track_storage_cleanup")
      .insert({ track_id: null, owner_id: context.userId, audio_key: audioKey, cover_path: coverPath, created_by: context.userId, cleanup_type: "abandoned_upload" })
      .select("id")
      .single();
    if (cleanupError || !cleanup) throw new Error(`Orphaned upload cleanup could not be queued: ${cleanupError?.message ?? "no cleanup id returned"}`);

    if (coverPath) {
      const { error: lockError } = await supabaseAdmin.from("track_cover_cleanup_locks").insert({ cover_path: coverPath, cleanup_id: cleanup.id });
      if (lockError) {
        await supabaseAdmin.from("track_storage_cleanup").update({ cover_path: null, last_error: "cover reservation unavailable; cover skipped" }).eq("id", cleanup.id);
      }
    }

    await cleanTrackStorage(supabaseAdmin, cleanup.id);
    return { ok: true };
  });

export const deleteTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("delete_track_with_cleanup", { _track_id: data.id });
    if (error) throw new Error(error.message);
    const cleanupId = (result as { cleanup_id?: string | null } | null)?.cleanup_id ?? null;
    if (cleanupId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await cleanTrackStorage(supabaseAdmin, cleanupId);
    }
    return { ok: true, storageCleanupPending: false };
  });

const trendingRows = z.array(z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  genre: z.string(),
  prompt: z.string(),
  lyrics: z.string(),
  audio_url: z.string(),
  audio_type: z.string(),
  source_type: z.enum(["upload", "suno", "udio", "legacy_link"]),
  source_url: z.string().nullable(),
  source_id: z.string().nullable(),
  created_with: createdWithSchema.nullable(),
  allow_download: z.boolean(),
  art_url: z.string().nullable(),
  cover_url: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  plays: z.number(),
  is_published: z.literal(true),
  created_at: z.string(),
  likes: z.number().int().nonnegative(),
})).max(100);

export const listTrendingTracks = createServerFn({ method: "GET" }).handler(async () => {
  const { createPublicServerClient } = await import("@/lib/supabase-public.server");
  const supabase = createPublicServerClient();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("list_trending_tracks");
  const parsed = trendingRows.safeParse(data);
  if (error || !parsed.success) return { tracks: [], error: "Trending is temporarily unavailable. Please try again later." };

  const rows = parsed.data;
  const ids = [...new Set(rows.map((t) => t.user_id))];
  const handles = new Map<string, string>();
  const names = new Map<string, string>();
  const badges = new Map<string, string | null>();
  if (ids.length) {
    const { data: profiles } = await supabase.from("public_profiles").select("id, handle, display_name, artist_alias, staff_badge").in("id", ids);
    for (const p of profiles ?? []) {
      if (!p.id) continue;
      handles.set(p.id, p.handle ?? "unknown");
      names.set(p.id, p.artist_alias || p.display_name || p.handle || "");
      badges.set(p.id, p.staff_badge);
    }
  }

  const tracks = rows.map((t) => ({ ...t, handle: `@${handles.get(t.user_id) ?? "unknown"}`, creator_name: names.get(t.user_id) ?? "", staff_badge: badges.get(t.user_id) ?? null }));
  return { tracks, error: null as string | null };
});

export const listLikedTracks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: likes, error } = await context.supabase.from("likes").select("track_id, created_at").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    const ids = (likes ?? []).map((l) => l.track_id);
    if (!ids.length) return { tracks: [] };

    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabase = createPublicServerClient();
    const { data: tracks } = await (supabaseAdmin.from("tracks") as any).select(TRACK_COLUMNS).in("id", ids).eq("is_published", true).eq("moderation_status", "active");

    const rows = (tracks ?? []).map((track: any) => sanitizeTrackContent(track, context.userId));
    const userIds = [...new Set(rows.map((t: any) => t.user_id))] as string[];
    const handles = new Map<string, string>();
    if (userIds.length) {
      const { data: profiles } = await supabase.from("public_profiles").select("id, handle").in("id", userIds);
      for (const p of profiles ?? []) { if (p.id) handles.set(p.id, p.handle ?? "unknown"); }
    }
    const order = new Map(ids.map((id, i) => [id, i]));
    return {
      tracks: rows
        .map((t: any) => ({ ...t, handle: `@${handles.get(t.user_id) ?? "unknown"}` }))
        .sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
    };
  });
