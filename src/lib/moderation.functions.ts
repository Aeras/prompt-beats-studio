import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Current user's moderation status: admin rights and ban state. */
export const getMyModeration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: roles }, { data: profile }] = await Promise.all([
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase.from("profiles").select("is_banned").eq("id", context.userId).maybeSingle(),
    ]);
    return {
      isAdmin: (roles ?? []).some((r) => r.role === "admin"),
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
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Not allowed");

    const { error } = await context.supabase
      .from("profiles")
      .update({ is_banned: data.banned } as never)
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true, banned: data.banned };
  });
