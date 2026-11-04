import { expect, test } from "bun:test";
import { readPolar55, type Polar55Diagnostic } from "./kino-polar55.server";
import { makePolar55Fixture } from "./__fixtures__/kino-polar55-analysis";

const env = {
  KINO_POLAR55_ENABLED: "true",
  KINO_POLAR55_READ_TOKEN: "offline_private_marker_".repeat(3),
};
const options = {
  op: "analysis" as const,
  n: 1000 as const,
  k: 8 as const,
  method: "P01" as const,
  seed: "kino-lab-v1-retrospective",
};

test("Polar55 uses native-compatible fetch receiver and manual redirects", async () => {
  let count = 0;
  const result = await readPolar55("private-owner-marker", options, {
    env,
    fetch: async function (this: unknown, url, init) {
      expect(this).toBeUndefined();
      expect(url).toBe("https://kino-api.promptbeats.app/lab-v1.php");
      expect(init?.redirect).toBe("manual");
      expect(init?.credentials).toBe("omit");
      expect(init?.cache).toBe("no-store");
      count++;
      return Response.json(makePolar55Fixture(11));
    },
  });
  expect(result.status).toBe("ok");
  expect(count).toBe(1);
});

test("Polar55 configuration diagnostics expose no environment values and never dispatch", async () => {
  for (const [config, reason] of [
    [{ ...env, KINO_POLAR55_ENABLED: undefined }, "disabled"],
    [{ ...env, KINO_POLAR55_READ_TOKEN: undefined }, "missing_token"],
    [{ ...env, KINO_POLAR55_READ_TOKEN: "sensitive-invalid-marker" }, "invalid_token"],
  ] as const) {
    const diagnostics: Polar55Diagnostic[] = [];
    let calls = 0;
    expect(
      await readPolar55("private-owner-marker", options, {
        env: config,
        report: (value) => diagnostics.push(value),
        fetch: async () => {
          calls++;
          throw Error("must not dispatch");
        },
      }),
    ).toEqual({ status: "not_configured" });
    expect(calls).toBe(0);
    expect(diagnostics).toEqual([{ stage: "configuration", reason }]);
  }
});

test("Polar55 failure stages are precise, private, and never retry or weaken validation", async () => {
  const mismatch = makePolar55Fixture(11);
  mismatch.options.seed = "different-seed";
  const cases: [() => Promise<Response>, Polar55Diagnostic][] = [
    [
      async () => {
        throw Error("sensitive-raw-error " + env.KINO_POLAR55_READ_TOKEN);
      },
      { stage: "transport", reason: "fetch_failed" },
    ],
    ...[301, 302, 303, 307, 308, 401, 403, 429, 500].map(
      (status): [() => Promise<Response>, Polar55Diagnostic] => [
        async () =>
          new Response("sensitive-raw-body", {
            status,
            headers: { Location: "https://attacker.invalid/sensitive-raw-location" },
          }),
        {
          stage: "http",
          reason: status < 400 ? "redirect_rejected" : "http_error",
          httpStatus: status,
        },
      ],
    ),
    [
      async () => new Response("sensitive-raw-body"),
      { stage: "headers", reason: "invalid_content_type", httpStatus: 200 },
    ],
    [
      async () =>
        new Response(null, { status: 204, headers: { "Content-Type": "application/json" } }),
      { stage: "body", reason: "missing_body", httpStatus: 204 },
    ],
    [
      async () =>
        new Response("x".repeat(300001), { headers: { "Content-Type": "application/json" } }),
      { stage: "body", reason: "body_limit", httpStatus: 200 },
    ],
    [
      async () =>
        new Response(new Uint8Array([255]), { headers: { "Content-Type": "application/json" } }),
      { stage: "decode", reason: "invalid_utf8", httpStatus: 200 },
    ],
    [
      async () =>
        new Response("{sensitive-raw-json", { headers: { "Content-Type": "application/json" } }),
      { stage: "json", reason: "invalid_json", httpStatus: 200 },
    ],
    [
      async () => Response.json({ private: "sensitive-raw-schema" }),
      { stage: "schema", reason: "invalid_schema", httpStatus: 200 },
    ],
    [
      async () => Response.json(mismatch),
      { stage: "binding", reason: "request_mismatch", httpStatus: 200 },
    ],
  ];
  for (const [fetcher, expected] of cases) {
    const diagnostics: Polar55Diagnostic[] = [];
    let calls = 0;
    const result = await readPolar55("private-owner-marker", options, {
      env,
      report: (value) => diagnostics.push(value),
      fetch: async () => {
        calls++;
        return fetcher();
      },
    });
    expect(result).toEqual({ status: "unavailable" });
    expect(calls).toBe(1);
    expect(diagnostics).toEqual([expected]);
    const text = JSON.stringify({ result, diagnostics });
    for (const secret of [
      env.KINO_POLAR55_READ_TOKEN,
      "sensitive-raw",
      "private-owner-marker",
      "attacker.invalid",
    ])
      expect(text).not.toContain(secret);
  }
});

test("Polar55 diagnostic sink failure cannot mask a transport failure", async () => {
  expect(
    await readPolar55("private-owner-marker", options, {
      env,
      report: () => {
        throw Error("private logging failure");
      },
      fetch: async () => {
        throw Error("private fetch failure");
      },
    }),
  ).toEqual({ status: "unavailable" });
});
