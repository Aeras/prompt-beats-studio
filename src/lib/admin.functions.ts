import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_MODEL_IDS, type AiModelId } from "@/lib/ai-models";

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

async function requireAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || data !== true) throw new Error("Not allowed");
}

async function requireCapability(supabase: any, capability: string) {
  const { data, error } = await supabase.rpc("has_moderation_capability" as never, { _capability: capability } as never);
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
    await requireAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("admin_overview" as never);
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
    const { data: result, error } = await context.supabase.rpc("admin_list_users" as never, {
      _search: search, _status: data.status, _limit: data.pageSize, _offset: data.page * data.pageSize,
    } as never);
    if (error) throw new Error(error.message);
    return result as unknown as { total: number; users: AdminUser[] };
  });

export const getAdminUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: adminUserId }).parse(input))
  .handler(async ({ data, context }) => {
    await requireCapability(context.supabase, "can_view_users");
    const { data: result, error } = await context.supabase.rpc("admin_user_detail" as never, {
      _target_user_id: data.userId,
    } as never);
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
    const { error } = await context.supabase.rpc("admin_set_user_banned" as never, {
      _target_user_id: data.userId, _banned: data.banned,
      _reason_code: data.banned ? data.reasonCode : null,
      _reason_text: data.banned ? data.reasonText : null,
    } as never);
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
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_set_model_access" as never, {
      _target_user_id: data.userId, _access_mode: data.mode, _allowed_models: data.models,
    } as never);
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
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_set_user_role" as never, { _target_user_id: data.userId, _role: data.role } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setModerationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: adminUserId, status: z.enum(["active", "suspended"]), reasonText: z.string().trim().max(500).nullish() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: capabilityError } = await context.supabase.rpc("has_moderation_capability" as never, { _capability: "can_suspend_moderator" } as never);
    if (capabilityError || allowed !== true) throw new Error("Not allowed");
    if (data.status === "suspended" && !data.reasonText?.trim()) throw new Error("A suspension reason is required.");
    const { error } = await context.supabase.rpc("admin_set_moderation_status" as never, { _target_user_id: data.userId, _status: data.status, _reason_text: data.reasonText ?? null } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function removeStorageFolder(bucket: string, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const names: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.storage.from(bucket).list(userId, { limit: 1000, offset });
    if (error) throw new Error(`${bucket} cleanup failed: ${error.message}`);
    names.push(...(data ?? []).map((item) => `${userId}/${item.name}`));
    if (!data || data.length < 1000) break;
  }
  if (names.length) {
    const { error } = await supabaseAdmin.storage.from(bucket).remove(names);
    if (error) throw new Error(`${bucket} cleanup failed: ${error.message}`);
  }
}

export const deleteAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot delete your own admin account.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (userError || !authUser.user) throw new Error("User not found");
    const { data: targetAdmin } = await supabaseAdmin.from("user_roles" as never).select("user_id").eq("user_id", data.userId).eq("role", "admin").maybeSingle();
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
      const { error } = await context.supabase.rpc("admin_remove_registration_block" as never, {
        _block_id: registrationBlockId,
      } as never);
      if (error) throw new Error(`Registration block could not be released: ${error.message}`);
      registrationBlockId = null;
    };

    // Reserve the email before external cleanup/Auth deletion so no new
    // account can be created in the gap. Release it on every known failure.
    if (data.blockRegistration) {
      const { data: reservedId, error: registrationError } = await context.supabase.rpc("admin_create_registration_block" as never, {
        _email: authUser.user.email ?? "",
        _reason_code: data.registrationReasonCode,
        _reason_text: data.registrationReasonText ?? null,
      } as never);
      if (registrationError || !reservedId) {
        throw new Error(`Could not reserve registration block: ${registrationError?.message ?? "no block id returned"}`);
      }
      registrationBlockId = reservedId as unknown as string;
    }

    const { data: tracks, error: tracksError } = await supabaseAdmin
      .from("tracks" as never).select("audio_key").eq("user_id", data.userId);
    if (tracksError) {
      try { await releaseRegistrationBlock(); } catch (releaseError) {
        throw new Error(`Could not inspect user files: ${tracksError.message}; ${releaseError instanceof Error ? releaseError.message : "registration block release failed"}`);
      }
      throw new Error(`Could not inspect user files: ${tracksError.message}`);
    }

    try {
      const { deleteFromR2 } = await import("@/lib/r2.server");
      for (const track of (tracks ?? []) as { audio_key: string | null }[]) {
        if (track.audio_key) await deleteFromR2(track.audio_key);
      }
      await removeStorageFolder("avatars", data.userId);
      await removeStorageFolder("track-covers", data.userId);
    } catch (error) {
      try { await releaseRegistrationBlock(); } catch (releaseError) {
        throw new Error(`${error instanceof Error ? error.message : "User file cleanup failed; account was not deleted."} ${releaseError instanceof Error ? releaseError.message : "Registration block release failed."}`);
      }
      throw new Error(error instanceof Error ? error.message : "User file cleanup failed; account was not deleted.");
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (deleteError) {
      try { await releaseRegistrationBlock(); } catch (releaseError) {
        throw new Error(`Account files were cleaned, but authentication deletion failed: ${deleteError.message}; ${releaseError instanceof Error ? releaseError.message : "registration block release failed"}`);
      }
      throw new Error(`Account files were cleaned, but authentication deletion failed: ${deleteError.message}`);
    }

    const registrationBlocked = Boolean(registrationBlockId);

    if (registrationBlocked) {
      const { error: registrationAuditError } = await supabaseAdmin.from("admin_audit_log" as never).insert({
        admin_user_id: context.userId,
        target_user_id: null,
        action: "BLOCK_REGISTRATION",
        details: { registration_block_id: registrationBlockId, reason_code: data.registrationReasonCode, has_custom_reason: data.registrationReasonCode === "other" },
      } as never);
      if (registrationAuditError) console.error("[admin] deletion succeeded but registration audit logging failed", registrationAuditError.message);
    }

    // The account is already deleted at this point. Audit failure must be
    // reported separately and must not falsely claim that deletion failed.
    const { error: auditError } = await supabaseAdmin.from("admin_audit_log" as never).insert({
      admin_user_id: context.userId,
      target_user_id: null,
      action: "DELETE_USER",
      details: { file_count: (tracks ?? []).length, registration_blocked: registrationBlocked },
    } as never);
    if (auditError) {
      console.error("[admin] deletion succeeded but audit logging failed", auditError.message);
      return { ok: true, auditLogged: false, registrationBlocked };
    }
    return { ok: true, auditLogged: true, registrationBlocked };
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
    await requireAdmin(context.supabase, context.userId);
    const { data: result, error } = await context.supabase.rpc("admin_list_registration_blocks" as never, {
      _search: data.search, _limit: data.pageSize, _offset: data.page * data.pageSize,
    } as never);
    if (error) throw new Error(error.message);
    return result as unknown as { total: number; blocks: RegistrationBlock[] };
  });

export const removeAdminRegistrationBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ blockId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_remove_registration_block" as never, {
      _block_id: data.blockId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
