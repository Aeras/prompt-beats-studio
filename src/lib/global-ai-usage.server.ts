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
type FeatureAdmission = (userId: string, featureKeys: readonly string[]) => Promise<void>;
type Permit = {
  unused: boolean;
  userId: string | null;
  featureKeys: readonly string[];
};
const permits = new AsyncLocalStorage<Permit>();

function normalizeFeatureKeys(featureKeys: readonly string[]): readonly string[] {
  const normalized = [...new Set(featureKeys.map((key) => key.trim()).filter(Boolean))].sort();
  if (normalized.length < 1 || normalized.length > 8) throw new AiUsageUnavailableError(false);
  return Object.freeze(normalized);
}
function sameFeatureIdentity(
  permit: Permit | undefined,
  userId: string,
  featureKeys: readonly string[],
) {
  return (
    permit?.userId === userId &&
    permit.featureKeys.length === featureKeys.length &&
    permit.featureKeys.every((key, index) => key === featureKeys[index])
  );
}

/** Fresh database read/row lock for each global-only permit; no process/TTL allow cache. */
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

/** Fresh caller + exact-feature-set admission for a new paid provider attempt. */
export async function requireFeatureAiUsage(
  userId: string,
  featureKeys: readonly string[],
): Promise<void> {
  if (process.env["PROMPTBEATS_AI_DISPATCH_DISABLED"] === "true")
    throw new AiUsageUnavailableError(true);
  const keys = normalizeFeatureKeys(featureKeys);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin as unknown as {
      rpc(
        name: "admit_feature_ai_dispatch_internal",
        args: { _user_id: string; _feature_keys: readonly string[] },
      ): {
        abortSignal(
          signal: AbortSignal,
        ): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
      };
    };
    const { data, error } = await client
      .rpc("admit_feature_ai_dispatch_internal", {
        _user_id: userId,
        _feature_keys: keys,
      })
      .abortSignal(AbortSignal.timeout(10000));
    if (error || data !== true) throw new AiUsageUnavailableError(error?.code === "PT423");
  } catch (error) {
    if (error instanceof AiUsageUnavailableError) throw error;
    throw new AiUsageUnavailableError(false);
  }
}

/** Legacy/global-only admission for trusted administrative dispatches that have
 * no user-facing Feature Access identity. User operations must use the feature-
 * aware wrapper below. */
export async function withAiDispatchAdmission<T>(
  execute: () => Promise<T>,
  admit: Admission = requireGlobalAiUsage,
): Promise<T> {
  const permit = permits.getStore();
  if (permit?.unused && permit.userId === null) return execute();
  await admit();
  return permits.run({ unused: true, userId: null, featureKeys: Object.freeze([]) }, execute);
}

/** User-bound one-use permit. Nested use is allowed only for the exact same
 * immutable feature identity; broader/different nested work must re-admit. */
export async function withFeatureAiDispatchAdmission<T>(
  userId: string,
  featureKeys: readonly string[],
  execute: () => Promise<T>,
  admit: FeatureAdmission = requireFeatureAiUsage,
): Promise<T> {
  const keys = normalizeFeatureKeys(featureKeys);
  const permit = permits.getStore();
  if (permit?.unused && sameFeatureIdentity(permit, userId, keys)) return execute();
  await admit(userId, keys);
  return permits.run({ unused: true, userId, featureKeys: keys }, execute);
}

export async function consumeAiDispatchAdmission(
  globalAdmit: Admission = requireGlobalAiUsage,
  featureAdmit: FeatureAdmission = requireFeatureAiUsage,
) {
  const permit = permits.getStore();
  if (permit?.unused) {
    permit.unused = false;
    return;
  }
  if (permit?.userId) {
    await featureAdmit(permit.userId, permit.featureKeys);
    return;
  }
  await globalAdmit();
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
