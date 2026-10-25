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
        checkoutAttemptId: z.string().guid(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { getStripeProPriceId, getTrustedAppOrigin, stripeRequest } =
      await import("@/lib/stripe.server");
    const { supabase, userId, claims } = context;
    const email = (claims as { email?: string }).email;
    const priceId = getStripeProPriceId();
    const appOrigin = getTrustedAppOrigin();

    const { data: sub, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (subscriptionError) throw new Error("Could not prepare billing. Please try again.");
    if (sub?.status === "active" || sub?.status === "trialing") {
      throw new Error("An active subscription already exists. Use billing management.");
    }

    // Atomically reserve one Checkout attempt per account across all workers.
    // Replays of the same UUID are allowed; distinct concurrent UUIDs are rejected.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reserved, error: reservationError } = await supabaseAdmin.rpc(
      "reserve_stripe_checkout_attempt" as never,
      { _user_id: userId, _attempt_id: data.checkoutAttemptId } as never,
    );
    if (reservationError || reserved !== true) {
      throw new Error("A checkout is already in progress. Please try again later.");
    }

    let customerId = sub?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripeRequest<{ id: string }>(
        "POST",
        "/v1/customers",
        {
          ...(email ? { email } : {}),
          "metadata[user_id]": userId,
        },
        { idempotencyKey: `promptbeats-customer-${userId}` },
      );
      customerId = customer.id;
      const { error: customerPersistError } = await supabaseAdmin
        .from("subscriptions")
        .upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: "user_id" });
      if (customerPersistError) throw new Error("Could not prepare billing. Please try again.");
    }

    // The webhook/DB projection may lag a completed Checkout. Check the
    // provider's customer-bound subscription state before creating another.
    const subscriptions = await stripeRequest<{
      data: Array<{ status: string }>;
      has_more: boolean;
    }>("GET", "/v1/subscriptions", { customer: customerId, status: "all", limit: "100" });
    if (subscriptions.has_more) throw new Error("Could not verify existing subscriptions.");
    if (subscriptions.data.some((item) => item.status === "active" || item.status === "trialing")) {
      throw new Error("An active subscription already exists. Use billing management.");
    }

    const open = await stripeRequest<{
      data: Array<{
        id: string;
        url: string | null;
        mode: string;
        metadata?: { user_id?: string; checkout_attempt_id?: string };
      }>;
      has_more: boolean;
    }>("GET", "/v1/checkout/sessions", { customer: customerId, status: "open", limit: "100" });
    if (open.has_more) throw new Error("Could not verify existing checkout sessions.");
    const existing = open.data.find(
      (item) => item.mode === "subscription" && item.metadata?.user_id === userId,
    );
    if (existing) {
      if (existing.metadata?.checkout_attempt_id === data.checkoutAttemptId && existing.url) {
        return { id: existing.id, url: existing.url };
      }
      throw new Error("A checkout is already in progress.");
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
        "metadata[checkout_attempt_id]": data.checkoutAttemptId,
      },
      { idempotencyKey: `promptbeats-checkout-${userId}-${data.checkoutAttemptId}` },
    );

    return { id: session.id, url: session.url };
  });

/** Creates a Stripe billing portal session for the signed-in user. */
export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({})
      .strict()
      .parse(input ?? {}),
  )
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
