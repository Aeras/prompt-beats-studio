import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  creatorPublicState,
  isPublicAccountEligible,
  isPublicTrackEligible,
  sanitizePublicTrackText,
  type CreatorPublicState,
} from "@/lib/public-eligibility.shared";

const PUBLIC_PROFILE_COLUMNS =
  "id, handle, display_name, artist_alias, avatar_url, bio, website_url, instagram_url, tiktok_url, youtube_url, x_url, staff_badge";

const PUBLIC_TRACK_COLUMNS =
  "id, user_id, title, genre, prompt, lyrics, prompt_is_public, lyrics_is_public, contains_explicit_lyrics, audio_url, audio_type, source_type, source_url, source_id, created_with, allow_download, art_url, cover_url, duration_seconds, plays, is_published, moderation_status, created_at";

export type PublicProfileProjection = {
  id: string;
  handle: string | null;
  display_name: string | null;
  artist_alias: string | null;
  avatar_url: string | null;
  bio: string | null;
  website_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  x_url: string | null;
  staff_badge: string | null;
};

type PublicAccountState = {
  eligible: boolean;
  profile: PublicProfileProjection | null;
};

export type PublicTrackProjection = {
  id: string;
  user_id: string;
  title: string;
  genre: string;
  prompt: string;
  lyrics: string;
  prompt_is_public: boolean | null;
  lyrics_is_public: boolean | null;
  contains_explicit_lyrics: boolean | null;
  audio_url: string | null;
  audio_type: string | null;
  source_type: string | null;
  source_url: string | null;
  source_id: string | null;
  created_with: string | null;
  allow_download: boolean | null;
  art_url: string | null;
  cover_url: string | null;
  duration_seconds: number | null;
  plays: number | null;
  is_published: boolean;
  moderation_status: string;
  created_at: string | null;
};

export type PublicCreatorProjection = {
  profile: PublicProfileProjection;
  tracks: PublicTrackProjection[];
  state: Exclude<CreatorPublicState, "unavailable">;
};

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

async function getPublicAccountStates(userIds: string[]): Promise<Map<string, PublicAccountState>> {
  const ids = uniqueIds(userIds);
  const result = new Map<string, PublicAccountState>();
  if (ids.length === 0) return result;

  const [profilesResult, rolesResult, privateResult] = await Promise.all([
    (supabaseAdmin.from("public_profiles") as any).select(PUBLIC_PROFILE_COLUMNS).in("id", ids),
    (supabaseAdmin.from("user_roles") as any)
      .select("user_id, moderation_status")
      .in("user_id", ids),
    (supabaseAdmin.from("profile_private") as any).select("user_id, is_banned").in("user_id", ids),
  ]);

  if (profilesResult.error || rolesResult.error || privateResult.error) {
    throw new Error("Public eligibility could not be resolved.");
  }

  const profiles = new Map<string, PublicProfileProjection>();
  for (const profile of profilesResult.data ?? []) {
    if (profile?.id) profiles.set(profile.id, profile as PublicProfileProjection);
  }
  const moderationByUser = new Map<string, string | null>();
  for (const role of rolesResult.data ?? []) {
    if (role?.user_id) moderationByUser.set(role.user_id, role.moderation_status ?? null);
  }
  const bannedByUser = new Map<string, boolean | null>();
  for (const row of privateResult.data ?? []) {
    if (row?.user_id) bannedByUser.set(row.user_id, row.is_banned ?? null);
  }

  for (const id of ids) {
    const profile = profiles.get(id) ?? null;
    result.set(id, {
      profile,
      eligible: isPublicAccountEligible({
        moderationStatus: moderationByUser.get(id) ?? null,
        isBanned: bannedByUser.get(id) ?? null,
        handle: profile?.handle ?? null,
      }),
    });
  }
  return result;
}

function projectEligibleTrack(track: any): PublicTrackProjection {
  return sanitizePublicTrackText(track) as PublicTrackProjection;
}

export async function resolveEligiblePublicTrack(trackId: string): Promise<{
  track: PublicTrackProjection;
  artist: PublicProfileProjection;
} | null> {
  const { data: track, error } = await (supabaseAdmin.from("tracks") as any)
    .select(PUBLIC_TRACK_COLUMNS)
    .eq("id", trackId)
    .maybeSingle();
  if (error) throw new Error("Public Track could not be resolved.");
  if (!track?.id || !track.user_id) return null;

  const account = (await getPublicAccountStates([track.user_id])).get(track.user_id);
  if (
    !account?.profile ||
    !isPublicTrackEligible({
      isPublished: track.is_published,
      moderationStatus: track.moderation_status,
      creatorEligible: account.eligible,
    })
  ) {
    return null;
  }

  return { track: projectEligibleTrack(track), artist: account.profile };
}

