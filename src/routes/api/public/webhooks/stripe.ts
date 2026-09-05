import { createFileRoute } from "@tanstack/react-router";

/** Stripe webhook receiver — backend groundwork, no UI attached yet. */
export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        const body = await request.text();

        const { verifyStripeSignature } = await import("@/lib/stripe.server");
        if (!secret) return new Response("Webhook secret not configured", { status: 503 });
        const ok = await verifyStripeSignature(body, request.headers.get("stripe-signature"), secret);
        if (!ok) return new Response("Invalid signature", { status: 401 });

        const event = JSON.parse(body) as { type: string; data: { object: Record<string, unknown> } };
        const object = event.data.object;
        const customerId = (object["customer"] as string | undefined) ?? null;
        if (!customerId) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (
          event.type === "customer.subscription.created" ||
          event.type === "customer.subscription.updated" ||
          event.type === "customer.subscription.deleted"
        ) {
          const status = (object["status"] as string) ?? "inactive";
          const periodEnd = object["current_period_end"] as number | undefined;
          await supabaseAdmin
            .from("subscriptions")
            .update({
              stripe_subscription_id: (object["id"] as string) ?? null,
              status,
              plan: status === "active" || status === "trialing" ? "pro" : "free",
              current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
            })
            .eq("stripe_customer_id", customerId);
        }

        return new Response("ok");
      },
    },
  },
});
