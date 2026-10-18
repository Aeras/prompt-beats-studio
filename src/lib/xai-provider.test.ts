import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("xAI Generator transport", () => {
  test("uses xAI Responses API for Grok reasoning models", async () => {
    const provider = await source("./ai-provider.server.ts");
    expect(provider).toContain('"https://api.x.ai/v1/responses"');
    expect(provider).toContain('reasoning: { effort: reasoningEffort }');
    expect(provider).toContain('name: "promptbeats_response"');
    expect(provider).toContain('type: "json_schema"');
  });

  test("uses xAI-safe timeout and explicit reasoning defaults", async () => {
    const provider = await source("./ai-provider.server.ts");
    expect(provider).toContain('call.reasoningEffort === "max"');
    expect(provider).toContain('? "xhigh"');
    expect(provider).toContain('call.reasoningEffort ?? "medium"');
    expect(provider).toContain('15 * 60 * 1000');
    expect(provider).toContain('30 * 60 * 1000');
  });

  test("does not route xAI through the legacy shared Chat Completions adapter", async () => {
    const provider = await source("./ai-provider.server.ts");
    const xaiStart = provider.indexOf("async function callXai");
    const schemaStart = provider.indexOf("function toOpenAiJsonSchema", xaiStart);
    const xaiBlock = provider.slice(xaiStart, schemaStart);
    expect(xaiBlock).not.toContain("callOpenAiCompatible(");
    expect(xaiBlock).not.toContain("/v1/chat/completions");
  });
});
