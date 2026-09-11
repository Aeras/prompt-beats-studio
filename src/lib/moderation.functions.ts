import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


export type ModerationRole = "admin" | "senior_moderator" | "moderator" | "user";
export type ModerationStatus = "active" | "suspended";

export type ModerationContext = {
  role: ModerationRole;
  status: ModerationStatus;
  can_view_users: boolean;
  can_block_users: boolean;
  can_unblock_users: boolean;
  can_suspend_moderator: boolean;
  can_manage_roles: boolean;
  can_delete_users: boolean;
  can_manage_registration_blocks: boolean;
  can_manage_model_access: boolean;
  can_access_admin_settings: boolean;
};

/** Current user's server-derived moderation role, status, and capabilities. */
export const getMyModeration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_my_moderation_context" as never);
    if (error) throw new Error(error.message);
    return data as unknown as ModerationContext;
  });

/** Admin-only: read a creator's ban status (kept off public profile reads). */
export const getUserBanStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: capabilityError } = await context.supabase.rpc("has_moderation_capability" as never, { _capability: "can_block_users" } as never);
    if (capabilityError || allowed !== true) throw new Error("Not allowed");
    const { data: targetAllowed, error: targetError } = await context.supabase.rpc("can_moderate_target" as never, { _target_user_id: data.userId } as never);
    if (targetError || targetAllowed !== true) throw new Error("Not allowed");
    const { data: priv } = await context.supabase
      .from("profile_private")
      .select("is_banned")
      .eq("user_id", data.userId)
      .maybeSingle();
    return { banned: Boolean((priv as { is_banned?: boolean } | null)?.is_banned) };
  });

/** Admin-only: ban or unban a creator. RLS enforces the admin requirement. */
export const setUserBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), banned: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: allowed, error: capabilityError } = await context.supabase.rpc("has_moderation_capability" as never, { _capability: data.banned ? "can_block_users" : "can_unblock_users" } as never);
    if (capabilityError || allowed !== true) throw new Error("Not allowed");

    const { error } = await context.supabase.rpc("set_user_banned", {
      _user_id: data.userId,
      _banned: data.banned,
    });
    if (error) throw new Error(error.message);
    return { ok: true, banned: data.banned };
  });
