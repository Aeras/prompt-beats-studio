import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Billing groundwork — intentionally NOT surfaced anywhere in the UI yet.
 * Everything here is functional and ready for a future pricing page.
 */

/** Creates a Checkout session for a server-approved subscription plan. */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        plan: z.literal("pro"),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ context }) => {
    const { getStripeProPriceId, getTrustedAppOrigin, stripeRequest } = await import("@/lib/stripe.server");
    const { supabase, userId, claims } = context;
    const email = (claims as { email?: string }).email;
    const priceId = getStripeProPriceId();
    const appOrigin = getTrustedAppOrigin();

    const { data: sub, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (subscriptionError) throw new Error("Could not prepare billing. Please try again.");

    let customerId = sub?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripeRequest<{ id: string }>("POST", "/v1/customers", {
        ...(email ? { email } : {}),
        "metadata[user_id]": userId,
      }, { idempotencyKey: `promptbeats-customer-${userId}` });
      customerId = customer.id;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: customerPersistError } = await supabaseAdmin
        .from("subscriptions")
        .upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: "user_id" });
      if (customerPersistError) throw new Error("Could not prepare billing. Please try again.");
    }

    const session = await stripeRequest<{ id: string; url: string }>(
      "POST",
      "/v1/checkout/sessions",
      {
        mode: "subscription",
        customer: customerId,
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        success_url: `${appOrigin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appOrigin}/?checkout=cancelled`,
        "metadata[user_id]": userId,
      },
    );

    return { id: session.id, url: session.url };
  });

/** Creates a Stripe billing portal session for the signed-in user. */
export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).strict().parse(input ?? {}))
  .handler(async ({ context }) => {
    const { data: sub, error: subscriptionError } = await context.supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (subscriptionError) throw new Error("Could not open billing management. Please try again.");
    if (!sub?.stripe_customer_id) throw new Error("No billing customer for this user");

    const { getTrustedAppOrigin, stripeRequest } = await import("@/lib/stripe.server");
    const session = await stripeRequest<{ url: string }>("POST", "/v1/billing_portal/sessions", {
      customer: sub.stripe_customer_id,
      return_url: `${getTrustedAppOrigin()}/?billing=return`,
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
