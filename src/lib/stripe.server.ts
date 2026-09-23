/** Minimal fetch-based Stripe REST client (Worker-safe — no Node SDK). */
export async function stripeRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Record<string, string>,
  options?: { idempotencyKey?: string },
): Promise<T> {
  const secretKey = process.env["STRIPE_SECRET_KEY"];
  if (!secretKey) throw new Error("Stripe is not configured.");
  const url = new URL(`https://api.stripe.com${path}`);
  let body: string | undefined;
  if (params && method === "GET") {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else if (params) {
    body = new URLSearchParams(params).toString();
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    ...(body ? { body } : {}),
  });

  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe request failed (${res.status})`);
  return json;
}

/** Verifies a Stripe webhook signature header (t=…,v1=…) against the raw body. */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) return false;
  const timestamp = header
    .split(",")
    .map((part) => part.trim().split("=", 2))
    .find(([key]) => key === "t")?.[1];
  const signatures = header
    .split(",")
    .map((part) => part.trim().split("=", 2))
    .flatMap(([key, value]) => (key === "v1" && value ? [value] : []));
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;

  // Stripe recommends rejecting old signed payloads so a captured valid event
  // cannot be replayed indefinitely. Five minutes allows normal delivery skew.
  const timestampSeconds = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(Date.now() / 1000 - timestampSeconds) > 300
  ) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  return signatures.some((signature) => {
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++)
      diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    return diff === 0;
  });
}

export function getStripeProPriceId(): string {
  const priceId = process.env["STRIPE_PRICE_PRO"]?.trim();
  if (!priceId) throw new Error("Stripe billing is not configured.");
  return priceId;
}

export function getTrustedAppOrigin(): string {
  const configured = process.env["APP_ORIGIN"]?.trim();
  if (!configured) throw new Error("Billing redirects are not configured.");
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.origin !== configured.replace(/\/$/, "")) {
    throw new Error("Billing redirects are not configured.");
  }
  return url.origin;
}
