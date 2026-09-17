import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAiMusicLabAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("current_user_has_role", {
      _role: "admin",
    });

    if (error || isAdmin !== true) throw new Error("Not allowed");
    return { allowed: true as const };
  });
