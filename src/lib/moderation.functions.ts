import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


/** Current user's moderation status: admin rights and ban state. */
export const getMyModeration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: isAdmin }, { data: profile }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.from("profiles").select("is_banned").eq("id", context.userId).maybeSingle(),
    ]);
    return {
      isAdmin: isAdmin === true,
      isBanned: Boolean((profile as { is_banned?: boolean } | null)?.is_banned),
    };
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

    const { error } = await context.supabase
      .from("profiles")
      .update({ is_banned: data.banned } as never)
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true, banned: data.banned };
  });
