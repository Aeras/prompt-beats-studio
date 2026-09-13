import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_MODEL_IDS, type AiModelId } from "@/lib/ai-models";
import { isSafeOwnedAudioKey, isSafeOwnedCoverPath } from "@/lib/storage-paths";

const adminUserId = z.string().uuid();
const accessMode = z.enum(["inherit", "custom"]);
export const BLOCK_REASONS = [
  { code: "platform_rules", label: "Violation of platform rules" },
  { code: "copyright_or_third_party_rights", label: "Copyright or third-party rights concern" },
  { code: "abuse_spam_or_harmful_activity", label: "Abuse, spam or harmful activity" },
  { code: "ai_or_platform_misuse", label: "Misuse of AI or platform features" },
  { code: "security_concern", label: "Security concern" },
  { code: "other", label: "Other" },
] as const;
const blockReasonCode = z.enum(BLOCK_REASONS.map((reason) => reason.code) as [string, ...string[]]);

async function requireAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("current_user_has_role", { _role: "admin" });
  if (error || data !== true) throw new Error("Not allowed");
}

async function requireCapability(supabase: any, capability: string) {
  const { data, error } = await supabase.rpc("has_moderation_capability", { _capability: capability });
  if (error || data !== true) throw new Error("Not allowed");
}

export type AdminOverview = {
  totalUsers: number;
  blockedUsers: number;
  songsGenerated: number;
  aiRequests: number;
  failedRequests: number;
  estimatedCostUsd: number;
  recentUsers: { id: string; handle: string; displayName: string | null; createdAt: string; blocked: boolean }[];
};

export type AdminUser = {
  id: string;
  email: string | null;
  created_at: string;
  handle: string | null;
  display_name: string | null;
  blocked: boolean;
  is_admin: boolean;
  role: "admin" | "senior_moderator" | "moderator" | "user";
  moderation_status: "active" | "suspended";
  generations: number;
};

export type AdminUserDetail = AdminUser & {
  ai_requests: number;
  model_access: { mode: "inherit" | "custom"; models: string[] };
  block_reason_code: string | null;
  block_reason_text: string | null;
  blocked_at: string | null;
};

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase);
    const { data, error } = await context.supabase.rpc("admin_overview");
    if (error) throw new Error(error.message);
    return data as unknown as AdminOverview;
  });

export const listAdminUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    search: z.string().trim().max(120).default(""),
    status: z.enum(["all", "active", "blocked"]).default("all"),
    page: z.number().int().min(0).default(0),
    pageSize: z.number().int().min(1).max(50).default(25),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await requireCapability(context.supabase, "can_view_users");
    const search = data.search.replace(/^@+/, "");
    const { data: result, error } = await context.supabase.rpc("admin_list_users", {
      _search: search, _status: data.status, _limit: data.pageSize, _offset: data.page * data.pageSize,
    });
    if (error) throw new Error(error.message);
    return result as unknown as { total: number; users: AdminUser[] };
  });

