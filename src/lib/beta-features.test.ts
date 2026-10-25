import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as shared from "./beta-features.shared";
import { betaRpc } from "./beta-rpc.server";
import { BETA_FEATURES, type BetaFeatureDefinition } from "./beta-feature-registry";
import {
  checkBetaRegistrations,
  assertNoUnknownFeatureGates,
  legacyFeatureKeys,
  sqlWithoutComments,
} from "./beta-registration-check";

const migration = "supabase/migrations/20261025132859_beta_feature_lifecycle.sql";
const feature: BetaFeatureDefinition = {
  key: "new_studio",
  name: "New studio",
  description: "A user's studio",
  registrationMigration: "supabase/migrations/20261025140000_new_studio.sql",
  entrypoints: [
    { path: "src/lib/studio.functions.ts", kind: "server" },
    { path: "src/routes/studio.tsx", kind: "client" },
  ],
};
const files: Record<string, string> = {
  [feature.registrationMigration]:
    "SELECT public.register_beta_feature('new_studio','New studio','A user''s studio');",
  "src/lib/studio.functions.ts": "await requireFeatureAccess(context.supabase, 'new_studio');",
  "src/routes/studio.tsx": '<BetaFeatureGate featureKey="new_studio">content</BetaFeatureGate>',
};
describe("explicit Beta registration contract", () => {
  test("empty registry does not invent a production feature or move legacy 19", () => {
    const legacy = legacyFeatureKeys(readFileSync("src/lib/feature-access.functions.ts", "utf8"));
    expect(legacy).toHaveLength(19);
    const registered: readonly BetaFeatureDefinition[] = BETA_FEATURES;
    expect(registered.every((feature) => !legacy.includes(feature.key))).toBe(true);
    expect(sqlWithoutComments(readFileSync(migration, "utf8"))).not.toMatch(
      /SELECT\s+public\.register_beta_feature/,
    );
  });
  test("real SQL registration and awaited server plus client gates", () => {
    expect(() => checkBetaRegistrations([feature], [], (path) => files[path]!)).not.toThrow();
  });
  for (const [label, path, replacement] of [
    [
      "commented registration",
      feature.registrationMigration,
      "-- " + files[feature.registrationMigration],
    ],
    [
      "fake metadata",
      feature.registrationMigration,
      "SELECT public.register_beta_feature('new_studio','Wrong','Description');",
    ],
    [
      "commented server gate",
      "src/lib/studio.functions.ts",
      "// " + files["src/lib/studio.functions.ts"],
    ],
    [
      "unawaited server gate",
      "src/lib/studio.functions.ts",
      "requireFeatureAccess(context.supabase,'new_studio');",
    ],
    ["wrong client key", "src/routes/studio.tsx", "useFeatureAccess('wrong');"],
  ])
    test(`rejects ${label}`, () => {
      expect(() =>
        checkBetaRegistrations([feature], [], (name) =>
          name === path ? replacement! : files[name]!,
        ),
      ).toThrow();
    });
  test("rejects duplicates, legacy backfill and client-only admission", () => {
    expect(() => checkBetaRegistrations([feature, feature], [], (path) => files[path]!)).toThrow();
    expect(() =>
      checkBetaRegistrations([feature], [feature.key], (path) => files[path]!),
    ).toThrow();
    expect(() =>
      checkBetaRegistrations(
        [{ ...feature, entrypoints: [feature.entrypoints[1]!] }],
        [],
        (path) => files[path]!,
      ),
    ).toThrow();
  });
  test("SQL admission must reference the matching key outside comments", () => {
    const def = {
      ...feature,
      entrypoints: [{ path: "supabase/tests/fixture.sql", kind: "sql" as const }],
    };
    expect(() =>
      checkBetaRegistrations([def], [], (path) =>
        path.endsWith("fixture.sql")
          ? "IF NOT public.current_user_can_use_feature('new_studio') THEN RAISE EXCEPTION 'denied'; END IF;"
          : files[path]!,
      ),
    ).not.toThrow();
    expect(() =>
      checkBetaRegistrations([def], [], (path) =>
        path.endsWith("fixture.sql")
          ? "-- public.current_user_can_use_feature('new_studio')"
          : files[path]!,
      ),
    ).toThrow();
  });
  test("unknown literal server/client keys fail; known legacy keys remain valid", () => {
    expect(() =>
      assertNoUnknownFeatureGates("await requireFeatureAccess(client,'unknown');", "entry.ts", [
        "favorites",
      ]),
    ).toThrow();
    expect(() =>
      assertNoUnknownFeatureGates("useFeatureAccess('favorites');", "entry.tsx", ["favorites"]),
    ).not.toThrow();
  });
});

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
  const compiled = ts.transpileModule(readFileSync("src/lib/beta-features.functions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === "zod") return { z };
      if (name === "@/lib/beta-features.shared") return shared;
      if (name === "@/lib/beta-rpc.server") return { betaRpc };
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
const userId = "bb000000-0000-4000-8000-000000000001";
describe("Beta authenticated server boundaries", () => {
  test("all four endpoints use the existing authenticated caller, no service role", () => {
    const { handlers } = fixture({ data: null, error: null });
    expect(Object.keys(handlers)).toHaveLength(4);
    for (const handler of Object.values(handlers)) expect(handler.authenticated).toBe(true);
  });
  test("independent entitlement forwards only validated booleans and user identity", async () => {
    const f = fixture({ data: { enabled: true }, error: null });
    expect(
      await f.handlers["setBetaTester"]!({
        data: { userId, enabled: true, expectedEnabled: false, role: "super_admin" },
        context: f.context,
      }),
    ).toEqual({ enabled: true });
    expect(f.calls).toEqual([
      {
        name: "beta_tester_set",
        args: { _user_id: userId, _enabled: true, _expected_enabled: false },
      },
    ]);
  });
  test("invalid keys/revisions/entitlement fail before SQL", async () => {
    const f = fixture({ data: null, error: null });
    for (const data of [
      { featureKey: "../unsafe", action: "stable", expectedRevision: 0 },
      { featureKey: "safe", action: "stable", expectedRevision: -1 },
      { featureKey: "safe", action: "delete", expectedRevision: 0 },
    ]) {
      await expect(
        f.handlers["transitionBetaFeature"]!({ data, context: f.context }),
      ).rejects.toThrow();
    }
    await expect(
      f.handlers["setBetaTester"]!({
        data: { userId, enabled: "true", expectedEnabled: false },
        context: f.context,
      }),
    ).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });
  test("database errors are redacted, conflicts remain actionable", async () => {
    for (const code of ["PT409", "42501", "P0001"]) {
      const f = fixture({ data: null, error: { code, message: "synthetic-private-token" } });
      await expect(f.handlers["listBetaFeatures"]!({ context: f.context })).rejects.toThrow(
        code === "PT409" ? shared.BETA_CONFLICT : "Beta settings could not be updated",
      );
    }
  });
  test("malformed database responses cannot become an allow result", async () => {
    const f = fixture({ data: { enabled: "yes" }, error: null });
    await expect(
      f.handlers["getBetaTester"]!({ data: { userId }, context: f.context }),
    ).rejects.toThrow();
  });
});

test("managed feature cache fails closed on errors and stays isolated by account", () => {
  const exports: { useFeatureAccess?: (key: string) => { allowed: boolean } } = {};
  const options: { current?: Record<string, unknown> } = {};
  const response = { data: { allowed: true }, isError: false, isLoading: false, refetch: () => {} };
  let user: { id: string } | null = { id: userId };
  runInNewContext(
    ts.transpileModule(readFileSync("src/hooks/useFeatureAccess.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      require(name: string) {
        if (name === "@tanstack/react-query")
          return {
            useQuery: (value: Record<string, unknown>) => {
              options.current = value;
              return response;
            },
          };
        if (name === "@/hooks/useAuth") return { useAuth: () => ({ user, loading: false }) };
        if (name === "@/lib/feature-access.functions") return { getMyFeatureAccess: () => {} };
        if (name === "@/lib/beta-feature-registry")
          return { isBetaFeatureKey: (key: string) => key === "new_studio" };
        throw new Error(name);
      },
    },
  );
  expect(exports.useFeatureAccess!("new_studio").allowed).toBe(true);
  expect(options.current?.["staleTime"]).toBe(0);
  expect(options.current?.["refetchInterval"]).toBe(15000);
  expect(options.current?.["queryKey"]).toEqual(["feature-access", "new_studio", userId]);
  response.isError = true;
  expect(exports.useFeatureAccess!("new_studio").allowed).toBe(false);
  response.isError = false;
  response.data.allowed = false;
  expect(exports.useFeatureAccess!("new_studio").allowed).toBe(false);
  user = null;
  response.data.allowed = true;
  expect(exports.useFeatureAccess!("new_studio").allowed).toBe(false);
  expect(options.current?.["enabled"]).toBe(false);
  expect(options.current?.["queryKey"]).toEqual(["feature-access", "new_studio", "anon"]);
  exports.useFeatureAccess!("favorites");
  expect(options.current?.["staleTime"]).toBe(30000);
  expect(options.current?.["refetchInterval"]).toBe(false);
});
