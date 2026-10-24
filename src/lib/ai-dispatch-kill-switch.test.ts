import { describe, expect, test } from "bun:test";

import { modelCaller } from "./ai-provider.server";

describe("PB-AUD-015 emergency provider dispatch stop", () => {
  test("stops a model call before any provider lookup or network access", async () => {
    const previous = process.env["PROMPTBEATS_AI_DISPATCH_DISABLED"];
    try {
      process.env["PROMPTBEATS_AI_DISPATCH_DISABLED"] = "true";
      const call = modelCaller("test-model", "unsupported-test-provider");
      await expect(
        Promise.resolve().then(() => call({ system: "test", prompt: "test" })),
      ).rejects.toThrow("AI generation is temporarily unavailable.");
    } finally {
      if (previous === undefined) delete process.env["PROMPTBEATS_AI_DISPATCH_DISABLED"];
      else process.env["PROMPTBEATS_AI_DISPATCH_DISABLED"] = previous;
    }
  });
});
