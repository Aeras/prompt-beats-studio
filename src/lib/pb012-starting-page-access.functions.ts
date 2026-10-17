import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { START_SCREEN_FEATURES, type StartScreenPreference } from "@/lib/pb012-starting-screen.shared";
import type { FeatureKey } from "@/lib/feature-access.functions";

const keys = Object.entries(START_SCREEN_FEATURES) as Array<[StartScreenPreference, FeatureKey]>;

export const getStartingPageAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const checks = await Promise.all(keys.map(async ([destination, featureKey]) => {
      const { data, error } = await context.supabase.rpc("current_user_can_use_feature", { _feature_key: featureKey });
      return [destination, !error && data === true] as const;
    }));
    return Object.fromEntries(checks) as Partial<Record<StartScreenPreference, boolean>>;
  });
