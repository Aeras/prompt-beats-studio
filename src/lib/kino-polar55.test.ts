import { describe, expect, test } from "bun:test";
import { readPolar55 } from "./kino-polar55.server";
import { polarRequest, polarAnalysis } from "./kino-polar55.shared";
import { labBacktest, labPick, labRandomPick, labStats } from "./kino-lab.shared";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { spawn } from "node:child_process";

const request = {
  op: "analysis" as const,
  n: 1000 as const,
  method: "P01" as const,
  k: 8 as const,
  seed: "kino-lab-v1-retrospective",
};
const env = {
  KINO_POLAR55_ENABLED: "true",
  KINO_POLAR55_READ_TOKEN: "synthetic-not-a-live-token".repeat(3),
};
const status = {
  version: 1,
  source: "polar55",
  stored: 11,
  lastObserved: null,
  coverage: "COMPLETENESS_UNVERIFIED",
  backfill: "DISABLED",
};
describe("Polar55 read-only proxy", () => {
  test("default off never dispatches; strict bounded request contract", async () => {
    let calls = 0;
    expect(
      await readPolar55("owner", request, {
        env: {},
        fetch: async () => {
          calls++;
          throw Error("unexpected");
        },
      }),
    ).toEqual({ status: "not_configured" });
    expect(calls).toBe(0);
    for (const n of [-1, 0, 5001, 100001, "1000", "1 OR 1=1"])
      expect(polarRequest.safeParse({ ...request, n }).success).toBe(false);
    expect(polarRequest.safeParse({ ...request, url: "https://attacker.test" }).success).toBe(
      false,
    );
  });
  test("fixed destination, owner pseudonym, no browser cookie, redirects or credential exposure", async () => {
    const result = await readPolar55(
      "owner-id",
      { op: "status" },
      {
        env,
        fetch: async (url, init) => {
          expect(url).toBe("https://kino-api.promptbeats.app/lab-v1.php");
          expect(init?.redirect).toBe("error");
          expect(init?.credentials).toBe("omit");
          const headers = new Headers(init?.headers);
          expect(headers.get("Authorization")).toBe(`Bearer ${env.KINO_POLAR55_READ_TOKEN}`);
          expect(headers.get("X-Kino-Owner")).toMatch(/^[a-f0-9]{64}$/);
          expect(headers.get("Cookie")).toBeNull();
          return Response.json(status);
        },
      },
    );
    expect(result).toEqual({ status: "ok", info: status });
    expect(JSON.stringify(result)).not.toContain(env.KINO_POLAR55_READ_TOKEN);
  });
  test("transport, quota, malformed, huge and unknown outcomes have no retry/raw echo", async () => {
    for (const response of [
      new Response("private sentinel", { status: 403 }),
      new Response("private sentinel", { status: 429 }),
      Response.json({ private: "sentinel" }),
      new Response("x".repeat(300001), { headers: { "Content-Type": "application/json" } }),
    ]) {
      let calls = 0;
      const result = await readPolar55("owner", request, {
        env,
        fetch: async () => {
          calls++;
          return response;
        },
      });
      expect(result).toEqual({ status: "unavailable" });
      expect(calls).toBe(1);
    }
  });
});
test("actual server function verifies fresh account and role on each operation", async () => {
  const source = readFileSync(new URL("./kino-polar55.functions.ts", import.meta.url), "utf8");
  let handler: (v: unknown) => Promise<unknown> = async () => undefined;
  const marker = Symbol("auth");
  let middleware: unknown;
  const chain = {
    middleware: (v: unknown) => {
      middleware = v;
      return chain;
    },
    inputValidator: () => chain,
    handler: (v: typeof handler) => {
      handler = v;
      return v;
    },
  };
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    {
      exports: module.exports,
      require: (name: string) =>
        name.includes("react-start")
          ? { createServerFn: () => chain }
          : name.includes("auth-middleware")
            ? { requireSupabaseAuth: marker }
            : name.includes("shared")
              ? { polarRequest }
              : { readPolar55: async () => ({ status: "ok" }) },
    },
  );
  expect(middleware).toEqual([marker]);
  for (const account of [
    null,
    { status: "active" },
    { status: "blocked", is_banned: false },
    { status: "active", is_banned: true },
  ])
    await expect(
      handler({
        data: request,
        context: { supabase: { rpc: async () => ({ data: account, error: null }) } },
      }),
    ).rejects.toThrow("Not allowed");
  await expect(
    handler({
      data: request,
      context: {
        supabase: {
          rpc: async (name: string) => ({
            data: name === "get_my_account_status" ? { status: "active", is_banned: false } : false,
            error: null,
          }),
        },
      },
    }),
  ).rejects.toThrow("Not allowed");
  const rpcNames: string[] = [];
  const context = {
    userId: "owner",
    supabase: {
      rpc: async (name: string) => {
        rpcNames.push(name);
        return {
          data: name === "get_my_account_status" ? { status: "active", is_banned: false } : true,
          error: null,
        };
      },
    },
  };
  expect(await handler({ data: request, context })).toEqual({ status: "ok" });
  expect(rpcNames).toEqual([
    "get_my_account_status",
    "current_user_is_super_admin",
    "get_my_account_status",
    "current_user_is_super_admin",
  ]);
  let checks = 0;
  await expect(
    handler({
      data: request,
      context: {
        userId: "owner",
        supabase: {
          rpc: async (name: string) => {
            checks++;
            return {
              data:
                name === "get_my_account_status"
                  ? { status: "active", is_banned: checks > 2 }
                  : true,
              error: null,
            };
          },
        },
      },
    }),
  ).rejects.toThrow("Not allowed");
});

