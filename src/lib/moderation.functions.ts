import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


/** Current user's moderation status: admin rights and ban state. */
export const getMyModeration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: isAdmin }, { data: priv }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.from("profile_private").select("is_banned").eq("user_id", context.userId).maybeSingle(),
    ]);
    return {
      isAdmin: isAdmin === true,
      isBanned: Boolean((priv as { is_banned?: boolean } | null)?.is_banned),
    };
  });

/** Admin-only: read a creator's ban status (kept off public profile reads). */
export const getUserBanStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin !== true) throw new Error("Not allowed");
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
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin !== true) throw new Error("Not allowed");

    const { error } = await context.supabase.rpc("set_user_banned", {
      _user_id: data.userId,
      _banned: data.banned,
    });
    if (error) throw new Error(error.message);
    return { ok: true, banned: data.banned };
  });
