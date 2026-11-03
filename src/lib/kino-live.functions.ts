import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Keep KINO behind the existing private Super Admin research boundary. */
export const getPrivateKinoLiveSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: authorized, error } = await context.supabase.rpc("current_user_is_super_admin");
    if (error || authorized !== true) throw new Error("Not allowed");
    const { getKinoLiveSnapshot } = await import("@/lib/kino-live.server");
    return getKinoLiveSnapshot();
  });