// Explicit local/CI Docker acceptance: no external source or production DB.
test.skipIf(process.env["KINO_POLAR55_DOCKER_TEST"] !== "1")(
  "PHP streaming parity for all canonical windows and frozen methods",
  async () => {
    const all = Array.from({ length: 100000 }, (_, i) => ({
      id: i + 1,
      time: 1793491200000 + Math.floor((i + 2) / 2) * 300000,
      numbers: labRandomPick(20, `fixture-${i + 1}`),
    }));
    for (const n of [1000, 5000, 20000, 50000, 100000]) {
      const draws = all.slice(0, n);
      const chunks: Array<ReturnType<typeof labStats>> = [];
      for (let start = 0; start < n; start += 5000)
        chunks.push(labStats(draws.slice(start, start + 5000)));
      const counts = Array.from({ length: 80 }, (_, i) =>
        chunks.reduce((sum, c) => sum + c.counts[i]!, 0),
      );
      for (const method of ["P00", "F00", "P01"] as const) {
        const args = [
          "run",
          "--rm",
          "-i",
          "--network",
          "none",
          "--memory",
          "128m",
          "--cpus",
          "1",
          "--mount",
          `type=bind,source=${process.cwd()}/tools/kino-polar55,target=/src,readonly`,
          "php:8.3-cli@sha256:600bce7c7acf524756e5aac989f4a763aed709960d7326970bb670f46efee53a",
          "php",
          "-d",
          "memory_limit=64M",
          "/src/tests/core-offline.php",
          "generated",
        ];
        const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
        child.stdin.end(JSON.stringify({ n, method, k: 8, seed: request.seed }));
        let text = "",
          errors = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
          text += chunk;
        });
        child.stderr.on("data", (chunk) => {
          errors += chunk;
        });
        const code = await new Promise<number | null>((resolve, reject) => {
          child.on("error", reject);
          child.on("close", resolve);
        });
        expect(code, errors).toBe(0);
        const actual = JSON.parse(text);
        expect(
          polarAnalysis.safeParse({
            version: 1,
            source: "polar55",
            requested: n,
            loaded: n,
            stored: n,
            cutoff: n,
            lastObserved: null,
            snapshotAt: "2026-11-04T12:00:00Z",
            sha256: "a".repeat(64),
            rejected: 0,
            coverage: "COMPLETENESS_UNVERIFIED",
            partial: false,
            backfill: "DISABLED",
            options: { ...request, n, method },
            result: actual,
          }).success,
        ).toBe(true);
        expect(actual.stats.n).toBe(n);
        expect(actual.stats.counts).toEqual(counts);
        const tailStats = labStats(draws.slice(-Math.min(n, 5000)));
        expect(tailStats.gaps.every((v) => v !== null)).toBe(true);
        expect(actual.stats.gaps).toEqual(tailStats.gaps);
        if (n <= 5000) expect(actual.stats).toEqual(labStats(draws));
        const expected = labBacktest(draws.slice(0, Math.min(n, 5000)), {
          method,
          k: 8,
          warmup: 30,
          maxTargets: 500,
          seed: request.seed,
        });
        expect(actual.backtest.results).toEqual(expected.results);
        const rank = counts
          .map((v, i) => ({ v, n: i + 1 }))
          .sort((a, b) => b.v - a.v || a.n - b.n)
          .slice(0, 8)
          .map((v) => v.n)
          .sort((a, b) => a - b);
        expect(actual.proposal).toEqual(
          method === "P00"
            ? labRandomPick(8, request.seed)
            : method === "P01"
              ? labPick(8, "P01", draws.slice(-100), request.seed)
              : rank,
        );
      }
    }
  },
  60000,
);
