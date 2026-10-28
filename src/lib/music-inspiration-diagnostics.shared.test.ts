import { expect, test, spyOn } from "bun:test";
import { z } from "zod";
import {
  InspirationFailure,
  inspirationDiagnostic,
  encodeInspirationDiagnostic,
  decodeInspirationDiagnostic,
  logInspirationFailure,
} from "./music-inspiration-diagnostics.shared";
import {
  searchInspirationWeb,
  synthesizeMusicInspiration,
} from "./music-inspiration-research.server";
const signal = () => new AbortController().signal;
async function capture(action: () => Promise<unknown>) {
  try {
    await action();
    throw Error("Expected failure");
  } catch (e) {
    expect(e).toBeInstanceOf(InspirationFailure);
    return (e as InspirationFailure).diagnostic;
  }
}
test("diagnostic encoding is bounded and rejects arbitrary text/fields", () => {
  const d = { stage: "search_response", code: "http", httpStatus: 401 } as const;
  expect(decodeInspirationDiagnostic(encodeInspirationDiagnostic(d))).toEqual(d);
  expect(encodeInspirationDiagnostic(d).length).toBeLessThan(160);
  for (const raw of [
    "SECRET prompt",
    "mi1|search_response|http|NaN||",
    "mi1|admission|database||SECRET_CREDENTIAL|",
    "mi1|ai_schema|invalid_schema|||raw-user-email",
    "mi1|search_response|http|401|||extra",
  ])
    expect(decodeInspirationDiagnostic(raw)).toBeNull();
});
test("messages, body, stack, cause and schema values never enter safe diagnostics/logs", () => {
  const secret = "SYNTHETIC_PRIVATE_TOKEN_PROMPT";
  const error = Object.assign(new Error(secret), { cause: secret, body: secret, code: secret });
  const log = spyOn(console, "warn").mockImplementation(() => {});
  try {
    const d = inspirationDiagnostic(error, "search_request");
    logInspirationFailure("c4600000-0000-4000-8000-000000000001", d);
    const out = JSON.stringify(log.mock.calls);
    expect(out).not.toContain(secret);
    expect(out).not.toContain("stack");
    expect(out).toContain("search_request");
    const schema = z.object({ results: z.array(z.string()) }).safeParse({ results: secret });
    if (schema.success) throw Error("fixture");
    expect(inspirationDiagnostic(schema.error, "search_schema")).toEqual({
      stage: "search_schema",
      code: "invalid_schema",
      field: "results",
    });
    expect(inspirationDiagnostic({ code: "PGRST202", message: secret }, "admission")).toEqual({
      stage: "admission",
      code: "database",
      dbCode: "PGRST202",
    });
  } finally {
    log.mockRestore();
  }
});
for (const status of [400, 401, 422, 429, 432, 433, 434, 500])
  test("Tavily HTTP " + status + " is recorded without body or retry", async () => {
    let calls = 0;
    const d = await capture(() =>
      searchInspirationWeb(
        "private query",
        signal(),
        async () => {
          calls++;
          return new Response("SYNTHETIC_SECRET_BODY", { status });
        },
        "offline",
      ),
    );
    expect(d).toEqual({ stage: "search_response", code: "http", httpStatus: status });
    expect(calls).toBe(1);
    expect(JSON.stringify(d)).not.toContain("SECRET");
  });
test("Tavily configuration, transport, timeout, JSON and schema are distinguished", async () => {
  expect(
    await capture(() =>
      searchInspirationWeb(
        "q",
        signal(),
        async () => {
          throw Error("must not dispatch");
        },
        "",
      ),
    ),
  ).toMatchObject({ stage: "search_request", code: "configuration" });
  expect(
    await capture(() =>
      searchInspirationWeb(
        "q",
        signal(),
        async () => {
          throw new TypeError("SECRET");
        },
        "offline",
      ),
    ),
  ).toMatchObject({ code: "network" });
  expect(
    await capture(() =>
      searchInspirationWeb(
        "q",
        signal(),
        async () => {
          throw new DOMException("SECRET", "TimeoutError");
        },
        "offline",
      ),
    ),
  ).toMatchObject({ code: "timeout" });
  expect(
    await capture(() =>
      searchInspirationWeb("q", signal(), async () => new Response("not JSON"), "offline"),
    ),
  ).toEqual({ stage: "search_parse", code: "invalid_json", httpStatus: 200 });
  expect(
    await capture(() =>
      searchInspirationWeb(
        "q",
        signal(),
        async () => Response.json({ results: "SECRET" }),
        "offline",
      ),
    ),
  ).toEqual({ stage: "search_schema", code: "invalid_schema", field: "results", httpStatus: 200 });
  expect(
    await capture(() =>
      searchInspirationWeb(
        "q",
        signal(),
        async () => new Response(null, { status: 200 }),
        "offline",
      ),
    ),
  ).toMatchObject({ code: "empty_body" });
});
test("AI dispatch, incomplete output, JSON and schema failures have different stages", async () => {
  const request = { kind: "artist", artist: "Offline", depth: "standard" } as const;
  const docs = [
    {
      text: "Offline text",
      source: {
        id: "s1",
        title: "Fixture",
        url: "https://example.org",
        accessedAt: new Date().toISOString(),
        publisher: null,
        locator: "fixture",
        sourceType: "other" as const,
      },
    },
  ];
  const receipt = {
    usage: null,
    provider: "openai",
    model: "offline",
    text: "no JSON",
    stopReason: "end_turn" as const,
  };
  expect(
    await capture(() =>
      synthesizeMusicInspiration(
        request,
        docs,
        async () => {
          throw { httpStatus: 429, message: "SECRET" };
        },
        signal(),
      ),
    ),
  ).toEqual({ stage: "ai_request", code: "http", httpStatus: 429 });
  expect(
    await capture(() => synthesizeMusicInspiration(request, docs, async () => receipt, signal())),
  ).toMatchObject({ stage: "ai_parse", code: "invalid_json" });
  expect(
    await capture(() =>
      synthesizeMusicInspiration(request, docs, async () => ({ ...receipt, text: "{}" }), signal()),
    ),
  ).toMatchObject({ stage: "ai_schema", code: "invalid_schema" });
  expect(
    await capture(() =>
      synthesizeMusicInspiration(
        request,
        docs,
        async () => ({ ...receipt, stopReason: "max_tokens" as const }),
        signal(),
      ),
    ),
  ).toMatchObject({ stage: "ai_request", code: "incomplete" });
});
