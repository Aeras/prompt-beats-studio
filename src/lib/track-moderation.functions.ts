import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { isSafeOwnedAudioKey, isSafeOwnedCoverPath } from "@/lib/storage-paths";

export const TRACK_MODERATION_REASONS = [
  { code: "reported_third_party_rights", label: "Reported third-party rights issue" },
  { code: "suspected_copyright_rights", label: "Suspected copyright / rights issue" },
  { code: "policy_violation", label: "Policy violation" },
  { code: "harassment_abusive_content", label: "Harassment / abusive content" },
  { code: "spam_deceptive_content", label: "Spam / deceptive content" },
  { code: "other", label: "Other" },
] as const;

const reasonCode = z.enum(
  TRACK_MODERATION_REASONS.map((reason) => reason.code) as [string, ...string[]],
);
const trackId = z.string().guid();

export type StaffTrack = {
  id: string;
  user_id: string;
  title: string;
  genre: string;
  prompt: string;
  lyrics: string;
  audio_url: string;
  audio_type: string;
  art_url: string | null;
  cover_url: string | null;
  duration_seconds: number | null;
  plays: number;
  is_published: boolean;
  created_at: string;
  moderation_status: "active" | "locked";
  moderation_reason_code: string | null;
  moderation_reason_text: string | null;
  moderation_locked_at: string | null;
  can_delete_track?: boolean;
};

type TrackStorageCleanup = {
  id: string;
  owner_id: string | null;
  audio_key: string | null;
  cover_path: string | null;
  status: "pending" | "complete";
  attempt_count: number;
};

async function requireTrackCapability(
  supabase: SupabaseClient<Database>,
  capability: "can_lock_tracks" | "can_delete_tracks",
) {
  const { data, error } = await supabase.rpc("has_moderation_capability", {
    _capability: capability,
  });
  if (error || data !== true) throw new Error("Not allowed");
}

export const getStaffTrack = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ trackId }).parse(input))
  .handler(async ({ data, context }) => {
    await requireTrackCapability(context.supabase, "can_lock_tracks");
    const { data: result, error } = await context.supabase.rpc("staff_get_track", {
      _track_id: data.trackId,
    });
    if (error) throw new Error(error.message);
    return result as unknown as StaffTrack | null;
  });

export const lockStaffTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ trackId, reasonCode, reasonText: z.string().trim().max(500).nullish() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireTrackCapability(context.supabase, "can_lock_tracks");
    const { error } = await context.supabase.rpc("staff_lock_track", {
      _track_id: data.trackId,
      _reason_code: data.reasonCode,
      ...(data.reasonText != null ? { _reason_text: data.reasonText } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true, status: "locked" as const };
  });

export const unlockStaffTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ trackId }).parse(input))
  .handler(async ({ data, context }) => {
    await requireTrackCapability(context.supabase, "can_lock_tracks");
    const { error } = await context.supabase.rpc("staff_unlock_track", { _track_id: data.trackId });
    if (error) throw new Error(error.message);
    return { ok: true, status: "active" as const };
  });

export const deleteStaffTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ trackId }).parse(input))
  .handler(async ({ data, context }) => {
    await requireTrackCapability(context.supabase, "can_delete_tracks");
    const { data: result, error } = await context.supabase.rpc("staff_delete_track", {
      _track_id: data.trackId,
    });
    if (error) throw new Error(error.message);

    const cleanupId = (result as { cleanup_id?: string | null } | null)?.cleanup_id ?? null;
    if (cleanupId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await cleanTrackStorage(supabaseAdmin, cleanupId);
    }
    return { ok: true, storageCleanupPending: false };
  });

export async function cleanTrackStorage(supabase: SupabaseClient<Database>, cleanupId: string) {
  const { data, error } = await supabase.rpc("staff_get_track_storage_cleanup", {
    _cleanup_id: cleanupId,
  });
  if (error) throw new Error(error.message);
  const cleanup = data as unknown as TrackStorageCleanup;
  const failures: string[] = [];

  if (cleanup.audio_key) {
    try {
      if (!cleanup.owner_id || !isSafeOwnedAudioKey(cleanup.audio_key, cleanup.owner_id)) {
        throw new Error("Unsafe owned audio storage path");
      }
      const { deleteOwnedR2Object } = await import("@/lib/r2.server");
      await deleteOwnedR2Object(cleanup.audio_key, cleanup.owner_id);
    } catch (error) {
      failures.push(
        `audio cleanup failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  if (cleanup.cover_path) {
    try {
      if (!cleanup.owner_id || !isSafeOwnedCoverPath(cleanup.cover_path, cleanup.owner_id)) {
        throw new Error("Unsafe owned cover storage path");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.storage
        .from("track-covers")
        .remove([cleanup.cover_path]);
      if (error) failures.push(`cover cleanup failed: ${error.message}`);
    } catch (error) {
      failures.push(
        `cover cleanup failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  if (failures.length) {
    await supabase.rpc("staff_fail_track_storage_cleanup", {
      _cleanup_id: cleanupId,
      _error: failures.join("; "),
    });
    throw new Error(
      `Track deleted, but storage cleanup is pending (cleanup ${cleanupId}): ${failures.join("; ")}`,
    );
  }
  const { error: completeError } = await supabase.rpc("staff_complete_track_storage_cleanup", {
    _cleanup_id: cleanupId,
  });
  if (completeError)
    throw new Error(
      `Track deleted, but storage cleanup could not be recorded: ${completeError.message}`,
    );
}

export const retryStaffTrackStorageCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ cleanupId: trackId }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cleanup, error: cleanupError } = await supabaseAdmin
      .from("track_storage_cleanup")
      .select("created_by, cleanup_type")
      .eq("id", data.cleanupId)
      .maybeSingle();
    if (cleanupError || !cleanup) throw new Error("Cleanup record not found");

    let authorized = false;
    try {
      await requireTrackCapability(context.supabase, "can_delete_tracks");
      authorized = true;
    } catch {
      authorized =
        (cleanup as { created_by?: string | null; cleanup_type?: string }).created_by ===
          context.userId && (cleanup as { cleanup_type?: string }).cleanup_type === "audio_replace";
    }
    if (!authorized) throw new Error("Not allowed");

    await cleanTrackStorage(supabaseAdmin, data.cleanupId);
    return { ok: true };
  });
