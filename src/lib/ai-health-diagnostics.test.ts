import { describe, expect, test } from "bun:test";

import { displayAiHealthStatus, getAiHealthDiagnostic } from "./ai-health-diagnostics";

describe("AI health diagnostics", () => {
  test("classifies provider high-demand 503 errors as warnings", () => {
    const diagnostic = getAiHealthDiagnostic(
      '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}',
    );

    expect(diagnostic?.severity).toBe("warning");
    expect(diagnostic?.code).toBe("high_demand");
    expect(displayAiHealthStatus("failing", "HTTP 503 high demand")).toBe("degraded");
  });

  test("classifies rate limits, timeouts, and network interruptions as warnings", () => {
    expect(getAiHealthDiagnostic("HTTP 429 Too Many Requests")?.code).toBe("rate_limit");
    expect(getAiHealthDiagnostic("runtime_probe_timeout")?.code).toBe("timeout");
    expect(getAiHealthDiagnostic("TypeError: fetch failed")?.code).toBe("network");
  });

  test("keeps invalid runtime responses as failures", () => {
    expect(getAiHealthDiagnostic("incomplete_runtime_response")?.severity).toBe("failure");
    expect(getAiHealthDiagnostic("invalid_runtime_probe_json")?.severity).toBe("failure");
    expect(displayAiHealthStatus("failing", "incomplete_runtime_response")).toBe("failing");
  });

  test("classifies authentication and unavailable-model errors as failures", () => {
    expect(getAiHealthDiagnostic("HTTP 401 invalid API key")?.code).toBe("authentication");
    expect(getAiHealthDiagnostic("HTTP 404 model not found")?.code).toBe("model_unavailable");
  });

  test("preserves healthy status when there is no diagnostic error", () => {
    expect(getAiHealthDiagnostic(null)).toBeNull();
    expect(displayAiHealthStatus("healthy", null)).toBe("healthy");
  });
});
