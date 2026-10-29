import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { INSPIRATION_PLANNER } from "./music-inspiration-planner.server";

test("actual compatible adapter enables JSON object output only for an explicit supported OpenRouter call", async () => {
  const source = ts.createSourceFile(
    "provider.ts",
    readFileSync("src/lib/ai-provider.server.ts", "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const node = source.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === "callOpenAiCompatible",
  );
  if (!node) throw Error("Actual adapter missing");
  const bodies: any[] = [];
  const endpoints: string[] = [];
  const exported: any = {};
  runInNewContext(
    ts.transpileModule(node.getFullText(source) + "\nexports.invoke=callOpenAiCompatible;", {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports: exported,
      fetch: async (url: string, init: RequestInit) => {
        endpoints.push(url);
        bodies.push(JSON.parse(String(init.body)));
        return new Response(
          JSON.stringify({
            choices: [{ finish_reason: "stop", message: { content: "{}" } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        );
      },
      providerRequestSignal: () => new AbortController().signal,
      observeUsage: async () => {},
      usageEvidence: () => ({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
      console: { warn: () => {}, error: () => {} },
    },
  );
  const call = {
    system: "Return JSON",
    prompt: "Offline fixture",
    maxTokens: 2200,
    jsonObjectOutput: true,
  };
  const result = await exported.invoke(
    "openrouter",
    "https://openrouter.ai/api/v1/chat/completions",
    "offline-test-key",
    INSPIRATION_PLANNER.model,
    call,
    false,
  );
  expect(bodies[0].response_format).toEqual({ type: "json_object" });
  expect(bodies[0].model).toBe(INSPIRATION_PLANNER.model);
  expect(bodies[0].max_tokens).toBe(2200);
  expect(bodies[0]).not.toHaveProperty("jsonObjectOutput");
  expect(result.provider).toBe("openrouter");
  expect(result.model).toBe(INSPIRATION_PLANNER.model);
  await exported.invoke(
    "openrouter",
    "https://openrouter.ai/api/v1/chat/completions",
    "offline-test-key",
    "creator-selected",
    { system: "fixture", prompt: "fixture" },
    false,
  );
  expect(bodies[1]).not.toHaveProperty("response_format");
  await exported.invoke(
    "openai",
    "https://example.invalid/offline",
    "offline-test-key",
    "unchanged-other-provider",
    call,
    false,
  );
  expect(bodies[2]).not.toHaveProperty("response_format");
  await exported.invoke(
    "openrouter",
    "https://openrouter.ai/api/v1/chat/completions",
    "offline-test-key",
    "z-ai/glm-5.3-flash",
    { system: "fixture", prompt: "fixture", schema: {} },
    false,
  );
  expect(bodies[3].response_format).toEqual({ type: "json_object" });
  expect(endpoints[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(endpoints).toHaveLength(4);
});