export async function listEligiblePublicTracks(limit = 100): Promise<
  Array<
    PublicTrackProjection & {
      handle: string;
      creator_name: string;
      staff_badge: string | null;
    }
  >
> {
  const boundedLimit = Math.max(1, Math.min(limit, 100));
  const { data: tracks, error } = await (supabaseAdmin.from("tracks") as any)
    .select(PUBLIC_TRACK_COLUMNS)
    .eq("is_published", true)
    .eq("moderation_status", "active")
    .order("created_at", { ascending: false })
    .limit(boundedLimit);
  if (error) throw new Error("Public Tracks could not be loaded.");

  const accountStates = await getPublicAccountStates(
    (tracks ?? []).map((track: any) => track.user_id).filter(Boolean),
  );

  return (tracks ?? []).flatMap((track: any) => {
    const account = accountStates.get(track.user_id);
    if (!account?.eligible || !account.profile?.handle) return [];
    const projected = projectEligibleTrack(track);
    return [
      {
        ...projected,
        handle: `@${account.profile.handle}`,
        creator_name:
          account.profile.artist_alias ||
          account.profile.display_name ||
          account.profile.handle ||
          "",
        staff_badge: account.profile.staff_badge ?? null,
      },
    ];
  });
}

async function loadCreatorTracks(userId: string): Promise<PublicTrackProjection[]> {
  const { data: tracks, error } = await (supabaseAdmin.from("tracks") as any)
    .select(PUBLIC_TRACK_COLUMNS)
    .eq("user_id", userId)
    .eq("is_published", true)
    .eq("moderation_status", "active")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Public creator Tracks could not be loaded.");
  return (tracks ?? []).map(projectEligibleTrack);
}

async function resolvePublicCreatorFromProfile(
  profile: PublicProfileProjection | null,
): Promise<PublicCreatorProjection | null> {
  if (!profile?.id) return null;
  const account = (await getPublicAccountStates([profile.id])).get(profile.id);
  if (!account?.eligible || !account.profile) return null;
  const tracks = await loadCreatorTracks(profile.id);
  return {
    profile: account.profile,
    tracks,
    state: creatorPublicState(true, tracks.length) as "thin" | "indexable",
  };
}

export async function resolvePublicCreatorByHandle(
  rawHandle: string,
): Promise<PublicCreatorProjection | null> {
  const handle = rawHandle.replace(/^@/, "").trim().toLowerCase();
  if (!handle) return null;
  const { data: profile, error } = await (supabaseAdmin.from("public_profiles") as any)
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw new Error("Public creator could not be resolved.");
  return resolvePublicCreatorFromProfile((profile as PublicProfileProjection | null) ?? null);
}

export async function resolvePublicCreatorById(
  creatorId: string,
): Promise<PublicCreatorProjection | null> {
  const { data: profile, error } = await (supabaseAdmin.from("public_profiles") as any)
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq("id", creatorId)
    .maybeSingle();
  if (error) throw new Error("Public creator could not be resolved.");
  return resolvePublicCreatorFromProfile((profile as PublicProfileProjection | null) ?? null);
}

export async function filterEligiblePublicCreatorIds(userIds: string[]): Promise<Set<string>> {
  const states = await getPublicAccountStates(userIds);
  return new Set(
    [...states.entries()].filter(([, state]) => state.eligible).map(([userId]) => userId),
  );
}

export async function listEligiblePublicSitemapIdentities(limit = 5000): Promise<{
  trackIds: string[];
  creatorHandles: string[];
}> {
  const boundedLimit = Math.max(1, Math.min(limit, 5000));
  const { data: tracks, error } = await (supabaseAdmin.from("tracks") as any)
    .select("id, user_id, is_published, moderation_status")
    .eq("is_published", true)
    .eq("moderation_status", "active")
    .order("created_at", { ascending: false })
    .limit(boundedLimit);
  if (error) throw new Error("Public sitemap identities could not be loaded.");

  const rows = (tracks ?? []).filter((track: any) => track?.id && track?.user_id);
  const states = await getPublicAccountStates(rows.map((track: any) => track.user_id));
  const eligibleRows = rows.filter((track: any) => {
    const account = states.get(track.user_id);
    return isPublicTrackEligible({
      isPublished: track.is_published,
      moderationStatus: track.moderation_status,
      creatorEligible: account?.eligible === true,
    });
  });

  const trackIds = eligibleRows.map((track: any) => track.id as string);
  const creatorHandles = [
    ...new Set(
      eligibleRows.flatMap((track: any) => {
        const handle = states.get(track.user_id)?.profile?.handle;
        return handle ? [handle] : [];
      }),
    ),
  ];
  return { trackIds, creatorHandles };
}
