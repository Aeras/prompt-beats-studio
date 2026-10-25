import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { aiModelAdminRpc } from "./ai-model-admin-rpc.server";
type Handler = ((arg: { data?: unknown; context: unknown }) => Promise<unknown>) & {
  authenticated: boolean;
};
function fixture(receipt: { data: unknown; error: unknown }) {
  const exports: Record<string, Handler> = {};
  const calls: { name: string; args: unknown }[] = [];
  const auth = Symbol("authenticated");
  const client = {
    rpc(name: string, args: unknown) {
      expect(this).toBe(client);
      calls.push({ name, args });
      return Promise.resolve(receipt);
    },
  };
  const compiled = ts.transpileModule(readFileSync("src/lib/ai-model-admin.functions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === "zod") return { z };
      if (name === "@/lib/ai-model-admin-rpc.server") return { aiModelAdminRpc };
      if (name === "@/lib/safe-diagnostics") return { safeErrorType: () => "Error" };
      if (name === "@/lib/server-error") return { reportServerError: () => {} };
      if (name === "@/integrations/supabase/auth-middleware") return { requireSupabaseAuth: auth };
      if (name === "@tanstack/react-start")
        return {
          createServerFn: () => {
            let validate = (input: unknown) => input;
            let middleware: unknown[] = [];
            const builder = {
              middleware(value: unknown[]) {
                middleware = value;
                return builder;
              },
              inputValidator(value: typeof validate) {
                validate = value;
                return builder;
              },
              handler(callback: (args: unknown) => Promise<unknown>) {
                return Object.assign(
                  async (args: { data?: unknown; context: unknown }) =>
                    callback({ ...args, data: validate(args.data) }),
                  { authenticated: middleware.includes(auth) },
                );
              },
            };
            return builder;
          },
        };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { handlers: exports, calls, context: { supabase: client } };
}

const id = "ac100000-0000-4000-8000-000000000001";
describe("inline model management server contracts", () => {
  test("all mutations retain authenticated caller middleware", () => {
    const f = fixture({ data: null, error: null });
    for (const name of [
      "patchAdminAiModel",
      "updateAdminAiModel",
      "uninstallAdminAiModels",
      "setAdminAiModelDefault",
    ])
      expect(f.handlers[name]!.authenticated).toBe(true);
  });
  test("partial patch carries only requested fields and CAS to caller-bound RPC", async () => {
    const f = fixture({ data: { model: { id, admin_revision: 3 }, blockers: [] }, error: null });
    await f.handlers["patchAdminAiModel"]!({
      data: { id, expectedRevision: 2, patch: { generatorEnabled: false } },
      context: f.context,
    });
    expect(f.calls).toEqual([
      {
        name: "admin_patch_ai_model",
        args: { _id: id, _expected_revision: 2, _patch: { generator_enabled: false } },
      },
    ]);
  });
  for (const [label, data] of Object.entries({
    empty: { id, expectedRevision: 0, patch: {} },
    identity: { id, expectedRevision: 0, patch: { providerModelId: "other" } },
    unknown: { id, expectedRevision: 0, patch: { accessPolicy: "admins_only" } },
    fraction: { id, expectedRevision: 0.5, patch: { status: "enabled" } },
    unsafe: { id, expectedRevision: -1, patch: { generatorEnabled: true } },
    boolean: { id, expectedRevision: 0, patch: { generatorEnabled: "true" } },
  }))
    test(`rejects invalid ${label} before SQL`, async () => {
      const f = fixture({ data: null, error: null });
      await expect(
        f.handlers["patchAdminAiModel"]!({ data, context: f.context }),
      ).rejects.toThrow();
      expect(f.calls).toHaveLength(0);
    });
  test("uninstall UUID/count/confirmation/duplicates validated before dispatch", async () => {
    const f = fixture({ data: null, error: null });
    for (const data of [
      { models: [], confirmed: true },
      { models: [{ id, revision: 0 }], confirmed: false },
      {
        models: [
          { id, revision: 0 },
          { id, revision: 0 },
        ],
        confirmed: true,
      },
      { models: [{ id: "bad", revision: 0 }], confirmed: true },
      { models: Array.from({ length: 101 }, () => ({ id, revision: 0 })), confirmed: true },
    ]) {
      await expect(
        f.handlers["uninstallAdminAiModels"]!({ data, context: f.context }),
      ).rejects.toThrow();
    }
    expect(f.calls).toHaveLength(0);
  });
  test("advanced editor preserves complete pricing/reasoning fields with CAS", async () => {
    const f = fixture({ data: { model: { id, admin_revision: 5 }, blockers: [] }, error: null });
    await f.handlers["updateAdminAiModel"]!({
      context: f.context,
      data: {
        id,
        expectedRevision: 4,
        displayName: "Advanced",
        status: "enabled",
        accessPolicy: "admin_only",
        generatorEnabled: true,
        qualityCheckEnabled: true,
        generatorReasoningEffort: "high",
        qualityCheckReasoningEffort: "medium",
        inputPricePerMillion: 2,
        outputPricePerMillion: 8,
        cachedInputPricePerMillion: 0.5,
        cacheWritePricePerMillion: 2.5,
        pricingStatus: "verified",
        notes: "Preserved note",
      },
    });
    expect(f.calls).toEqual([
      {
        name: "admin_patch_ai_model",
        args: {
          _id: id,
          _expected_revision: 4,
          _patch: {
            display_name: "Advanced",
            status: "enabled",
            access_policy: "admin_only",
            generator_enabled: true,
            quality_check_enabled: true,
            generator_reasoning_effort: "high",
            quality_check_reasoning_effort: "medium",
            input_price_per_million: 2,
            output_price_per_million: 8,
            cached_input_price_per_million: 0.5,
            cache_write_price_per_million: 2.5,
            pricing_status: "verified",
            notes: "Preserved note",
          },
        },
      },
    ]);
  });
  test("bulk hard uninstall uses one atomic RPC", async () => {
    const f = fixture({
      data: { removed: [{ id, name: "Offline", model: "offline", provider: "openai" }] },
      error: null,
    });
    await f.handlers["uninstallAdminAiModels"]!({
      data: { models: [{ id, revision: 3 }], confirmed: true },
      context: f.context,
    });
    expect(f.calls).toEqual([
      {
        name: "admin_uninstall_ai_models",
        args: { _models: [{ id, revision: 3 }], _confirmed: true },
      },
    ]);
  });
  test("errors redact database payload and make stale revisions actionable", async () => {
    for (const code of ["PT409", "42501", "P0001"]) {
      const f = fixture({
        data: null,
        error: { code, message: "synthetic-sensitive-provider-body" },
      });
      const result = f.handlers["patchAdminAiModel"]!({
        data: { id, expectedRevision: 0, patch: { status: "testing" } },
        context: f.context,
      });
      await expect(result).rejects.toThrow(
        code === "PT409" ? "Refresh and retry" : "Model change rejected",
      );
    }
  });
  test("legacy fallback replacement changes only its own operation", async () => {
    const f = fixture({ data: { model: "replacement" }, error: null });
    await f.handlers["setAdminAiModelDefault"]!({
      data: { operation: "legacy", model: "replacement" },
      context: f.context,
    });
    expect(f.calls).toEqual([
      { name: "admin_set_ai_model_default", args: { _operation: "legacy", _model: "replacement" } },
    ]);
  });
});
