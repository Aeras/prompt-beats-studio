import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const userIdInput = z.object({ userId: z.string().uuid() });
const followListInput = z.object({
  userId: z.string().uuid(),
  mode: z.enum(["followers", "following"]),
  page: z.number().int().min(0).max(500).default(0),
});
const notificationPageInput = z.object({
  page: z.number().int().min(0).max(500).default(0),
});
const notificationIdInput = z.object({ notificationId: z.string().uuid() });
const preferencesInput = z.object({
  newTrackEnabled: z.boolean(),
  newFollowerEnabled: z.boolean(),
});

export type FollowProfile = {
  id: string;
  handle: string;
  displayName: string | null;
  artistAlias: string | null;
  avatarUrl: string | null;
  staffBadge: string | null;
};

export type NotificationItem = {
  id: string;
  type: "new_track" | "new_follower";
  createdAt: string;
  readAt: string | null;
  actor: FollowProfile | null;
  track: { id: string; title: string } | null;
  targetAvailable: boolean;
};

const PAGE_SIZE = 20;

function toProfile(profile: any): FollowProfile | null {
  if (!profile?.id || !profile?.handle) return null;
  return {
    id: profile.id,
    handle: profile.handle,
    displayName: profile.display_name ?? null,
    artistAlias: profile.artist_alias ?? null,
    avatarUrl: profile.avatar_url ?? null,
    staffBadge: profile.staff_badge ?? null,
  };
}

async function followSummary(supabaseAdmin: any, viewerId: string, userId: string) {
  const [followers, following, relation] = await Promise.all([
    supabaseAdmin
      .from("user_follows")
      .select("id", { count: "exact", head: true })
      .eq("followed_user_id", userId),
    supabaseAdmin
      .from("user_follows")
      .select("id", { count: "exact", head: true })
      .eq("follower_user_id", userId),
    viewerId === userId
      ? Promise.resolve({ data: null, error: null })
      : supabaseAdmin
          .from("user_follows")
          .select("id")
          .eq("follower_user_id", viewerId)
          .eq("followed_user_id", userId)
          .maybeSingle(),
  ]);
  if (followers.error) throw new Error(followers.error.message);
  if (following.error) throw new Error(following.error.message);
  if (relation.error) throw new Error(relation.error.message);
  return {
    followerCount: followers.count ?? 0,
    followingCount: following.count ?? 0,
    isFollowing: Boolean(relation.data),
  };
}

export const getCreatorFollowSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => userIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target, error } = await (supabaseAdmin.from("profiles") as any)
      .select("id")
      .eq("id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!target) throw new Error("Creator not found.");
    return followSummary(supabaseAdmin as any, context.userId, data.userId);
  });

export const followCreator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => userIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("follow_creator", {
      _target_user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return followSummary(supabaseAdmin as any, context.userId, data.userId);
  });

export const unfollowCreator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => userIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("unfollow_creator", {
      _target_user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return followSummary(supabaseAdmin as any, context.userId, data.userId);
  });

export const listCreatorFollowProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => followListInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const from = data.page * PAGE_SIZE;
    const to = from + PAGE_SIZE;
    const idColumn = data.mode === "followers" ? "follower_user_id" : "followed_user_id";
    const filterColumn = data.mode === "followers" ? "followed_user_id" : "follower_user_id";
    const { data: rows, error } = await (supabaseAdmin.from("user_follows") as any)
      .select(`${idColumn}, created_at`)
      .eq(filterColumn, data.userId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);
    const pageRows = (rows ?? []).slice(0, PAGE_SIZE);
    const ids = pageRows.map((row: any) => row[idColumn]).filter(Boolean);
    if (!ids.length) return { profiles: [] as FollowProfile[], hasMore: false };

    const { data: profiles, error: profilesError } = await (supabaseAdmin.from("public_profiles") as any)
      .select("id, handle, display_name, artist_alias, avatar_url, staff_badge")
      .in("id", ids);
    if (profilesError) throw new Error(profilesError.message);
    const map = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
    return {
      profiles: ids.map((id: string) => toProfile(map.get(id))).filter(Boolean) as FollowProfile[],
      hasMore: (rows ?? []).length > PAGE_SIZE,
    };
  });

export const getUnreadNotificationCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await (context.supabase as any)
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const listNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => notificationPageInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const from = data.page * PAGE_SIZE;
    const to = from + PAGE_SIZE;
    const { data: rows, error } = await (context.supabase as any)
      .from("notifications")
      .select("id, type, actor_user_id, track_id, created_at, read_at")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);

    const pageRows = (rows ?? []).slice(0, PAGE_SIZE);
    const actorIds = [...new Set(pageRows.map((row: any) => row.actor_user_id).filter(Boolean))];
    const trackIds = [...new Set(pageRows.map((row: any) => row.track_id).filter(Boolean))];

    const actorMap = new Map<string, any>();
    if (actorIds.length) {
      const { data: actors, error: actorError } = await (context.supabase as any)
        .from("public_profiles")
        .select("id, handle, display_name, artist_alias, avatar_url, staff_badge")
        .in("id", actorIds);
      if (actorError) throw new Error(actorError.message);
      for (const actor of actors ?? []) actorMap.set(actor.id, actor);
    }

    const trackMap = new Map<string, any>();
    if (trackIds.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: tracks, error: trackError } = await (supabaseAdmin.from("tracks") as any)
        .select("id, title, is_published, moderation_status")
        .in("id", trackIds);
      if (trackError) throw new Error(trackError.message);
      for (const track of tracks ?? []) {
        if (track.is_published === true && track.moderation_status === "active") trackMap.set(track.id, track);
      }
    }

    const notifications: NotificationItem[] = pageRows.map((row: any) => {
      const actor = row.actor_user_id ? toProfile(actorMap.get(row.actor_user_id)) : null;
      const trackRow = row.track_id ? trackMap.get(row.track_id) : null;
      const track = trackRow ? { id: trackRow.id, title: trackRow.title } : null;
      const targetAvailable = row.type === "new_track" ? Boolean(track) : Boolean(actor);
      return {
        id: row.id,
        type: row.type,
        createdAt: row.created_at,
        readAt: row.read_at ?? null,
        actor,
        track,
        targetAvailable,
      };
    });

    return { notifications, hasMore: (rows ?? []).length > PAGE_SIZE };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => notificationIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.notificationId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await (context.supabase as any)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("notification_preferences")
      .select("new_track_enabled, new_follower_enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      newTrackEnabled: data?.new_track_enabled ?? true,
      newFollowerEnabled: data?.new_follower_enabled ?? true,
    };
  });

export const updateNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => preferencesInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("notification_preferences")
      .upsert({
        user_id: context.userId,
        new_track_enabled: data.newTrackEnabled,
        new_follower_enabled: data.newFollowerEnabled,
      }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ...data };
  });