export const getAdminUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: adminUserId }).parse(input))
  .handler(async ({ data, context }) => {
    await requireCapability(context.supabase, "can_view_users");
    const { data: result, error } = await context.supabase.rpc("admin_user_detail", {
      _target_user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    if (!result) throw new Error("User not found");
    return result as unknown as AdminUserDetail;
  });

export const setAdminUserBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    userId: adminUserId,
    banned: z.boolean(),
    reasonCode: blockReasonCode.nullish(),
    reasonText: z.string().trim().max(500).nullish(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await requireCapability(context.supabase, data.banned ? "can_block_users" : "can_unblock_users");
    const reasonParams = data.banned
      ? {
          ...(data.reasonCode ? { _reason_code: data.reasonCode } : {}),
          ...(data.reasonText ? { _reason_text: data.reasonText } : {}),
        }
      : {};
    const { error } = await context.supabase.rpc("admin_set_user_banned", {
      _target_user_id: data.userId,
      _banned: data.banned,
      ...reasonParams,
    });
    if (error) throw new Error(error.message);
    return { ok: true, banned: data.banned };
  });

export const setAdminModelAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    userId: adminUserId,
    mode: accessMode,
    models: z.array(z.enum(AI_MODEL_IDS as [AiModelId, ...AiModelId[]])).max(AI_MODEL_IDS.length).default([]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { error } = await context.supabase.rpc("admin_set_model_access", {
      _target_user_id: data.userId, _access_mode: data.mode, _allowed_models: data.models,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const deleteInput = z.object({
  userId: adminUserId,
  confirmationEmail: z.string().trim().email(),
  blockRegistration: z.boolean().default(false),
  registrationReasonCode: blockReasonCode.nullish(),
  registrationReasonText: z.string().trim().max(500).nullish(),
});

export const setAdminUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: adminUserId, role: z.enum(["user", "moderator", "senior_moderator"]) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { error } = await context.supabase.rpc("admin_set_user_role", { _target_user_id: data.userId, _role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setModerationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: adminUserId, status: z.enum(["active", "suspended"]), reasonText: z.string().trim().max(500).nullish() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: capabilityError } = await context.supabase.rpc("has_moderation_capability", { _capability: "can_suspend_moderator" });
    if (capabilityError || allowed !== true) throw new Error("Not allowed");
    if (data.status === "suspended" && !data.reasonText?.trim()) throw new Error("A suspension reason is required.");
    const { error } = await context.supabase.rpc("admin_set_moderation_status", { _target_user_id: data.userId, _status: data.status, _reason_text: data.reasonText ?? null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const OWNER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type AccountCleanupRow = {
  id: string;
  owner_id: string;
  storage_kind: "r2" | "supabase";
  bucket: string | null;
  object_path: string;
  status: "pending" | "complete";
  attempt_count: number;
};

async function listOwnedStoragePaths(bucket: string, ownerId: string): Promise<string[]> {
  if (!OWNER_ID_RE.test(ownerId)) {
    console.error(`[admin] refusing unsafe ${bucket} storage folder path`);
    throw new Error(`${bucket} cleanup has an invalid owner path`);
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const paths: string[] = [];
  const prefixes = [ownerId];
  const queuedPrefixes = new Set(prefixes);
  const visitedPrefixes = new Set<string>();
  for (let index = 0; index < prefixes.length; index += 1) {
    const prefix = prefixes[index];
    if (visitedPrefixes.has(prefix)) continue;
    visitedPrefixes.add(prefix);
    if (prefix !== ownerId && !isSafeOwnedCoverPath(prefix, ownerId)) {
      console.error(`[admin] refusing unsafe ${bucket} storage folder path`);
      throw new Error(`${bucket} cleanup encountered an invalid nested path`);
    }
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`${bucket} cleanup listing failed: ${error.message}`);
      for (const item of data ?? []) {
        const objectPath = `${prefix}/${item.name}`;
        if (!isSafeOwnedCoverPath(objectPath, ownerId)) {
          console.error(`[admin] refusing unsafe ${bucket} cleanup path`);
          continue;
        }
        if (item.id) paths.push(objectPath);
        else if (!queuedPrefixes.has(objectPath)) {
          queuedPrefixes.add(objectPath);
          prefixes.push(objectPath);
        }
      }
      if (!data || data.length < 1000) break;
    }
  }
  return paths;
}
async function coverIsReferencedByAnotherTrack(supabaseAdmin: any, coverPath: string, ownerId: string): Promise<boolean> {
  const escapedPath = coverPath.replace(/([\\%_])/g, "\\$1");
  const { data: rawRefs, error: rawError } = await supabaseAdmin
    .from("tracks")
    .select("id")
    .neq("user_id", ownerId)
    .eq("cover_url", coverPath);
  if (rawError) throw new Error(`Cover reference check failed: ${rawError.message}`);
  if (rawRefs?.length) return true;

  const { data: urlRefs, error: urlError } = await supabaseAdmin
    .from("tracks")
    .select("id")
    .neq("user_id", ownerId)
    .like("cover_url", `%/track-covers/${escapedPath}`);
  if (urlError) throw new Error(`Cover reference check failed: ${urlError.message}`);
  return Boolean(urlRefs?.length);
}
async function queueAccountStorageCleanup(
  supabaseAdmin: any,
  ownerId: string,
  tracks: Array<{ audio_key: string | null; cover_url: string | null }>,
): Promise<number> {
  const rows: Array<Record<string, string>> = [];
  for (const track of tracks) {
    if (!track.audio_key) continue;
    if (!isSafeOwnedAudioKey(track.audio_key, ownerId)) {
      console.error("[admin] refusing unsafe account audio cleanup reference");
      continue;
    }
    rows.push({ owner_id: ownerId, storage_kind: "r2", bucket: "", object_path: track.audio_key });
  }

  for (const bucket of ["avatars", "track-covers"]) {
    for (const objectPath of await listOwnedStoragePaths(bucket, ownerId)) {
      rows.push({ owner_id: ownerId, storage_kind: "supabase", bucket, object_path: objectPath });
    }
  }

  if (!rows.length) return 0;
  const { error } = await supabaseAdmin
    .from("account_storage_cleanup")
    .upsert(rows, { onConflict: "storage_kind,bucket,object_path" });
  if (error) throw new Error(`Account storage cleanup could not be queued: ${error.message}`);
  return rows.length;
}

async function processAccountStorageCleanup(supabaseAdmin: any, ownerId: string): Promise<number> {
  const { data: rows, error } = await supabaseAdmin
    .from("account_storage_cleanup")
    .select("id, owner_id, storage_kind, bucket, object_path, status, attempt_count")
    .eq("owner_id", ownerId)
    .eq("status", "pending");
  if (error) throw new Error(`Account storage cleanup could not be inspected: ${error.message}`);

  let pending = 0;
  for (const row of (rows ?? []) as AccountCleanupRow[]) {
    try {
      if (row.storage_kind === "r2") {
        if (!isSafeOwnedAudioKey(row.object_path, ownerId)) {
          console.error("[admin] refusing unsafe queued account audio cleanup");
          await supabaseAdmin.from("account_storage_cleanup").update({ status: "complete", last_error: "unsafe path skipped" }).eq("id", row.id);
          continue;
        }
        const { deleteOwnedR2Object } = await import("@/lib/r2.server");
        await deleteOwnedR2Object(row.object_path, ownerId);
      } else if (row.bucket === "track-covers") {
        if (!isSafeOwnedCoverPath(row.object_path, ownerId)) {
          console.error("[admin] refusing unsafe queued account cover cleanup");
          await supabaseAdmin.from("account_storage_cleanup").update({ status: "complete", last_error: "unsafe path skipped" }).eq("id", row.id);
          continue;
        }
        if (await coverIsReferencedByAnotherTrack(supabaseAdmin, row.object_path, ownerId)) {
          await supabaseAdmin.from("account_storage_cleanup").update({ status: "complete", last_error: "shared cover preserved" }).eq("id", row.id);
          continue;
        }
        const { error: removeError } = await supabaseAdmin.storage.from(row.bucket).remove([row.object_path]);
        if (removeError) throw new Error(removeError.message);
      } else if (row.bucket === "avatars") {
        if (!isSafeOwnedCoverPath(row.object_path, ownerId)) {
          console.error("[admin] refusing unsafe queued account avatar cleanup");
          await supabaseAdmin.from("account_storage_cleanup").update({ status: "complete", last_error: "unsafe path skipped" }).eq("id", row.id);
          continue;
        }
        const { error: removeError } = await supabaseAdmin.storage.from(row.bucket).remove([row.object_path]);
        if (removeError) throw new Error(removeError.message);
      }

      const { error: completeError } = await supabaseAdmin
        .from("account_storage_cleanup")
        .update({ status: "complete", completed_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id)
        .eq("status", "pending");
      if (completeError) throw new Error(completeError.message);
    } catch (error) {
      pending += 1;
      console.error("[admin] account storage cleanup remains pending", error);
      await supabaseAdmin
        .from("account_storage_cleanup")
        .update({ last_error: error instanceof Error ? error.message : "storage cleanup failed", attempt_count: row.attempt_count + 1 })
        .eq("id", row.id)
        .eq("status", "pending");
    }
  }
  return pending;
}
export const deleteAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    if (data.userId === context.userId) throw new Error("You cannot delete your own admin account.");

    const { data: operationId, error: authorizationError } = await context.supabase.rpc("admin_begin_account_deletion", { _target_user_id: data.userId });
    if (authorizationError || typeof operationId !== "string") throw new Error(authorizationError?.message ?? "Could not authorize account deletion");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authorizedTargetId, error: consumeError } = await context.supabase.rpc("consume_admin_account_deletion", { _operation_id: operationId });
    if (consumeError || typeof authorizedTargetId !== "string") throw new Error(consumeError?.message ?? "Account deletion authorization expired");
    const targetUserId = authorizedTargetId;
    const { data: authUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
    if (userError || !authUser.user) throw new Error("User not found");
    const { data: targetAdmin } = await supabaseAdmin.from("user_roles").select("user_id").eq("user_id", targetUserId).eq("role", "admin").maybeSingle();
    if (targetAdmin) throw new Error("Admin accounts cannot be deleted from this dashboard.");
    if ((authUser.user.email ?? "").toLowerCase() !== data.confirmationEmail.toLowerCase()) {
      throw new Error("The confirmation email does not match this account.");
    }
    if (data.blockRegistration && !data.registrationReasonCode) {
      throw new Error("A registration-block reason is required.");
    }
    if (data.blockRegistration && data.registrationReasonCode === "other" && !data.registrationReasonText?.trim()) {
      throw new Error("A custom registration-block reason is required.");
    }

    let registrationBlockId: string | null = null;
    const releaseRegistrationBlock = async () => {
      if (!registrationBlockId) return;
      const { error } = await context.supabase.rpc("admin_remove_registration_block", {
        _block_id: registrationBlockId,
      });
      if (error) throw new Error(`Registration block could not be released: ${error.message}`);
      registrationBlockId = null;
    };

    // Reserve the email before external cleanup/Auth deletion so no new
    // account can be created in the gap. Release it on every known failure.
    if (data.blockRegistration) {
      const { data: reservedId, error: registrationError } = await context.supabase.rpc("admin_create_registration_block", {
        _email: authUser.user.email ?? "",
        _reason_code: data.registrationReasonCode,
        _reason_text: data.registrationReasonText ?? null,
      });
      if (registrationError || !reservedId) {
        throw new Error(`Could not reserve registration block: ${registrationError?.message ?? "no block id returned"}`);
      }
      registrationBlockId = reservedId as unknown as string;
    }

    const { data: tracks, error: tracksError } = await supabaseAdmin
      .from("tracks").select("audio_key, cover_url").eq("user_id", targetUserId);
    if (tracksError) {
      try { await releaseRegistrationBlock(); } catch (releaseError) {
        throw new Error(`Could not inspect user files: ${tracksError.message}; ${releaseError instanceof Error ? releaseError.message : "registration block release failed"}`);
      }
      throw new Error(`Could not inspect user files: ${tracksError.message}`);
    }

    let storageCleanupPending = 0;
    try {
      await queueAccountStorageCleanup(supabaseAdmin, targetUserId, (tracks ?? []) as Array<{ audio_key: string | null; cover_url: string | null }>);
      storageCleanupPending = await processAccountStorageCleanup(supabaseAdmin, targetUserId);
    } catch (error) {
      try { await releaseRegistrationBlock(); } catch (releaseError) {
        throw new Error(`${error instanceof Error ? error.message : "User file cleanup could not be prepared."} ${releaseError instanceof Error ? releaseError.message : "Registration block release failed."}`);
      }
      throw new Error(error instanceof Error ? error.message : "User file cleanup could not be prepared.");
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      try { await releaseRegistrationBlock(); } catch (releaseError) {
        throw new Error(`Account files were cleaned, but authentication deletion failed: ${deleteError.message}; ${releaseError instanceof Error ? releaseError.message : "registration block release failed"}`);
      }
      throw new Error(`Account files were cleaned, but authentication deletion failed: ${deleteError.message}`);
    }

    const registrationBlocked = Boolean(registrationBlockId);

    if (registrationBlocked) {
      const { error: registrationAuditError } = await supabaseAdmin.from("admin_audit_log").insert({
        admin_user_id: context.userId,
        target_user_id: null,
        action: "BLOCK_REGISTRATION",
        details: { registration_block_id: registrationBlockId, reason_code: data.registrationReasonCode, has_custom_reason: data.registrationReasonCode === "other" },
      });
      if (registrationAuditError) console.error("[admin] deletion succeeded but registration audit logging failed", registrationAuditError.message);
    }

    // The account is already deleted at this point. Audit failure must be
    // reported separately and must not falsely claim that deletion failed.
    const { error: auditError } = await supabaseAdmin.from("admin_audit_log").insert({
      admin_user_id: context.userId,
      target_user_id: null,
      action: "DELETE_USER",
      details: { file_count: (tracks ?? []).length, storage_cleanup_pending: storageCleanupPending, registration_blocked: registrationBlocked },
    });
    if (auditError) {
      console.error("[admin] deletion succeeded but audit logging failed", auditError.message);
      return { ok: true, auditLogged: false, registrationBlocked, storageCleanupPending };
    }
    return { ok: true, auditLogged: true, registrationBlocked, storageCleanupPending };
  });

export const retryAccountStorageCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ cleanupId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("account_storage_cleanup")
      .select("id, owner_id, storage_kind, bucket, object_path, status, attempt_count")
      .eq("id", data.cleanupId)
      .maybeSingle();
    if (error || !row) throw new Error("Cleanup record not found");
    if ((row as AccountCleanupRow).status !== "pending") return { ok: true, alreadyComplete: true };
    const pending = await processAccountStorageCleanup(supabaseAdmin, (row as AccountCleanupRow).owner_id);
    return { ok: pending === 0, pending };
  });
export type RegistrationBlock = {
  id: string;
  email_normalized: string;
  reason_code: string;
  reason_text: string | null;
  blocked_at: string;
};

export const listAdminRegistrationBlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    search: z.string().trim().max(120).default(""),
    page: z.number().int().min(0).default(0),
    pageSize: z.number().int().min(1).max(50).default(25),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { data: result, error } = await context.supabase.rpc("admin_list_registration_blocks", {
      _search: data.search, _limit: data.pageSize, _offset: data.page * data.pageSize,
    });
    if (error) throw new Error(error.message);
    return result as unknown as { total: number; blocks: RegistrationBlock[] };
  });

export const removeAdminRegistrationBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ blockId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { error } = await context.supabase.rpc("admin_remove_registration_block", {
      _block_id: data.blockId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
