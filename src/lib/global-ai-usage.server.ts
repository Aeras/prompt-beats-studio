import { AsyncLocalStorage } from "node:async_hooks";

export const AI_DISABLED_MESSAGE =
  "AI is temporarily disabled by an administrator. Please try again later.";
export const AI_UNAVAILABLE_MESSAGE =
  "AI availability could not be verified. Please try again later.";
export class AiUsageUnavailableError extends Error {
  constructor(disabled: boolean) {
    super(disabled ? AI_DISABLED_MESSAGE : AI_UNAVAILABLE_MESSAGE);
    this.name = "AiUsageUnavailableError";
  }
}
type Admission = () => Promise<void>;
type Permit = { unused: boolean };
const permits = new AsyncLocalStorage<Permit>();

/** Fresh database read/row lock for each permit; no process/TTL allow cache. */
export async function requireGlobalAiUsage(): Promise<void> {
  if (process.env["PROMPTBEATS_AI_DISPATCH_DISABLED"] === "true")
    throw new AiUsageUnavailableError(true);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin as unknown as {
      rpc(name: "admit_global_ai_dispatch_internal"): {
        abortSignal(
          signal: AbortSignal,
        ): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
      };
    };
    const { data, error } = await client
      .rpc("admit_global_ai_dispatch_internal")
      .abortSignal(AbortSignal.timeout(10000));
    if (error || data !== true) throw new AiUsageUnavailableError(error?.code === "PT423");
  } catch (error) {
    if (error instanceof AiUsageUnavailableError) throw error;
    throw new AiUsageUnavailableError(false);
  }
}

/** One-use admission before journaling. An already admitted request may reach
 * its socket after OFF; retries/secondary requests cannot reuse its permit. */
export async function withAiDispatchAdmission<T>(
  execute: () => Promise<T>,
  admit: Admission = requireGlobalAiUsage,
): Promise<T> {
  if (permits.getStore()?.unused) return execute();
  await admit();
  return permits.run({ unused: true }, execute);
}
export async function consumeAiDispatchAdmission(admit: Admission = requireGlobalAiUsage) {
  const permit = permits.getStore();
  if (permit?.unused) {
    permit.unused = false;
    return;
  }
  await admit();
}
export async function aiProviderFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  await consumeAiDispatchAdmission();
  return globalThis.fetch(input, init);
}
/** Strictly existing-operation management, never a new generation endpoint. */
export function aiContinuationFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const allowed =
    (method === "GET" &&
      url.hostname === "api.openai.com" &&
      /^\/v1\/responses\/[^/]+$/.test(url.pathname)) ||
    (method === "GET" &&
      url.hostname === "generativelanguage.googleapis.com" &&
      /^\/v1beta\/interactions\/[^/]+$/.test(url.pathname)) ||
    (method === "GET" &&
      url.hostname === "openrouter.ai" &&
      url.pathname === "/api/v1/generation" &&
      !!url.searchParams.get("id")) ||
    (["GET", "POST"].includes(method) &&
      url.hostname === "api.runpod.ai" &&
      /^\/v2\/[^/]+\/(status|cancel)\/[^/]+$/.test(url.pathname)) ||
    (method === "POST" &&
      url.hostname === "api.openai.com" &&
      /^\/v1\/responses\/[^/]+\/cancel$/.test(url.pathname)) ||
    (method === "POST" &&
      url.hostname === "generativelanguage.googleapis.com" &&
      /^\/v1beta\/interactions\/[^/]+:cancel$/.test(url.pathname));
  if (url.protocol !== "https:" || !allowed)
    throw new Error("Invalid existing AI operation request.");
  return globalThis.fetch(input, init);
}
