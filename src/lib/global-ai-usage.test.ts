import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { AsyncLocalStorage } from "node:async_hooks";
import ts from "typescript";

function fixture() {
  let enabled = true;
  let reads = 0;
  let sends = 0;
  let failure: string | null = null;
  const exports = {} as typeof import("./global-ai-usage.server");
  const module = { exports };
  const code = ts.transpileModule(
    readFileSync(new URL("./global-ai-usage.server.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const transport = async () => {
    sends++;
    return new Response("ok");
  };
  runInNewContext(code, {
    exports,
    module,
    process: { env: {} },
    URL,
    Request,
    AbortSignal,
    fetch: transport,
    require: (name: string) => {
      if (name === "node:async_hooks") return { AsyncLocalStorage };
      if (name.includes("client.server"))
        return {
          supabaseAdmin: {
            rpc: () => ({
              abortSignal: async () => {
                reads++;
                if (failure) throw new Error(failure);
                return { data: enabled, error: enabled ? null : { code: "PT423" } };
              },
            }),
          },
        };
      throw new Error(name);
    },
  });
  return {
    api: exports,
    reads: () => reads,
    sends: () => sends,
    off: () => {
      enabled = false;
    },
    fail: () => {
      failure = "SECRET-DATABASE-DETAIL";
    },
  };
}

describe("global AI dispatch policy", () => {
  test("fresh server permission on every direct dispatch; OFF fails closed", async () => {
    const f = fixture();
    await f.api.aiProviderFetch("https://api.openai.com/v1/responses");
    f.off();
    await expect(f.api.aiProviderFetch("https://api.openai.com/v1/responses")).rejects.toThrow(
      "temporarily disabled",
    );
    expect(f.reads()).toBe(2);
    expect(f.sends()).toBe(1);
  });
  test("database failure is redacted and never sends", async () => {
    const f = fixture();
    f.fail();
    await expect(f.api.aiProviderFetch("https://api.openai.com/v1/responses")).rejects.toThrow(
      "availability could not be verified",
    );
    expect(f.sends()).toBe(0);
  });
  test("one admitted send may finish after OFF, retry needs a new permit", async () => {
    const f = fixture();
    await f.api.withAiDispatchAdmission(async () => {
      f.off();
      await f.api.aiProviderFetch("https://api.openai.com/v1/responses");
      await expect(f.api.aiProviderFetch("https://api.openai.com/v1/responses")).rejects.toThrow(
        "temporarily disabled",
      );
    });
    expect(f.reads()).toBe(2);
    expect(f.sends()).toBe(1);
  });
  test("parallel sends cannot share a single unused permit", async () => {
    const f = fixture();
    await f.api.withAiDispatchAdmission(async () => {
      f.off();
      const results = await Promise.allSettled([
        f.api.aiProviderFetch("https://api.openai.com/v1/responses"),
        f.api.aiProviderFetch("https://api.openai.com/v1/responses"),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    });
    expect(f.sends()).toBe(1);
  });
  test("nested auxiliary / journal admission does not double-admit one dispatch", async () => {
    const f = fixture();
    await f.api.withAiDispatchAdmission(() =>
      f.api.withAiDispatchAdmission(() =>
        f.api.aiProviderFetch("https://api.openai.com/v1/responses"),
      ),
    );
    expect(f.reads()).toBe(1);
    expect(f.sends()).toBe(1);
  });
  test("existing-operation polling and accounting remain available OFF", async () => {
    const f = fixture();
    f.off();
    for (const url of [
      "https://api.openai.com/v1/responses/resp_fixture",
      "https://generativelanguage.googleapis.com/v1beta/interactions/fixture",
      "https://openrouter.ai/api/v1/generation?id=fixture",
      "https://api.runpod.ai/v2/endpoint/status/job",
    ])
      await f.api.aiContinuationFetch(url);
    expect(f.reads()).toBe(0);
    expect(f.sends()).toBe(4);
    expect(() =>
      f.api.aiContinuationFetch("https://api.openai.com/v1/responses", { method: "POST" }),
    ).toThrow("Invalid existing");
    expect(() => f.api.aiContinuationFetch("http://api.openai.com/v1/responses/id")).toThrow(
      "Invalid existing",
    );
  });
  test("Google SDK retry is explicitly single-attempt and re-admitted", async () => {
    const f = fixture();
    let calls = 0;
    const exports = {} as typeof import("./guarded-google-ai.server");
    const code = ts.transpileModule(
      readFileSync(new URL("./guarded-google-ai.server.ts", import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    runInNewContext(code, { exports, require: () => f.api, setTimeout, Math });
    const ai = {
      models: {
        generateContent: async (params: {
          config: { httpOptions: { retryOptions: { attempts: number } } };
        }) => {
          calls++;
          expect(params.config.httpOptions.retryOptions.attempts).toBe(1);
          f.off();
          throw { status: 503 };
        },
      },
    };
    await expect(
      exports.generateAiContent(ai as unknown as import("@google/genai").GoogleGenAI, {
        model: "fixture",
        contents: "offline",
        config: { httpOptions: { retryOptions: { attempts: 2, initialDelay: 0, jitter: 0 } } },
      }),
    ).rejects.toThrow("temporarily disabled");
    expect(calls).toBe(1);
    expect(f.reads()).toBe(2);
  });
});

test("dispatch inventory guards direct transports and confines SDK dispatch", () => {
  const guarded = [
    "ai-provider.server.ts",
    "ai-provider-registry.server.ts",
    "audio-model-lab.functions.ts",
    "inspiration-wall-ai.functions.ts",
    "song-analyzer-final.functions.ts",
    "song-analyzer-stage-a-guard.functions.ts",
    "song-analyzer.functions.ts",
    "song-analyzer-v2.server.ts",
  ];
  for (const file of guarded) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(source).toContain("aiProviderFetch as fetch");
    expect(source).not.toContain("globalThis.fetch");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const inspect = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression))
        expect(node.expression.name.text).not.toBe("generateContent");
      ts.forEachChild(node, inspect);
    };
    inspect(ast);
  }
  for (const file of [
    "song-analyzer-enhanced.functions.ts",
    "song-analyzer-enhanced-job.functions.ts",
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(source).toContain("aiProviderFetch : aiContinuationFetch");
  }
});
