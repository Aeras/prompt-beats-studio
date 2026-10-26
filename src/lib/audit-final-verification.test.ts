import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as diagnostics from "./safe-diagnostics";
import { safeErrorMetadata } from "./song-analyzer-v2.server";
import { usageEvidence } from "./ai-usage-evidence";
import { trackedCaller, type ExecutionDependencies } from "./ai-execution.server";
import type { ModelCall, ModelResult } from "./ai-provider.server";
import {
  assertGenerationRequestBudget,
  MAX_GENERATION_REQUEST_BYTES,
} from "./generator-input-limits";
import { AI_TARGET_PLATFORMS, DEFAULT_AI_TARGET_PLATFORM } from "./ai-target-platforms";
import { songBlueprintSchema } from "./song-blueprint.shared";
import {
  generatorInputSnapshotSchema,
  revisionJobContextSchema,
} from "./generator-revision.shared";

const marker = "SyntheticPrivateTokenMarker";
function selected(path: string, names: string[], handler = false) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  return names
    .map((name) => {
      for (const node of source.statements) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.getText(source);
        if (!ts.isVariableStatement(node)) continue;
        const item = node.declarationList.declarations.find(
          (entry) => entry.name.getText(source) === name,
        );
        if (!item) continue;
        if (handler && item.initializer && ts.isCallExpression(item.initializer)) {
          const callback = item.initializer.arguments[0];
          if (callback) return `const ${name} = ${callback.getText(source)};`;
        }
        return `const ${item.getText(source)};`;
      }
      throw new Error(`Missing real implementation: ${name}`);
    })
    .join("\n");
}
function isolated<T>(
  source: string,
  bindings: Record<string, unknown> = {},
  modules: Record<string, unknown> = {},
): T {
  const exports = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, {
    exports,
    Error,
    Date,
    Object,
    Set,
    Map,
    z,
    AbortController,
    AbortSignal,
    Response,
    TextDecoder,
    ...diagnostics,
    ...bindings,
    require: (name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected offline import: ${name}`);
      return modules[name];
    },
  });
  return exports as T;
}

function billing() {
  let dbStatus = "inactive";
  let customer: string | null = "cus_fixture";
  let attempt: string | null = null;
  let subscriptionStatus = "canceled";
  let failPath = "";
  let stickyFailure = false;
  const cachedFailures = new Set<string>();
  let hasMore = false;
  const sessions: Array<{
    id: string;
    url: string;
    mode: string;
    metadata: { user_id: string; checkout_attempt_id: string };
  }> = [];
  const writes: Array<{ path: string; key?: string | undefined }> = [];
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { status: dbStatus, stripe_customer_id: customer },
            error: null,
          }),
        }),
      }),
    }),
  };
  const admin = {
    rpc: async (_name: string, args: Record<string, string>) => {
      if (attempt && attempt !== args["_attempt_id"]) return { data: false, error: null };
      attempt = args["_attempt_id"] ?? null;
      return { data: true, error: null };
    },
    from: () => ({
      upsert: async (row: { stripe_customer_id: string }) => {
        customer = row.stripe_customer_id;
        return { error: null };
      },
    }),
  };
  const stripeRequest = async (
    method: string,
    path: string,
    params: Record<string, string>,
    options?: { idempotencyKey?: string },
  ) => {
    if (method === "POST") writes.push({ path, key: options?.idempotencyKey });
    if (options?.idempotencyKey && cachedFailures.has(options.idempotencyKey))
      throw new Error("cached provider failure");
    if (path === failPath && (!stickyFailure || method === "POST")) {
      if (stickyFailure && options?.idempotencyKey) cachedFailures.add(options.idempotencyKey);
      throw new Error("offline Stripe failure");
    }
    if (path === "/v1/subscriptions")
      return { data: [{ status: subscriptionStatus }], has_more: hasMore };
    if (path === "/v1/customers") return { id: "cus_fixture" };
    if (path === "/v1/checkout/sessions" && method === "GET")
      return { data: sessions, has_more: false };
    if (path === "/v1/checkout/sessions" && method === "POST") {
      const session = {
        id: `cs_${sessions.length}`,
        url: "https://checkout.stripe.com/fixture",
        mode: "subscription",
        metadata: {
          user_id: "owner",
          checkout_attempt_id: params["metadata[checkout_attempt_id]"] ?? "",
        },
      };
      sessions.push(session);
      return session;
    }
    throw new Error(`Unexpected Stripe mock path: ${path}`);
  };
  const { createCheckoutSession } = isolated<{
    createCheckoutSession: (args: unknown) => Promise<{ id: string }>;
  }>(
    `${selected("src/lib/stripe.functions.ts", ["createCheckoutSession"], true)}\nexports.createCheckoutSession = createCheckoutSession;`,
    {},
    {
      "@/lib/stripe.server": {
        getStripeProPriceId: () => "price_server",
        getTrustedAppOrigin: () => "https://example.invalid",
        stripeRequest,
      },
      "@/integrations/supabase/client.server": { supabaseAdmin: admin },
    },
  );
  return {
    writes,
    sessions,
    run: (id = "attempt-a") =>
      createCheckoutSession({
        data: { plan: "pro", checkoutAttemptId: id },
        context: { supabase: db, userId: "owner", claims: {} },
      }),
    status: (value: string) => {
      dbStatus = value;
    },
    remoteStatus: (value: string) => {
      subscriptionStatus = value;
    },
    missingCustomer: () => {
      customer = null;
    },
    fail: (path: string, sticky = false) => {
      failPath = path;
      stickyFailure = sticky;
    },
    pagination: () => {
      hasMore = true;
    },
    expire: () => {
      attempt = null;
    },
  };
}

describe("audit final — actual Checkout handler with Stripe mocks", () => {
  for (const status of ["active", "trialing"])
    test(`${status} DB subscription creates nothing`, async () => {
      const f = billing();
      f.status(status);
      await expect(f.run()).rejects.toThrow("active subscription");
      expect(f.writes).toHaveLength(0);
    });
  test("same attempt reuses its open session", async () => {
    const f = billing();
    expect(await f.run()).toEqual(await f.run());
    expect(f.writes).toHaveLength(1);
  });
  test("concurrent distinct attempts admit only one", async () => {
    const f = billing();
    const replies = await Promise.allSettled([f.run("a"), f.run("b")]);
    expect(replies.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(f.sessions).toHaveLength(1);
  });
  test("existing open session still blocks a different attempt after lease expiry", async () => {
    const f = billing();
    await f.run();
    f.expire();
    await expect(f.run("b")).rejects.toThrow("already in progress");
    expect(f.sessions).toHaveLength(1);
  });
  for (const path of ["/v1/customers", "/v1/checkout/sessions"])
    test(`${path} pre-execution transport failure permits safe same-attempt recovery`, async () => {
      const f = billing();
      f.missingCustomer();
      f.fail(path);
      await expect(f.run()).rejects.toThrow();
      f.fail("");
      await f.run();
      expect(f.sessions).toHaveLength(1);
      const keys = f.writes.filter((item) => item.path === path).map((item) => item.key);
      expect(new Set(keys).size).toBe(1);
    });
  test("failed/delayed webhook cannot hide an active Stripe subscription", async () => {
    const f = billing();
    f.remoteStatus("active");
    await expect(f.run()).rejects.toThrow("active subscription");
    expect(f.writes).toHaveLength(0);
  });
  test("a provider-cached 500 is not falsely treated as a successful retry or rotated to a fresh operation", async () => {
    const f = billing();
    f.fail("/v1/checkout/sessions", true);
    await expect(f.run()).rejects.toThrow("offline Stripe failure");
    f.fail("");
    await expect(f.run()).rejects.toThrow("cached provider failure");
    await expect(f.run("another-attempt")).rejects.toThrow("already in progress");
    expect(f.sessions).toHaveLength(0);
    expect(new Set(f.writes.map((item) => item.key)).size).toBe(1);
  });
  test("incomplete subscription enumeration fails closed", async () => {
    const f = billing();
    f.pagination();
    await expect(f.run()).rejects.toThrow("verify existing");
    expect(f.writes).toHaveLength(0);
  });
  test("later legitimate repurchase uses a new idempotency key", async () => {
    const f = billing();
    await f.run();
    f.sessions.length = 0;
    f.expire();
    await f.run("new-attempt");
    const keys = f.writes
      .filter((item) => item.path === "/v1/checkout/sessions")
      .map((item) => item.key);
    expect(new Set(keys).size).toBe(2);
  });
});

describe("audit final — private diagnostic markers", () => {
  test("related AI/Analyzer/worker adapters never pass raw error fields or bodies to console sinks", () => {
    const violations: string[] = [];
    for (const name of readdirSync("src/lib")) {
      if (
        !name.endsWith(".ts") ||
        name.endsWith(".test.ts") ||
        !/^(ai[-.]|song-analyzer|quality-check|generation-jobs|music-analyzer-admin|inspiration-wall)/.test(
          name,
        )
      )
        continue;
      const source = ts.createSourceFile(
        name,
        readFileSync(`src/lib/${name}`, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.getText(source) === "console"
        ) {
          for (const argument of node.arguments) {
            if (
              /\.(message|stack)\b|\b(body|detail)\.slice\(/.test(argument.getText(source)) ||
              (ts.isIdentifier(argument) &&
                ["err", "error", "usageError", "auditError", "lastError"].includes(argument.text))
            )
              violations.push(
                `${name}:${source.getLineAndCharacterOfPosition(argument.pos).line + 1}`,
              );
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(violations).toEqual([]);
  });
  test("central SSR error capture cannot reconstruct private messages/stacks/causes", () => {
    const logs: unknown[] = [];
    const logger = {
      error: (...args: unknown[]) => {
        logs.push(args);
      },
    };
    const api = isolated<{ describeError: (error: unknown) => string }>(
      readFileSync("src/lib/error-capture.ts", "utf8"),
      { console: logger },
      { "./safe-diagnostics": diagnostics },
    );
    const failure = Object.assign(new Error(marker), {
      stack: marker,
      status: 503,
      cause: { message: marker, body: marker, token: marker, name: marker },
    });
    logger.error("[fixture]", failure);
    expect(api.describeError(failure)).not.toContain(marker);
    expect(JSON.stringify(logs)).not.toContain(marker);
    expect(JSON.stringify(logs)).toContain("503");
  });
  test("shared server-error reporter keeps a correlation ID without raw infrastructure data", () => {
    const logs: unknown[] = [];
    const { report } = isolated<{ report: (scope: string, error: unknown) => string }>(
      `${selected("src/lib/server-error.ts", ["correlationId", "reportServerError"])}\nexports.report=reportServerError;`,
      { crypto, console: { error: (...args: unknown[]) => logs.push(args) } },
    );
    expect(report("fixture", new Error(marker)).length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain(marker);
    expect(JSON.stringify(logs)).toContain("PromptBeats:fixture");
  });
  test("untrusted short names, codes, messages and JSON keys cannot become diagnostic labels", () => {
    const error = Object.assign(new Error(marker), {
      name: marker,
      cause: { name: marker, code: marker },
    });
    const output = JSON.stringify({
      type: diagnostics.safeErrorType(error),
      code: diagnostics.safeProviderCode(marker),
      stop: diagnostics.safeStopReason(marker),
      meta: safeErrorMetadata(error),
      keys: diagnostics.safeDiagnosticKeys({ [marker]: marker, score: marker }),
      path: diagnostics.safeIssuePath([marker, 0, "lyrics"]),
    });
    expect(output).not.toContain(marker);
    expect(output).toContain("lyrics");
    expect(diagnostics.safeProviderCode("overloaded_error")).toBe("overloaded_error");
    expect(safeErrorMetadata(new TypeError(marker))).toEqual({ errorName: "TypeError" });
  });
  test("real provider discovery logs only status, not a body echoing secrets", async () => {
    const logs: unknown[] = [];
    const { run } = isolated<{ run: (provider: string, installed: unknown[]) => Promise<unknown> }>(
      `${selected("src/lib/ai-provider-registry.server.ts", ["discoverProviderModels"])}\nexports.run=discoverProviderModels;`,
      {
        AI_PROVIDER_REGISTRY: [
          {
            id: "fixture",
            secretNames: ["KEY"],
            auth: "bearer",
            discoveryUrl: "https://example.invalid",
          },
        ],
        process: { env: { KEY: marker } },
        providerSecret: () => marker,
        setTimeout: () => 1,
        clearTimeout: () => {},
        fetch: async () => new Response(marker, { status: 500 }),
        console: { error: (...args: unknown[]) => logs.push(args) },
      },
    );
    await expect(run("fixture", [])).rejects.toThrow("HTTP 500");
    expect(JSON.stringify(logs)).not.toContain(marker);
    expect(logs).toHaveLength(1);
  });
  test("real Anthropic HTTP errors cannot log a prompt echoed in type/body/headers", async () => {
    const logs: unknown[] = [];
    const { run } = isolated<{ run: (model: string, input: ModelCall) => Promise<unknown> }>(
      `${selected("src/lib/ai-provider.server.ts", ["safeProviderDiagnosticCode", "callAnthropic"])}\nexports.run=callAnthropic;`,
      {
        process: { env: { ANTHROPIC_API_KEY: marker } },
        providerRequestSignal: () => new AbortController().signal,
        fetch: async () =>
          Response.json(
            { error: { type: marker, message: marker } },
            { status: 400, headers: { "request-id": marker } },
          ),
        console: { error: (...args: unknown[]) => logs.push(args) },
      },
    );
    await expect(run("fixture", { system: marker, prompt: marker })).rejects.toThrow();
    expect(JSON.stringify(logs)).not.toContain(marker);
    expect(logs).toHaveLength(1);
  });
  test("real RunPod cancellation failure omits provider response text", async () => {
    const logs: unknown[] = [];
    const { run } = isolated<{ run: (input: unknown) => Promise<unknown> }>(
      `${selected("src/lib/song-analyzer-enhanced-cancel.functions.ts", ["cancelEnhancedStage0Job"], true)}\nexports.run=cancelEnhancedStage0Job;`,
      {
        requireEnhancedAnalyzerAccess: async () => {},
        assertOwnedAnalyzerKey: () => {},
        deleteTemporaryAudio: async () => {},
        process: { env: { RUNPOD_API_KEY: marker, RUNPOD_MUSIC_ANALYSIS_ENDPOINT_ID: "fixture" } },
        fetch: async () => new Response(marker, { status: 500 }),
        console: { warn: (...args: unknown[]) => logs.push(args) },
      },
    );
    await run({
      data: { audioKey: "analyzer-temp/owner/fixture", jobId: "fixture" },
      context: { userId: "owner" },
    });
    expect(JSON.stringify(logs)).not.toContain(marker);
    expect(logs).toHaveLength(1);
  });
});

describe("audit final — actual background adapter failures and restart", () => {
  for (const provider of ["openai", "gemini"] as const)
    test(`${provider}: retrieve a completed result using GET only`, async () => {
      const methods: string[] = [];
      const payload =
        provider === "openai"
          ? {
              status: "completed",
              output: [
                { type: "message", content: [{ type: "output_text", text: "recovered song" }] },
              ],
              usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
            }
          : {
              status: "completed",
              output_text: "recovered song",
              usage: { total_input_tokens: 10, total_output_tokens: 4, total_tokens: 14 },
            };
      const { run } = isolated<{
        run: (
          provider: string,
          remote: string,
          model: string,
          fetcher: unknown,
        ) => Promise<ModelResult>;
      }>(
        `${selected("src/lib/ai-execution-retrieval.server.ts", ["retrieveBackgroundResult"])}\nexports.run=retrieveBackgroundResult;`,
        {
          usageEvidence,
          process: { env: { OPENAI_API_KEY: marker, GEMINI_API_KEY: marker } },
          fetch: () => {
            throw new Error("Global network forbidden");
          },
        },
      );
      const out = await run(
        provider,
        "resp_fixture",
        "fixture",
        async (_url: string, init: RequestInit) => {
          methods.push(init.method ?? "GET");
          return Response.json(payload);
        },
      );
      expect(out.text).toBe("recovered song");
      expect(out.usage?.totalTokens).toBe(14);
      expect(methods).toEqual(["GET"]);
    });
  for (const failure of ["remote-write", "poll", "deadline"])
    test(`${failure}: one provider create; unresolved restart never creates again`, async () => {
      const requests: string[] = [];
      let remote: string | null = null;
      let ticks = 0;
      const { run } = isolated<{ run: (model: string, input: ModelCall) => Promise<ModelResult> }>(
        `${selected("src/lib/ai-provider.server.ts", ["observeUsage", "callOpenAI"])}\nexports.run=callOpenAI;`,
        {
          usageEvidence,
          process: { env: { OPENAI_API_KEY: marker } },
          openAiOutputBudget: () => 100,
          providerRequestTimeoutMs: () => 1000,
          providerRequestSignal: () => new AbortController().signal,
          Date: { now: () => (failure === "deadline" ? ticks++ * 2000 : 0) },
          setTimeout: (callback: () => void) => {
            callback();
            return 1;
          },
          fetch: async (_url: string, init: RequestInit) => {
            requests.push(init.method ?? "GET");
            return init.method === "POST"
              ? Response.json({ id: "resp_fixture", status: "queued" })
              : new Response("", { status: 503 });
          },
        },
      );
      const deps: ExecutionDependencies = {
        dispatchAdmission: async (execute) => execute(),
        read: async () => null,
        begin: async () => {},
        checkpoint: async () => {},
        record: async () => {},
        write: async (name, args) => {
          if (name === "mark_ai_execution_remote_internal") remote = String(args["_remote_id"]);
          return null;
        },
      };
      const call = trackedCaller(
        (input) => run("gpt-5.6-luna", input),
        "openai",
        "gpt-5.6-luna",
        { userId: "owner", jobId: "job", operation: "generate" },
        deps,
      );
      await expect(
        call({
          system: marker,
          prompt: marker,
          abortSignal: new AbortController().signal,
          onRemoteOperationCreated: async () => {
            if (failure === "remote-write") throw new Error("job remote-ID write lost");
          },
        }),
      ).rejects.toThrow();
      expect(remote).toBe("resp_fixture");
      expect(requests.filter((method) => method === "POST")).toHaveLength(1);
      const restart = trackedCaller(
        async () => {
          throw new Error("must not call");
        },
        "openai",
        "fixture",
        { userId: "owner", jobId: "job", operation: "generate", recoveryOnly: true },
        deps,
      );
      await expect(restart({ system: "", prompt: "" })).rejects.toThrow("redispatch is forbidden");
    });
});

describe("audit final — total encoded generation budget", () => {
  test("actual live schema enforces technical field and nested limits even for admin inputs", () => {
    const { schema } = isolated<{ schema: z.ZodType }>(
      `${selected("src/lib/ai.functions.ts", ["generateInput"])}\nexports.schema=generateInput;`,
      {
        AI_TARGET_PLATFORMS,
        DEFAULT_AI_TARGET_PLATFORM,
        songBlueprintSchema,
        generatorInputSnapshotSchema,
        revisionJobContextSchema,
      },
    );
    const input = { theme: "Theme", genre: "Pop", mood: "Warm", language: "Greek" };
    for (const [field, max] of [
      ["theme", 2000],
      ["genre", 8000],
      ["mood", 1000],
      ["language", 40],
      ["structure", 600],
      ["production", 2000],
      ["instructions", 2000],
    ] as const) {
      expect(schema.safeParse({ ...input, [field]: "a".repeat(max) }).success).toBe(true);
      expect(schema.safeParse({ ...input, [field]: "a".repeat(max + 1) }).success).toBe(false);
    }
    expect(
      schema.safeParse({
        ...input,
        songBlueprint: [
          { structureIndex: 0, sectionType: "Verse", occurrence: 1, instruction: "x".repeat(801) },
        ],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...input,
        inputSnapshot: { generatorMode: "advanced", theme: "x".repeat(32001) },
      }).success,
    ).toBe(false);
  });
  test("actual generation entry rejects a raw-RPC-sized aggregate before selecting a provider", async () => {
    let selections = 0;
    const { run } = isolated<{ run: (input: unknown, user: string, id: null) => Promise<unknown> }>(
      `${selected("src/lib/ai.functions.ts", ["runSongGeneration"])}\nexports.run=runSongGeneration;`,
      {
        assertGenerationRequestBudget,
        activeCaller: async () => {
          selections++;
          throw new Error("unexpected provider selection");
        },
      },
    );
    await expect(
      run({ inputSnapshot: { theme: "α".repeat(MAX_GENERATION_REQUEST_BYTES) } }, "admin", null),
    ).rejects.toThrow("too large");
    expect(selections).toBe(0);
    const worker = readFileSync("src/lib/generation-jobs.server.ts", "utf8");
    expect(worker.indexOf("assertGenerationRequestBudget(job.input_payload)")).toBeLessThan(
      worker.indexOf("durableAiJobInput.parse(job.input_payload)"),
    );
  });
  test("Unicode, escaping and nested aggregate size are counted as JSON UTF-8", () => {
    expect(() =>
      assertGenerationRequestBudget({ nested: { lyrics: "Привет — γεια" } }),
    ).not.toThrow();
    expect(() =>
      assertGenerationRequestBudget({
        nested: { lyrics: "\u0000".repeat(MAX_GENERATION_REQUEST_BYTES / 6) },
      }),
    ).toThrow("too large");
    expect(() =>
      assertGenerationRequestBudget({ nested: Array(100).fill("α".repeat(3000)) }),
    ).toThrow("too large");
  });
});

describe("audit final — playlist and favorite projections", () => {
  type Row = Record<string, unknown>;
  type Reply = { data: Row[]; error: null };
  class Query implements PromiseLike<Reply> {
    private filters: Array<(row: Row) => boolean> = [];
    constructor(private rows: Row[]) {}
    select() {
      return this;
    }
    eq(key: string, value: unknown) {
      this.filters.push((row) => row[key] === value);
      return this;
    }
    in(key: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[key]));
      return this;
    }
    order() {
      return this;
    }
    delete() {
      return this;
    }
    private reply(): Reply {
      return {
        data: this.rows.filter((row) => this.filters.every((matches) => matches(row))),
        error: null,
      };
    }
    async maybeSingle() {
      return { data: this.reply().data[0] ?? null, error: null };
    }
    then<TResult1 = Reply, TResult2 = never>(
      onfulfilled?: ((value: Reply) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve(this.reply()).then(onfulfilled, onrejected);
    }
  }
  function fixture() {
    const tracks: Row[] = [
      { id: "new-locked", user_id: "other", is_published: true, moderation_status: "locked" },
      {
        id: "public",
        user_id: "other",
        is_published: true,
        moderation_status: "active",
        duration_seconds: 10,
        cover_url: "public-cover",
        prompt: marker,
        lyrics: marker,
        prompt_is_public: false,
        lyrics_is_public: false,
      },
      {
        id: "locked",
        user_id: "other",
        is_published: true,
        moderation_status: "locked",
        duration_seconds: 999,
        cover_url: marker,
      },
      {
        id: "unpublished",
        user_id: "other",
        is_published: false,
        moderation_status: "active",
        duration_seconds: 999,
        cover_url: marker,
      },
      {
        id: "own-private",
        user_id: "owner",
        is_published: false,
        moderation_status: "active",
        duration_seconds: 30,
        cover_url: "own-cover",
      },
    ];
    const tables: Record<string, Row[]> = {
      tracks,
      playlists: [{ id: "playlist", user_id: "owner", cover_url: null }],
      playlist_tracks: ["public", "own-private", "locked", "unpublished", "missing"].map(
        (id, index) => ({
          playlist_id: "playlist",
          track_id: id,
          position: index,
          added_at: String(index),
        }),
      ),
      favorites: ["locked", "unpublished", "own-private", "public", "missing"].map((id) => ({
        user_id: "owner",
        track_id: id,
      })),
      public_profiles: [],
    };
    const db = { from: (table: string) => new Query(tables[table] ?? []) };
    const helpers = selected("src/lib/playlists.functions.ts", [
      "TRACK_COLUMNS",
      "loadTracksWithHandles",
      "getOwnedPlaylist",
      "assertPlaylistEligibleTrack",
    ]);
    const handlers = selected(
      "src/lib/playlists.functions.ts",
      [
        "listPlaylists",
        "getPlaylist",
        "listFavoriteTrackIds",
        "listFavoriteTracks",
        "toggleFavorite",
      ],
      true,
    );
    const api = isolated<{
      listPlaylists: (args: unknown) => Promise<{ playlists: Row[] }>;
      getPlaylist: (args: unknown) => Promise<{ tracks: Row[] }>;
      listFavoriteTrackIds: (args: unknown) => Promise<{ trackIds: string[] }>;
      listFavoriteTracks: (args: unknown) => Promise<{ tracks: Row[] }>;
      toggleFavorite: (args: unknown) => Promise<{ favorite: boolean }>;
      eligible: (db: unknown, user: string, id: string) => Promise<unknown>;
    }>(
      `${helpers}\n${handlers}\nObject.assign(exports,{listPlaylists,getPlaylist,listFavoriteTrackIds,listFavoriteTracks,toggleFavorite,eligible:assertPlaylistEligibleTrack});`,
      { requireFeatureAccess: async () => {} },
      { "@/integrations/supabase/client.server": { supabaseAdmin: db } },
    );
    return {
      api,
      db,
      args: { context: { supabase: db, userId: "owner" }, data: { playlistId: "playlist" } },
    };
  }
  test("counts, durations and automatic covers use the same visible subset as tracks", async () => {
    const f = fixture();
    const result = await f.api.listPlaylists(f.args);
    expect(result.playlists[0]).toMatchObject({
      track_count: 2,
      duration_seconds: 40,
      artwork: "own-cover",
    });
    expect(JSON.stringify(result)).not.toContain(marker);
    const detail = await f.api.getPlaylist(f.args);
    expect(detail.tracks.map((row) => row["id"])).toEqual(["public", "own-private"]);
    expect(detail.tracks[0]).toMatchObject({ prompt: "", lyrics: "" });
  });
  test("favorite IDs and hydrated tracks exclude locked and third-party unpublished rows", async () => {
    const f = fixture();
    const ids = await f.api.listFavoriteTrackIds(f.args);
    const details = await f.api.listFavoriteTracks(f.args);
    expect(ids.trackIds).toEqual(["own-private", "public"]);
    expect(details.tracks.map((row) => row["id"])).toEqual(ids.trackIds);
    expect(JSON.stringify(details)).not.toContain(marker);
  });
  test("other users cannot read an owner's playlist or admit a locked track", async () => {
    const f = fixture();
    await expect(
      f.api.getPlaylist({ ...f.args, context: { supabase: f.db, userId: "stranger" } }),
    ).rejects.toThrow("Playlist not found");
    await expect(f.api.eligible(f.db, "owner", "locked")).rejects.toThrow("unavailable");
    await expect(f.api.eligible(f.db, "owner", "unpublished")).rejects.toThrow("unavailable");
  });
  test("adding a moderated favorite is denied but removing an existing one remains possible", async () => {
    const f = fixture();
    await expect(
      f.api.toggleFavorite({ ...f.args, data: { trackId: "new-locked" } }),
    ).rejects.toThrow("unavailable");
    expect(await f.api.toggleFavorite({ ...f.args, data: { trackId: "locked" } })).toEqual({
      favorite: false,
    });
  });
});
