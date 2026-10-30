import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  ManualSubscriptionPlan,
  SubscriptionEntitlementDetail,
  SubscriptionPlan,
} from "@/lib/subscription-entitlements.shared";

const userIdSchema = z.string().guid();
const manualPlanSchema = z.enum(["plus", "pro"]);
const reasonSchema = z.string().trim().min(3).max(500);
const expirySchema = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid expiry")
  .nullable();

async function requireSuperAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("current_user_is_super_admin");
  if (error || data !== true) throw new Error("Not allowed");
}

export const getMyEntitlementSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: planResult, error: planError }, { data: stripe, error: stripeError }] =
      await Promise.all([
        context.supabase.rpc("current_user_effective_plan"),
        context.supabase
          .from("subscriptions")
          .select("plan,status,current_period_end")
          .eq("user_id", context.userId)
          .maybeSingle(),
      ]);
    if (planError) throw new Error(planError.message);
    if (stripeError) throw new Error(stripeError.message);
    const effectivePlan = ((planResult as { effectivePlan?: SubscriptionPlan } | null)
      ?.effectivePlan ?? "free") as SubscriptionPlan;
    return {
      effectivePlan,
      stripe: {
        plan: ((stripe?.plan as SubscriptionPlan | undefined) ?? "free") as SubscriptionPlan,
        status: stripe?.status ?? "inactive",
        currentPeriodEnd: stripe?.current_period_end ?? null,
      },
    };
  });

export const getSubscriptionEntitlementDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: userIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { data: result, error } = await context.supabase.rpc("subscription_entitlement_detail", {
      _user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    return result as unknown as SubscriptionEntitlementDetail;
  });

export const createSubscriptionManualGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: userIdSchema,
        plan: manualPlanSchema,
        expiresAt: expirySchema,
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { data: result, error } = await context.supabase.rpc(
      "subscription_manual_grant_create",
      {
        _user_id: data.userId,
        _plan: data.plan,
        _expires_at: data.expiresAt,
        _reason: data.reason,
      },
    );
    if (error) throw new Error(error.message);
    return result as unknown as {
      grantId: string;
      effectivePlan: SubscriptionPlan;
      startsAt: string;
      expiresAt: string | null;
    };
  });

export const revokeSubscriptionManualGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ grantId: z.string().guid(), reason: reasonSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { data: result, error } = await context.supabase.rpc(
      "subscription_manual_grant_revoke",
      {
        _grant_id: data.grantId,
        _revoke_reason: data.reason,
      },
    );
    if (error) throw new Error(error.message);
    return result as unknown as {
      changed: boolean;
      grantId: string;
      effectivePlan: SubscriptionPlan;
    };
  });

export type { ManualSubscriptionPlan };
