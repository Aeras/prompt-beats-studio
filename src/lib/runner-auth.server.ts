/**
 * Shared secret used by the database scheduler to call the internal job runner.
 *
 * The token lives in `public.app_settings` (no anon/authenticated access) and is
 * only ever read with the service-role client, so it never reaches the browser.
 * It is presented in `x-runner-token` because the hosting layer owns the
 * `Authorization` header on preview origins.
 */
export async function authenticateRunnerRequest(request: Request): Promise<Response | null> {
  const token = request.headers.get("x-runner-token");
  if (!token) return new Response("Unauthorized", { status: 401 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "runner_token")
    .maybeSingle();

  const expected = typeof data?.value === "string" ? data.value : null;
  if (!expected) return new Response("Server configuration error", { status: 500 });

  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
  if (!timingSafeEqual(digest(token), digest(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
