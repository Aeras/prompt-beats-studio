import { describe, expect, test } from "bun:test";
import { cancelBackgroundOperation } from "./ai-cancellation-upstream.server";

const response = (status: string, http = 200) =>
  new Response(JSON.stringify({ status }), { status: http });
const secret = "test-key-do-not-log";

describe("authoritative AI background cancellation", () => {
  test("OpenAI requires separate GET confirmation", async () => {
    const calls: string[] = [];
    const result = await cancelBackgroundOperation("openai", "resp_123", secret, {
      fetchFn: (async (input: string, init: RequestInit) => {
        calls.push(`${init.method} ${input}`);
        return init.method === "POST" ? response("cancelled") : response("cancelled");
      }) as typeof fetch,
      polls: 1,
    });
    expect(result.outcome).toBe("cancelled_upstream_confirmed");
    expect(result.verifiedByGet).toBe(true);
    expect(calls).toEqual([
      "POST https://api.openai.com/v1/responses/resp_123/cancel",
      "GET https://api.openai.com/v1/responses/resp_123",
    ]);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
  test("Gemini confirmation only after polling", async () => {
    let gets = 0;
    const result = await cancelBackgroundOperation("gemini", "int_1", secret, {
      fetchFn: (async (_: string, init: RequestInit) =>
        init.method === "POST" ? response("in_progress") : response(++gets < 3 ? "in_progress" : "cancelled")) as typeof fetch,
      sleep: async () => {},
      polls: 3,
    });
    expect(gets).toBe(3);
    expect(result.outcome).toBe("cancelled_upstream_confirmed");
  });
  test("cancel HTTP 200 alone cannot confirm", async () => {
    const result = await cancelBackgroundOperation("openai", "resp_1", secret, {
      fetchFn: (async (_: string, init: RequestInit) =>
        init.method === "POST" ? response("cancelled") : response("in_progress")) as typeof fetch,
      polls: 1,
    });
    expect(result.outcome).toBe("cancel_unconfirmed");
    expect(result.verifiedByGet).toBe(false);
  });
  test("terminal completion wins a cancellation race", async () => {
    const result = await cancelBackgroundOperation("openai", "resp_1", secret, {
      fetchFn: (async (_: string, init: RequestInit) =>
        init.method === "POST" ? response("cancelled") : response("completed")) as typeof fetch,
      polls: 1,
    });
    expect(result.outcome).toBe("already_completed");
  });
  test("cancel failure followed by GET cancelled is still confirmed", async () => {
    const result = await cancelBackgroundOperation("gemini", "int_1", secret, {
      fetchFn: (async (_: string, init: RequestInit) =>
        init.method === "POST" ? response("failed", 503) : response("cancelled")) as typeof fetch,
      polls: 1,
    });
    expect(result.outcome).toBe("cancelled_upstream_confirmed");
    expect(result.cancelHttpStatus).toBe(503);
  });
  test("cancel rejected without terminal evidence is failed", async () => {
    const result = await cancelBackgroundOperation("openai", "resp_1", secret, {
      fetchFn: (async (_: string, init: RequestInit) =>
        init.method === "POST" ? response("failed", 400) : response("in_progress")) as typeof fetch,
      polls: 1,
    });
    expect(result.outcome).toBe("cancel_failed");
  });
  test("bad operation id is rejected before network access", async () => {
    let called = false;
    await expect(cancelBackgroundOperation("openai", "../other", secret, {
      fetchFn: (async () => { called = true; return response("cancelled"); }) as typeof fetch,
    })).rejects.toThrow();
    expect(called).toBe(false);
  });
});
