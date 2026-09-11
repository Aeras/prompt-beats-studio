import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_MODEL_IDS, type AiModelId } from "@/lib/ai-models";

const adminUserId = z.string().uuid();
const accessMode = z.enum(["inherit", "custom"]);

async function requireAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
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
  generations: number;
};

export type AdminUserDetail = AdminUser & {
  ai_requests: number;
  model_access: { mode: "inherit" | "custom"; models: string[] };
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
    await requireAdmin(context.supabase, context.userId);
    const { data: result, error } = await context.supabase.rpc("admin_list_users" as never, {
      _search: data.search, _status: data.status, _limit: data.pageSize, _offset: data.page * data.pageSize,
    } as never);
    if (error) throw new Error(error.message);
    return result as unknown as { total: number; users: AdminUser[] };
  });

export const getAdminUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: adminUserId }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data: result, error } = await context.supabase.rpc("admin_user_detail" as never, {
      _target_user_id: data.userId,
    } as never);
    if (error) throw new Error(error.message);
    if (!result) throw new Error("User not found");
    return result as unknown as AdminUserDetail;
  });

export const setAdminUserBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: adminUserId, banned: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_set_user_banned" as never, {
      _target_user_id: data.userId, _banned: data.banned,
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

const deleteInput = z.object({ userId: adminUserId, confirmationEmail: z.string().trim().email() });

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

    const { data: tracks, error: tracksError } = await supabaseAdmin
      .from("tracks" as never).select("audio_key").eq("user_id", data.userId);
    if (tracksError) throw new Error(`Could not inspect user files: ${tracksError.message}`);

    try {
      const { deleteFromR2 } = await import("@/lib/r2.server");
      for (const track of (tracks ?? []) as { audio_key: string | null }[]) {
        if (track.audio_key) await deleteFromR2(track.audio_key);
      }
      await removeStorageFolder("avatars", data.userId);
      await removeStorageFolder("track-covers", data.userId);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "User file cleanup failed; account was not deleted.");
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (deleteError) throw new Error(`Account files were cleaned, but authentication deletion failed: ${deleteError.message}`);

    // The account is already deleted at this point. Audit failure must be
    // reported separately and must not falsely claim that deletion failed.
    const { error: auditError } = await supabaseAdmin.from("admin_audit_log" as never).insert({
      admin_user_id: context.userId,
      target_user_id: null,
      action: "DELETE_USER",
      details: { file_count: (tracks ?? []).length },
    } as never);
    if (auditError) {
      console.error("[admin] deletion succeeded but audit logging failed", auditError.message);
      return { ok: true, auditLogged: false };
    }
    return { ok: true, auditLogged: true };
  });
