import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { recordInstalledModelProbe } from "./ai-model-verification.server";
import type { CompatibilityResult } from "./ai-provider-registry.server";

const model = {
  id: "installed-id",
  provider: "openrouter",
  provider_model_id: "exact/model:free",
  admin_revision: 3,
};
const result: CompatibilityResult = {
  id: model.provider_model_id,
  name: "Model",
  status: "inconclusive",
  generatorCompatible: false,
  qualityCheckCompatible: false,
  contextWindow: null,
  installed: false,
};
function database(auditError: unknown = null, updateError: unknown = null, exists = true) {
  const events: string[] = [];
  const audit: any[] = [];
  const patches: any[] = [];
  const filters: unknown[][] = [];
  const query = {
    update(patch: unknown) {
      events.push("update");
      patches.push(patch);
      return query;
    },
    eq(...args: unknown[]) {
      filters.push(args);
      return query;
    },
    select() {
      return query;
    },
    maybeSingle: async () => ({ data: exists ? { id: model.id } : null, error: updateError }),
  };
  return {
    events,
    audit,
    patches,
    filters,
    client: {
      from(table: string) {
        if (table === "admin_audit_log")
          return {
            insert: async (row: unknown) => {
              events.push("audit");
              audit.push(row);
              return { error: auditError };
            },
          };
        expect(table).toBe("ai_models");
        return query;
      },
    },
  };
}

describe("installed model probe evidence", () => {
  test("inconclusive probe preserves all historical capabilities, selections and policies", async () => {
    const db = database();
    await recordInstalledModelProbe(db.client, "admin-id", model, result);
    expect(Object.keys(db.patches[0]).sort()).toEqual(["last_checked_at", "updated_at"]);
    expect(db.filters).toEqual([
      ["id", model.id],
      ["admin_revision", 3],
    ]);
    expect(db.events).toEqual(["audit", "update"]);
    expect(db.audit[0].action).toBe("UPDATE_AI_MODEL");
    expect(db.audit[0].details).toMatchObject({
      operation: "compatibility_probe",
      generator_passed: false,
      quality_check_passed: false,
    });
  });
  test("mixed result only upgrades the positively verified capability", async () => {
    const db = database();
    await recordInstalledModelProbe(db.client, "admin-id", model, {
      ...result,
      generatorCompatible: true,
    });
    expect(db.patches[0].generator_compatible).toBe(true);
    expect(db.patches[0]).not.toHaveProperty("quality_check_compatible");
    for (const key of [
      "status",
      "access_policy",
      "generator_enabled",
      "quality_check_enabled",
      "provider",
      "provider_model_id",
    ])
      expect(db.patches[0]).not.toHaveProperty(key);
  });
  test("audit failure prevents unaudited capability mutation", async () => {
    const db = database({ code: "23514" });
    await expect(recordInstalledModelProbe(db.client, "admin-id", model, result)).rejects.toThrow(
      "Could not record",
    );
    expect(db.patches).toHaveLength(0);
  });
  test("concurrent edit or uninstall is not reported as saved", async () => {
    const db = database(null, null, false);
    await expect(recordInstalledModelProbe(db.client, "admin-id", model, result)).rejects.toThrow(
      "Model settings changed",
    );
    expect(db.audit[0].details.operation).toBe("compatibility_probe");
  });
  test("database failure is surfaced after retaining the probe audit", async () => {
    const db = database(null, { code: "42501" });
    await expect(recordInstalledModelProbe(db.client, "admin-id", model, result)).rejects.toThrow(
      "Could not save",
    );
    expect(db.audit).toHaveLength(1);
  });
  test("handler authenticates and returns current evidence without historical boolean overrides", () => {
    const source = readFileSync("src/lib/ai-model-admin.functions.ts", "utf8")
      .split("export const verifyInstalledAiModelCompatibility")[1]!
      .split("const addDiscoveredModelInput")[0]!;
    expect(source).toContain(".middleware([requireSupabaseAuth])");
    expect(source).toContain("await requireAdmin(context.supabase)");
    expect(source).toContain("await recordInstalledModelProbe");
    expect(source).toContain("return result;");
    expect(source).not.toContain("return { ...result,");
    expect(source).not.toContain("model.generator_compatible === true ||");
  });
});

async function probe(responses: (Response | Error)[]) {
  const requests: any[] = [];
  const exports: any = {};
  const compiled = ts.transpileModule(
    readFileSync("src/lib/ai-provider-registry.server.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  runInNewContext(compiled, {
    exports,
    process: { env: { OPENROUTER_API_KEY: "synthetic-offline-key" } },
    AbortController,
    setTimeout,
    clearTimeout,
    console: { warn() {} },
    require(name: string) {
      if (name !== "./global-ai-usage.server") throw new Error(`Unexpected dependency ${name}`);
      return {
        AiUsageUnavailableError: class extends Error {},
        aiProviderFetch: async (_url: string, options: any) => {
          requests.push(JSON.parse(options.body));
          const next = responses.shift();
          if (next instanceof Error) throw next;
          if (!next) throw new Error("Unexpected extra provider call");
          return next;
        },
      };
    },
  });
  const response = await exports.testSingleProviderModelCompatibility("openrouter", {
    id: model.provider_model_id,
    name: "Model",
    ownedBy: null,
    contextWindow: null,
    deprecated: false,
    installed: false,
  });
  return { response, requests };
}
const answer = (content: string) => Response.json({ choices: [{ message: { content } }] });
describe("OpenRouter minimal probes (mocked transport only)", () => {
  test("empty reasoning-limited output is inconclusive, never a compatibility success or rejection", async () => {
    const { response, requests } = await probe([answer(""), answer("")]);
    expect(response.status).toBe("inconclusive");
    expect(response.generatorCompatible).toBe(false);
    expect(response.qualityCheckCompatible).toBe(false);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.model).toBe(model.provider_model_id);
      expect(request.max_tokens).toBe(120);
    }
  });
  test("valid generator plus incomplete QC retains independent positive evidence", async () => {
    const { response } = await probe([
      answer('{"title":"Test","lyrics":"Test line"}'),
      answer('{"passed":'),
    ]);
    expect(response.status).toBe("inconclusive");
    expect(response.generatorCompatible).toBe(true);
    expect(response.qualityCheckCompatible).toBe(false);
  });
  test("both valid shapes pass with exactly two dispatches", async () => {
    const { response, requests } = await probe([
      answer('{"title":"Test","lyrics":"Line"}'),
      answer('{"passed":true,"score":10}'),
    ]);
    expect(response.status).toBe("compatible");
    expect(requests).toHaveLength(2);
  });
  test("routing rejection and network failure are inconclusive with no retries", async () => {
    const { response, requests } = await probe([
      new Response("{}", { status: 400 }),
      new Error("offline timeout"),
    ]);
    expect(response.status).toBe("inconclusive");
    expect(requests).toHaveLength(2);
  });
});
