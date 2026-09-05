/** Minimal fetch-based Stripe REST client (Worker-safe — no Node SDK). */
export async function stripeRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Record<string, string>,
): Promise<T> {
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
      Authorization: `Bearer ${process.env["STRIPE_SECRET_KEY"]!}`,
      "Content-Type": "application/x-www-form-urlencoded",
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
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...rest] = p.split("=");
      return [k?.trim() ?? "", rest.join("=")];
    }),
  ) as Record<string, string>;
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

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

  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
