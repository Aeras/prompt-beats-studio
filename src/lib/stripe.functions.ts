import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Billing groundwork — intentionally NOT surfaced anywhere in the UI yet.
 * Everything here is functional and ready for a future pricing page.
 */

/** Creates (or reuses) a Stripe Checkout session for a subscription price. */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        priceId: z.string().min(1),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { stripeRequest } = await import("@/lib/stripe.server");
    const { supabase, userId, claims } = context;
    const email = (claims as { email?: string }).email;

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripeRequest<{ id: string }>("POST", "/v1/customers", {
        ...(email ? { email } : {}),
        "metadata[user_id]": userId,
      });
      customerId = customer.id;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("subscriptions")
        .upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: "user_id" });
    }

    const session = await stripeRequest<{ id: string; url: string }>(
      "POST",
      "/v1/checkout/sessions",
      {
        mode: "subscription",
        customer: customerId,
        "line_items[0][price]": data.priceId,
        "line_items[0][quantity]": "1",
        success_url: data.successUrl,
        cancel_url: data.cancelUrl,
        "metadata[user_id]": userId,
      },
    );

    return { id: session.id, url: session.url };
  });

/** Creates a Stripe billing portal session for the signed-in user. */
export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ returnUrl: z.string().url() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!sub?.stripe_customer_id) throw new Error("No billing customer for this user");

    const { stripeRequest } = await import("@/lib/stripe.server");
    const session = await stripeRequest<{ url: string }>("POST", "/v1/billing_portal/sessions", {
      customer: sub.stripe_customer_id,
      return_url: data.returnUrl,
    });
    return { url: session.url };
  });

/** Current plan for the signed-in user. */
export const getSubscriptionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data ?? { plan: "free", status: "inactive", current_period_end: null };
  });
