import { describe, expect, it } from "bun:test";
import {
  aiFixtureAvailability,
  aiFixtureCodeCountsTowardQuota,
  aiFixtureErrorMessage,
  aiFixtureGateCode,
  mapAdmissionRpcError,
  parseAiFixtureErrorCode,
} from "./football-ai-fixture-errors.shared";
import { aiFixtureFailureText } from "@/components/football/ai-search-messages";

const ready = {
  PROMPTBEATS_AI_FIXTURE_BETA_ENABLED: "true",
  PROMPTBEATS_AI_FIXTURE_BETA_SPEND_APPROVED: "true",
  OPENROUTER_API_KEY: "k",
};

describe("AI fixture failure codes", () => {
  it("production state (flags unset) is beta_disabled and not counted", () => {
    const a = aiFixtureAvailability({ OPENROUTER_API_KEY: "k" }, true);
    expect(a).toEqual({
      enabled: false,
      spendApproved: false,
      dispatchDisabled: false,
      keyPresent: true,
      pricingVerified: true,
    });
    expect(aiFixtureGateCode(a)).toBe("beta_disabled");
    expect(aiFixtureCodeCountsTowardQuota("beta_disabled")).toBe(false);
  });

  it("gates in server order", () => {
    expect(
      aiFixtureGateCode(
        aiFixtureAvailability({ ...ready, PROMPTBEATS_AI_DISPATCH_DISABLED: "true" }, true),
      ),
    ).toBe("dispatch_disabled");
    expect(
      aiFixtureGateCode(
        aiFixtureAvailability(
          { ...ready, PROMPTBEATS_AI_FIXTURE_BETA_SPEND_APPROVED: undefined },
          true,
        ),
      ),
    ).toBe("spend_not_approved");
    expect(
      aiFixtureGateCode(aiFixtureAvailability({ ...ready, OPENROUTER_API_KEY: "  " }, true)),
    ).toBe("provider_key_missing");
    expect(aiFixtureGateCode(aiFixtureAvailability(ready, false))).toBe(
      "model_pricing_unavailable",
    );
    expect(aiFixtureGateCode(aiFixtureAvailability(ready, true))).toBeNull();
  });

  it("maps claim RPC errors", () => {
    expect(mapAdmissionRpcError("AI fixture hourly refresh quota exceeded")).toBe(
      "quota_exceeded_hour",
    );
    expect(mapAdmissionRpcError("AI fixture daily refresh quota exceeded")).toBe(
      "quota_exceeded_day",
    );
    expect(mapAdmissionRpcError("AI fixture refresh already running")).toBe("already_running");
    expect(mapAdmissionRpcError("not permitted")).toBe("admission_unavailable");
    expect(mapAdmissionRpcError(undefined)).toBe("admission_unavailable");
  });

  it("classifies pre vs post admission", () => {
    for (const c of [
      "quota_exceeded_hour",
      "already_running",
      "cost_changed",
      "spend_not_approved",
    ] as const)
      expect(aiFixtureCodeCountsTowardQuota(c)).toBe(false);
    for (const c of [
      "dispatch_admission_failed",
      "provider_failed",
      "provider_http_4xx",
      "provider_http_5xx",
      "provider_network_failed",
      "provider_response_invalid",
      "invalid_ai_output",
      "corroboration_failed",
      "persistence_failed",
    ] as const)
      expect(aiFixtureCodeCountsTowardQuota(c)).toBe(true);
  });

  it("post-SQL-admission dispatch denial is recorded as counted, not provider failure", () => {
    expect(aiFixtureCodeCountsTowardQuota("dispatch_admission_failed")).toBe(true);
    expect(aiFixtureFailureText("dispatch_admission_failed", "el")).toContain("μετράει στο όριο");
    expect(
      parseAiFixtureErrorCode(new Error(aiFixtureErrorMessage("dispatch_admission_failed"))),
    ).toBe("dispatch_admission_failed");
  });

  it("round-trips through the error message and rejects unknown codes", () => {
    expect(parseAiFixtureErrorCode(new Error(aiFixtureErrorMessage("corroboration_failed")))).toBe(
      "corroboration_failed",
    );
    expect(parseAiFixtureErrorCode(new Error("AI_FIXTURE:bogus"))).toBeNull();
    expect(parseAiFixtureErrorCode(new Error("network"))).toBeNull();
  });

  it("only post-admission messages say the attempt counts", () => {
    expect(aiFixtureFailureText("beta_disabled", "el")).toContain("δεν μετράει");
    expect(aiFixtureFailureText("provider_failed", "el")).toContain("μετράει στο όριο");
    expect(aiFixtureFailureText("provider_failed", "el")).not.toContain("δεν μετράει");
    expect(aiFixtureFailureText("quota_exceeded_day", "en")).toContain("does not count");
  });
});
