/**
 * Shared secret used by the database scheduler to call the internal job runner.
 *
 * The token lives in `public.app_settings` (no anon/authenticated access) and is
 * only ever read with the service-role client, so it never reaches the browser.
 * It is presented in `x-runner-token` because the hosting layer owns the
 * `Authorization` header on preview origins.
 */
async function loadRunnerToken(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "runner_token")
    .abortSignal(AbortSignal.timeout(10000))
    .maybeSingle();
  if (error) throw new Error("Runner configuration unavailable");
  return typeof data?.value === "string" ? data.value : null;
}
export async function authenticateRunnerRequest(
  request: Request,
  loadExpected = loadRunnerToken,
): Promise<Response | null> {
  const token = request.headers.get("x-runner-token");
  if (!token) return new Response("Unauthorized", { status: 401 });

  let expected: string | null;
  try {
    expected = await loadExpected();
  } catch {
    return new Response("Server configuration error", { status: 503 });
  }
  if (!expected) return new Response("Server configuration error", { status: 500 });

  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
  if (!timingSafeEqual(digest(token), digest(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
