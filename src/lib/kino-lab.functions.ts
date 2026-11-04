import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Reuse the existing Football/KINO boundary; never trust a browser role flag. */
export const getPrivateKinoLabAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: account, error: accountError } =
      await context.supabase.rpc("get_my_account_status");
    if (
      accountError ||
      !account ||
      typeof account !== "object" ||
      Array.isArray(account) ||
      account["status"] !== "active" ||
      account["is_banned"] !== false
    )
      throw new Error("Not allowed");
    const { data, error } = await context.supabase.rpc("current_user_is_super_admin");
    if (error || data !== true) throw new Error("Not allowed");
    return { allowed: true as const, mode: "offline-exploratory" as const };
  });
