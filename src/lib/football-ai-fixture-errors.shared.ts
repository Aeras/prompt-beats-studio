/** Stable, safe failure codes for the AI fixture refresh (no secrets, no provider text). */
export const AI_FIXTURE_PRE_ADMISSION_CODES = [
  "beta_disabled",
  "dispatch_disabled",
  "spend_not_approved",
  "provider_key_missing",
  "model_pricing_unavailable",
  "cost_changed",
  "quota_exceeded_hour",
  "quota_exceeded_day",
  "already_running",
  "admission_unavailable",
] as const;
export const AI_FIXTURE_POST_ADMISSION_CODES = [
  "provider_failed",
  "invalid_ai_output",
  "corroboration_failed",
  "persistence_failed",
] as const;

export type AiFixturePreAdmissionCode = (typeof AI_FIXTURE_PRE_ADMISSION_CODES)[number];
export type AiFixturePostAdmissionCode = (typeof AI_FIXTURE_POST_ADMISSION_CODES)[number];
export type AiFixtureErrorCode = AiFixturePreAdmissionCode | AiFixturePostAdmissionCode;

export const AI_FIXTURE_ERROR_PREFIX = "AI_FIXTURE:";

export function aiFixtureErrorMessage(code: AiFixtureErrorCode): string {
  return AI_FIXTURE_ERROR_PREFIX + code;
}

/** Extracts a known code from an error/message; null when unknown. */
export function parseAiFixtureErrorCode(error: unknown): AiFixtureErrorCode | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = /AI_FIXTURE:([a-z_]+)/.exec(message);
  if (!match) return null;
  const code = match[1] as AiFixtureErrorCode;
  return (AI_FIXTURE_PRE_ADMISSION_CODES as readonly string[]).includes(code) ||
    (AI_FIXTURE_POST_ADMISSION_CODES as readonly string[]).includes(code)
    ? code
    : null;
}

/** True only when a quota admission was consumed (attempt counts toward the limit). */
export function aiFixtureCodeCountsTowardQuota(code: AiFixtureErrorCode): boolean {
  return (AI_FIXTURE_POST_ADMISSION_CODES as readonly string[]).includes(code);
}

/** Maps the claim RPC error text (see migration RAISE messages) to a pre-admission code. */
export function mapAdmissionRpcError(
  message: string | null | undefined,
): AiFixturePreAdmissionCode {
  const m = (message ?? "").toLowerCase();
  if (m.includes("hourly refresh quota exceeded")) return "quota_exceeded_hour";
  if (m.includes("daily refresh quota exceeded")) return "quota_exceeded_day";
  if (m.includes("already running")) return "already_running";
  return "admission_unavailable";
}

export type AiFixtureOperatorEnv = Record<string, string | undefined>;

export type AiFixtureAvailability = {
  enabled: boolean;
  spendApproved: boolean;
  dispatchDisabled: boolean;
  keyPresent: boolean;
  pricingVerified: boolean;
};

export function aiFixtureAvailability(
  env: AiFixtureOperatorEnv,
  pricingVerified: boolean,
): AiFixtureAvailability {
  return {
    enabled: env["PROMPTBEATS_AI_FIXTURE_BETA_ENABLED"] === "true",
    spendApproved: env["PROMPTBEATS_AI_FIXTURE_BETA_SPEND_APPROVED"] === "true",
    dispatchDisabled: env["PROMPTBEATS_AI_DISPATCH_DISABLED"] === "true",
    keyPresent: Boolean(env["OPENROUTER_API_KEY"]?.trim()),
    pricingVerified,
  };
}

/** First operator-gate failure in the same order the server enforces; null when ready. */
export function aiFixtureGateCode(a: AiFixtureAvailability): AiFixturePreAdmissionCode | null {
  if (!a.enabled) return "beta_disabled";
  if (a.dispatchDisabled) return "dispatch_disabled";
  if (!a.spendApproved) return "spend_not_approved";
  if (!a.keyPresent) return "provider_key_missing";
  if (!a.pricingVerified) return "model_pricing_unavailable";
  return null;
}