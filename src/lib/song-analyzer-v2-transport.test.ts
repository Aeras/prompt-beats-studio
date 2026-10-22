import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { runSingleCallAnalyzerV2, safeErrorMetadata } from "./song-analyzer-v2.server";

const KEY = "sk-or-OFFLINE_SECRET_KEY_123";
const AUDIO = Buffer.from("PRIVATE_AUDIO_BYTES").toString("base64");
const evidence = {
  version: 1,
  available: true,
  engine: { name: "essentia", engineVersion: "test", algorithms: [] },
  processing: { durationSeconds: 10 },
  tempo: null,
  rhythm: null,
  energy: null,
  tonal: null,
  spectral: null,
  sectionChangeCandidates: [],
  limitations: [],
} as any;

function setup(fetcher: typeof fetch) {
  let started = 0;
  let calls = 0;
  const inits: RequestInit[] = [];
  const usage: boolean[] = [];
  const args = {
    model: {
      id: "openai/gpt-audio",
      label: "x",
      provider: "openrouter" as const,
      acceptedMimeTypes: ["audio/mpeg"],
    },
    apiKey: KEY,
    audioBase64: AUDIO,
    mimeType: "audio/mpeg",
    stage0Evidence: evidence,
    schema: {},
    validator: z.any() as any,
    markProviderStarted: async () => {
      started++;
    },
    recordUsage: async (_u: unknown, ok: boolean) => {
      usage.push(ok);
    },
    fetcher: (async (url: any, init: any) => {
      calls++;
      inits.push(init);
      return fetcher(url, init);
    }) as typeof fetch,
  };
  return { args, started: () => started, calls: () => calls, inits, usage };
}

async function failure(f: ReturnType<typeof setup>) {
  try {
    await runSingleCallAnalyzerV2(f.args as any);
  } catch (e) {
    return e as Error & { code: string; diagnostics?: Record<string, unknown> };
  }
  throw new Error("expected failure");
}

function assertSafe(e: Error, f: ReturnType<typeof setup>) {
  expect(e.message).not.toContain(KEY);
  expect(e.message).not.toContain(AUDIO);
  expect(e.message.toLowerCase()).not.toContain("private");
  expect(JSON.stringify((e as any).diagnostics)).not.toContain(KEY);
  expect(f.calls()).toBe(1);
  expect(f.started()).toBe(1);
  expect(f.usage).toEqual([false]);
}

describe("Analyzer V2 transport diagnostics", () => {
  test("uses Worker-compatible redirect mode (not 'error')", async () => {
    const f = setup(async () => new Response("{}", { status: 500 }));
    await failure(f);
    expect(f.inits[0]!.redirect).toBe("manual");
    const src = readFileSync("src/lib/song-analyzer-v2.server.ts", "utf8");
    expect(src).not.toMatch(/redirect:\s*"error"/);
  });

  test("Worker-style rejection of redirect:'error' -> TRANSPORT_FAILED with safe metadata", async () => {
    const f = setup(async () => {
      throw new TypeError(`Invalid redirect value, must be one of "follow" or "manual" ${KEY}`);
    });
    const e = await failure(f);
    expect(e.code).toBe("TRANSPORT_FAILED");
    expect(e.diagnostics).toMatchObject({
      provider: "openrouter",
      model: "openai/gpt-audio",
      errorName: "TypeError",
    });
    expect(e.diagnostics!.requestBytes as number).toBeGreaterThan(AUDIO.length);
    expect(typeof e.diagnostics!.elapsedMs).toBe("number");
    expect(e.message).toContain("error=TypeError");
    expect(e.message).not.toContain("Invalid redirect");
    assertSafe(e, f);
  });

  test("network rejection with cause code is surfaced by name/code only", async () => {
    const f = setup(async () => {
      throw new TypeError("fetch failed PRIVATE", {
        cause: Object.assign(new Error(`connect ${KEY}`), { code: "ECONNRESET" }),
      });
    });
    const e = await failure(f);
    expect(e.code).toBe("TRANSPORT_FAILED");
    expect(e.diagnostics).toMatchObject({ causeName: "Error", causeCode: "ECONNRESET" });
    assertSafe(e, f);
  });

  test("timeout -> TIMEOUT", async () => {
    const f = setup(async () => {
      throw new DOMException("PRIVATE", "TimeoutError");
    });
    const e = await failure(f);
    expect(e.code).toBe("TIMEOUT");
    assertSafe(e, f);
  });

  test("3xx / opaque redirect is rejected, never followed", async () => {
    for (const status of [0, 302, 307]) {
      const f = setup(async () =>
        status === 0
          ? ({ status: 0, ok: false, json: async () => null } as unknown as Response)
          : new Response(null, { status, headers: { location: "https://evil.example" } }),
      );
      const e = await failure(f);
      expect(e.code).toBe("PROVIDER_REDIRECT_REJECTED");
      assertSafe(e, f);
    }
  });

  test("HTTP errors are classified with status diagnostics and no provider text", async () => {
    const cases: Array<[number, unknown, string]> = [
      [401, { error: { message: "PRIVATE bad key" } }, "PROVIDER_AUTH_REJECTED"],
      [402, {}, "PROVIDER_CREDIT_REQUIRED"],
      [429, {}, "PROVIDER_RATE_LIMIT"],
      [400, { error: { message: "PRIVATE detail" } }, "PROVIDER_CONTRACT_REJECTED"],
      [404, {}, "PROVIDER_HTTP_FAILED"],
      [503, {}, "PROVIDER_HTTP_FAILED"],
    ];
    for (const [status, body, code] of cases) {
      const f = setup(async () => new Response(JSON.stringify(body), { status }));
      const e = await failure(f);
      expect(e.code).toBe(code);
      expect(e.diagnostics!.httpStatus).toBe(status);
      assertSafe(e, f);
    }
  });

  test("message fits the durable 500-char error column with diagnostics intact", async () => {
    const f = setup(async () => {
      throw new TypeError("x");
    });
    const e = await failure(f);
    expect(e.message.length).toBeLessThan(500);
  });

  test("safeErrorMetadata drops unsafe names/codes", () => {
    expect(
      safeErrorMetadata({ name: "bad name <script>", cause: { code: "lower-case sk-key" } }),
    ).toEqual({});
  });
});
