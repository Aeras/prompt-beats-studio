import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { betaRpc } from "@/lib/beta-rpc.server";
import {
  betaActionSchema,
  betaFeatureKeySchema,
  betaFeatureSchema,
  betaEventSchema,
  betaPublicFailure,
} from "@/lib/beta-features.shared";
import { reportServerError } from "@/lib/server-error";
function fail(scope: string, error: unknown): never {
  reportServerError(scope, error);
  throw new Error(betaPublicFailure(error));
}
// Every RPC repeats/fences authorization in PostgreSQL, including stale clients.
export const listBetaFeatures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await betaRpc(context.supabase, "beta_features_list", {});
    if (error) fail("beta:list", error);
    return z
      .object({ features: z.array(betaFeatureSchema), events: z.array(betaEventSchema) })
      .parse(data);
  });
export const transitionBetaFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        featureKey: betaFeatureKeySchema,
        action: betaActionSchema,
        expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        confirmed: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const result = await betaRpc(context.supabase, "beta_feature_transition", {
      _feature_key: data.featureKey,
      _action: data.action,
      _expected_revision: data.expectedRevision,
      _confirmed: data.confirmed,
    });
    if (result.error) fail("beta:transition", result.error);
    return betaFeatureSchema.parse(result.data);
  });
export const getBetaTester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().guid() }).parse(input))
  .handler(async ({ data, context }) => {
    const result = await betaRpc(context.supabase, "beta_tester_detail", { _user_id: data.userId });
    if (result.error) fail("beta:tester-detail", result.error);
    return z
      .object({ enabled: z.boolean(), eligible: z.boolean(), role_access: z.boolean() })
      .parse(result.data);
  });
export const setBetaTester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ userId: z.string().guid(), enabled: z.boolean(), expectedEnabled: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const result = await betaRpc(context.supabase, "beta_tester_set", {
      _user_id: data.userId,
      _enabled: data.enabled,
      _expected_enabled: data.expectedEnabled,
    });
    if (result.error) fail("beta:tester-set", result.error);
    return z.object({ enabled: z.boolean() }).parse(result.data);
  });
