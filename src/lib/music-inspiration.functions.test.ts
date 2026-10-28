import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as shared from "./music-inspiration.shared";

const id = "08bfe17a-afbf-4325-b967-f135ab779e32";
const request = { kind: "artist", artist: "Offline fixture", depth: "standard" };
const result = {
  version: 1,
  researchPromptVersion: "1",
  request,
  sources: [],
  evidence: [],
  unresolvedQuestions: [],
  proposal: {
    musicStyles: [],
    moods: [],
    instruments: [],
    bpm: null,
    productionStyle: "",
    additionalInstructions: "",
    songStructure: [],
    blueprint: [],
    supportingEvidenceIds: [],
    creativeChoices: [],
  },
};

function harness() {
  const events: any[] = [];
  const headers: Record<string, string> = {};
  const model = {
    id: "installed",
    providerModelId: "live-model",
    provider: "offline",
    displayName: "Live",
    status: "enabled",
    generatorCompatible: true,
    generatorEnabled: true,
  };
  const state = {
    denied: "",
    superAdmin: false,
    configured: true,
    budget: 0.2,
    defaultStandardBudgetError: false,
    models: [model],
    available: ["live-model"],
    error: false,
    missing: false,
    job: {
      id,
      status: "completed",
      result,
      error_code: null,
      model: "live-model",
      budget_usd: 0.25,
      reserved_usd: 0.2,
      search_credits: 0,
      provider_result: "SECRET",
      private_journal: "SECRET",
    },
  };
  let table = "";
  let mutation = "";
  const response = () => ({
    error: state.error ? { message: "SECRET" } : null,
    data: state.missing
      ? null
      : table === "music_inspiration_jobs"
        ? state.job
        : { id, name: "Saved", revision: 2, result, private_journal: "SECRET" },
  });
  const query: any = {};
  for (const method of ["select", "eq", "order", "insert", "update", "delete"]) {
    query[method] = (...args: any[]) => {
      events.push([method, ...args]);
      if (["insert", "update", "delete"].includes(method)) mutation = method;
      return query;
    };
  }
  query.single = query.maybeSingle = async () => response();
  query.then = (resolve: any, reject: any) =>
    Promise.resolve({
      ...response(),
      data: mutation
        ? response().data
        : table === "music_inspiration_profiles"
          ? [response().data]
          : response().data,
    }).then(resolve, reject);
  const client = {
    from: (name: string) => {
      events.push(["from", name]);
      table = name;
      mutation = "";
      return query;
    },
    rpc: async (name: string, args: any) => {
      events.push([name, args]);
      return {
        error: state.error ? {} : null,
        data: state.missing
          ? null
          : name === "current_user_is_super_admin"
            ? state.superAdmin
            : name === "delete_music_inspiration_profile"
              ? true
              : name === "save_music_inspiration_profile"
                ? { id, name: "Saved", revision: 2, result }
                : state.job,
      };
    },
  };
  const exported: Record<string, any> = {};
  const auth = Symbol("auth");
  runInNewContext(
    ts.transpileModule(readFileSync("src/lib/music-inspiration.functions.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports: exported,
      require(name: string) {
        if (name === "zod") return { z };
        if (name === "./music-inspiration.shared") return shared;
        if (name === "@tanstack/react-start/server")
          return {
            setResponseHeader: (k: string, v: string) => {
              headers[k] = v;
            },
          };
        if (name === "@/integrations/supabase/auth-middleware")
          return { requireSupabaseAuth: auth };
        if (name === "./feature-access.functions")
          return {
            requireFeatureAccess: async (s: any, key: string) => {
              expect(s).toBe(client);
              events.push(["feature", key]);
              if (state.denied === key) throw new Error("Denied");
            },
          };
        if (name === "./ai-model-registry.server")
          return {
            getOperationDefaultModel: async (op: string) => {
              expect(op).toBe("generator");
              return model;
            },
            getInstalledRegistryModels: async () => state.models,
          };
        if (name === "./ai-provider.server")
          return {
            getEffectiveModelAccess: async (user: string, op: string) => {
              expect(user).toBe("owner");
              expect(op).toBe("generator");
              return { availableModels: state.available };
            },
          };
        if (name === "./music-inspiration-research.server")
          return {
            inspectMusicInspirationConfiguration: async () => ({
              configured: state.configured,
              reason: state.configured ? null : "Missing verified search configuration",
            }),
            researchBudgetForModel: async (...args: any[]) => {
              events.push(["budget", ...args]);
              if (
                state.defaultStandardBudgetError &&
                args[0] === "live-model" &&
                args[2] === "standard"
              )
                throw new Error("Default standard budget unavailable");
              return state.budget;
            },
          };
        if (name === "@/integrations/supabase/client.server")
          return {
            supabaseAdmin: {
              rpc: async (rpc: string, args: any) => {
                events.push(["admin", rpc, args]);
                return { data: [state.job], error: null };
              },
            },
          };
        if (name === "@tanstack/react-start")
          return {
            createServerFn: () => {
              let validate = (x: any) => x;
              const builder = {
                middleware: (m: any) => {
                  expect(m).toEqual([auth]);
                  return builder;
                },
                inputValidator: (v: any) => {
                  validate = v;
                  return builder;
                },
                handler: (handler: any) => async (args: any) =>
                  handler({ ...args, data: validate(args.data) }),
              };
              return builder;
            },
          };
        throw new Error(`Unexpected dependency ${name}`);
      },
    },
  );
  return {
    state,
    events,
    headers,
    call: (name: string, data?: any) =>
      exported[name]({ context: { supabase: client, userId: "owner" }, data }),
  };
}

describe("Music Inspiration real server entrypoints (offline)", () => {
  test("all actions enforce fresh feature access and no-store before database work", async () => {
    const cases: [string, any][] = [
      ["getMusicInspirationConfig", undefined],
      ["startMusicInspiration", { requestId: id, request }],
      ["getMusicInspirationJob", { id }],
      ["cancelMusicInspiration", { id }],
      ["listMusicInspirationProfiles", undefined],
      ["saveMusicInspirationProfile", { jobId: id, name: "Saved" }],
      ["updateMusicInspirationProfile", { id, revision: 1, name: "Renamed" }],
      ["deleteMusicInspirationProfile", { id, revision: 1 }],
    ];
    for (const [name, data] of cases)
      for (const denied of ["ai_music_inspiration", "ai_generator"]) {
        const h = harness();
        h.state.denied = denied;
        await expect(h.call(name, data)).rejects.toThrow("Denied");
        expect(h.events).toEqual(
          denied === "ai_generator"
            ? [
                ["feature", "ai_music_inspiration"],
                ["feature", "ai_generator"],
              ]
            : [["feature", denied]],
        );
        expect(h.headers["Cache-Control"]).toBe("private, no-store");
        expect(h.headers["Vary"]).toBe("Cookie, Authorization");
      }
  });
  test("config resolves installed entitled live default, rejects testing/catalog/disabled models", async () => {
    const h = harness();
    expect(await h.call("getMusicInspirationConfig")).toEqual({
      configured: true,
      reason: null,
      superAdmin: false,
      defaultModel: "live-model",
      models: [{ id: "live-model", label: "Live" }],
    });
    for (const change of [{ id: null }, { status: "testing" }, { generatorEnabled: false }]) {
      const denied = harness();
      Object.assign(denied.state.models[0]!, change);
      await expect(denied.call("getMusicInspirationConfig")).rejects.toThrow("installed");
    }
    h.state.available = [];
    await expect(h.call("getMusicInspirationConfig")).rejects.toThrow("installed");
  });
  test("start only reserves via service RPC, strips raw journal, and rechecks model/depth", async () => {
    const h = harness();
    const job = await h.call("startMusicInspiration", { requestId: id, request });
    expect(Object.keys(job).sort()).toEqual(
      [
        "id",
        "status",
        "result",
        "error_code",
        "model",
        "budget_usd",
        "reserved_usd",
        "search_credits",
      ].sort(),
    );
    expect(h.events.find((e) => e[0] === "admin")).toEqual([
      "admin",
      "start_music_inspiration_job",
      {
        _user_id: "owner",
        _request_id: id,
        _request: request,
        _model: "live-model",
        _provider: "offline",
        _budget: 0.2,
      },
    ]);
    await expect(
      h.call("startMusicInspiration", { requestId: id, request, modelOverride: "live-model" }),
    ).rejects.toThrow("Super Admin");
    await expect(
      h.call("startMusicInspiration", {
        requestId: id,
        request: { ...request, depth: "extended" },
      }),
    ).rejects.toThrow("Super Admin");
    h.state.superAdmin = true;
    await expect(
      h.call("startMusicInspiration", { requestId: id, request, modelOverride: "unknown" }),
    ).rejects.toThrow("not available");
  });
  test("Super Admin can choose an affordable entitled override or extended depth when default standard budget fails", async () => {
    const h = harness();
    h.state.defaultStandardBudgetError = true;
    expect((await h.call("getMusicInspirationConfig")).configured).toBe(false);
    h.state.superAdmin = true;
    h.state.models.push({
      ...h.state.models[0]!,
      id: "override-installed",
      providerModelId: "affordable-model",
    });
    h.state.available.push("affordable-model");
    const config = await h.call("getMusicInspirationConfig");
    expect(config.configured).toBe(true);
    expect(config.reason).toContain("pricing");
    expect(config.models).toContainEqual({ id: "affordable-model", label: "Live" });
    expect(h.events.some((e) => e[0] === "admin")).toBe(false);
    await expect(h.call("startMusicInspiration", { requestId: id, request })).rejects.toThrow(
      "Default standard budget",
    );
    expect(h.events.some((e) => e[0] === "admin")).toBe(false);
    await h.call("startMusicInspiration", {
      requestId: id,
      request,
      modelOverride: "affordable-model",
    });
    expect(h.events).toContainEqual(["budget", "affordable-model", "offline", "standard"]);
    await h.call("startMusicInspiration", {
      requestId: id,
      request: { ...request, depth: "extended" },
    });
    expect(h.events).toContainEqual(["budget", "live-model", "offline", "extended"]);
    h.state.configured = false;
    expect((await h.call("getMusicInspirationConfig")).configured).toBe(false);
  });
  test("missing configuration and invalid budget block start while profile reuse still works", async () => {
    for (const budget of [NaN, 0, -1, 0.26]) {
      const h = harness();
      h.state.budget = budget;
      await expect(h.call("startMusicInspiration", { requestId: id, request })).rejects.toThrow(
        "budget",
      );
      expect(h.events.some((e) => e[0] === "admin")).toBe(false);
    }
    const h = harness();
    h.state.configured = false;
    expect((await h.call("getMusicInspirationConfig")).configured).toBe(false);
    await expect(h.call("startMusicInspiration", { requestId: id, request })).rejects.toThrow(
      "Missing verified",
    );
    expect(await h.call("listMusicInspirationProfiles")).toHaveLength(1);
  });
  test("job reads and cancellation use caller auth, owner filters and public projection", async () => {
    for (const name of ["getMusicInspirationJob", "cancelMusicInspiration"]) {
      const h = harness();
      const job = await h.call(name, { id });
      expect(job).not.toHaveProperty("provider_result");
      expect(job).not.toHaveProperty("private_journal");
      expect(h.events).toContainEqual(["eq", "user_id", "owner"]);
      if (name === "cancelMusicInspiration")
        expect(h.events).toContainEqual(["cancel_music_inspiration_job", { _job_id: id }]);
      h.state.missing = true;
      await expect(h.call(name, { id })).rejects.toThrow("unavailable");
    }
  });
  test("save/update trust only strictly validated completed owned job results", async () => {
    for (const name of ["saveMusicInspirationProfile", "updateMusicInspirationProfile"]) {
      const h = harness();
      const data = name.startsWith("save")
        ? { jobId: id, name: "Saved" }
        : { id, revision: 1, jobId: id };
      expect((await h.call(name, data)).result).toEqual(result);
      expect(h.events).toContainEqual([
        "save_music_inspiration_profile",
        {
          _id: name.startsWith("save") ? null : id,
          _expected_revision: name.startsWith("save") ? null : 1,
          _name: name.startsWith("save") ? "Saved" : null,
          _job_id: id,
        },
      ]);
      expect(h.events).toContainEqual(["eq", "status", "completed"]);
      expect(h.events).toContainEqual(["eq", "user_id", "owner"]);
      await expect(h.call(name, { ...data, result })).rejects.toThrow();
      (h.state.job.result as any).privateJournal = "injected";
      await expect(h.call(name, data)).rejects.toThrow();
      delete (h.state.job.result as any).privateJournal;
      h.state.missing = true;
      await expect(h.call(name, data)).rejects.toThrow("unavailable");
    }
  });
  test("rename and delete compare owner and revision, and reject zero affected rows/errors", async () => {
    for (const name of ["updateMusicInspirationProfile", "deleteMusicInspirationProfile"]) {
      const h = harness();
      const data = { id, revision: 1, ...(name.startsWith("update") ? { name: "Renamed" } : {}) };
      const value = await h.call(name, data);
      if (name.startsWith("update"))
        expect(h.events).toContainEqual([
          "save_music_inspiration_profile",
          {
            _id: id,
            _expected_revision: 1,
            _name: "Renamed",
            _job_id: null,
          },
        ]);
      else {
        expect(h.events).toContainEqual([
          "delete_music_inspiration_profile",
          {
            _id: id,
            _expected_revision: 1,
          },
        ]);
        expect(value).toEqual({ deleted: true });
      }
      expect(h.events.some((e) => ["insert", "update", "delete"].includes(e[0]))).toBe(false);
      h.state.missing = true;
      await expect(h.call(name, data)).rejects.toThrow("revision conflict");
      h.state.missing = false;
      h.state.error = true;
      await expect(h.call(name, data)).rejects.toThrow("revision conflict");
    }
  });
});
