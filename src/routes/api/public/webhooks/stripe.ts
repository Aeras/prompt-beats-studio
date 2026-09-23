import { createFileRoute } from "@tanstack/react-router";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

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

        let event: {
          id?: unknown;
          type?: unknown;
          created?: unknown;
          data?: { object?: Record<string, unknown> };
        };
        try {
          event = JSON.parse(body) as typeof event;
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        if (
          typeof event.id !== "string" ||
          typeof event.type !== "string" ||
          typeof event.created !== "number" ||
          !Number.isSafeInteger(event.created)
        ) {
          return new Response("Invalid payload", { status: 400 });
        }

        // Unsupported event types are deliberately acknowledged without
        // touching billing state so Stripe does not retry them indefinitely.
        if (![
          "customer.subscription.created",
          "customer.subscription.updated",
          "customer.subscription.deleted",
        ].includes(event.type)) {
          return new Response("ok");
        }

        const object = event.data?.object;
        if (!object) return new Response("Invalid payload", { status: 400 });
        const customerId = typeof object["customer"] === "string" ? object["customer"] : null;
        const subscriptionId = typeof object["id"] === "string" ? object["id"] : null;
        if (!customerId || !subscriptionId) return new Response("Invalid payload", { status: 400 });

        const status = typeof object["status"] === "string" ? object["status"] : "inactive";
        const periodEnd = object["current_period_end"];
        const currentPeriodEnd =
          typeof periodEnd === "number" && Number.isFinite(periodEnd)
            ? new Date(periodEnd * 1000).toISOString()
            : null;
        const items = asRecord(object["items"]);
        const itemData = Array.isArray(items?.["data"]) ? items["data"] : [];
        const singleItem = itemData.length === 1 ? asRecord(itemData[0]) : null;
        const price = singleItem ? asRecord(singleItem["price"]) : null;
        const priceId = price?.["id"];
        const { getStripeProPriceId } = await import("@/lib/stripe.server");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.rpc("process_stripe_subscription_event", {
          _event_id: event.id,
          _event_type: event.type,
          _event_created: event.created,
          _customer_id: customerId!,
          _subscription_id: subscriptionId!,
          _subscription_status: status,
          _current_period_end: currentPeriodEnd,
          _price_id: typeof priceId === "string" ? priceId : null,
          _approved_pro_price_id: getStripeProPriceId(),
        });
        if (error) {
          console.error("[stripe-webhook] could not persist subscription event", error.message);
          return new Response("Webhook processing failed", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
