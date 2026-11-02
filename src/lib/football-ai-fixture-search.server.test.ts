import { describe, expect, it, mock } from "bun:test";
const vi = { fn: mock };
import {
  AI_FIXTURE_MODEL,
  buildAiFixtureSearchPayload,
  estimateAiFixtureMaxCostUsd,
  parseAiFixtureResponse,
  requestAiFixtureCandidates,
  AiFixtureProviderError,
} from "./football-ai-fixture-search.server";

const ok = (body: unknown) =>
  JSON.stringify({
    id: "gen-1",
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify(body),
          annotations: [
            {
              type: "url_citation",
              url_citation: { url: "https://www.bbc.co.uk/sport/x", title: "BBC" },
            },
            {
              type: "url_citation",
              url_citation: { url: "http://insecure.example/x", title: "no" },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.01 },
  });

describe("AI fixture search payload", () => {
  it("uses the documented OpenRouter web plugin, structured output and no fallbacks", () => {
    const p = buildAiFixtureSearchPayload({ leagueId: "UEFA-CL", weekDate: "2026-11-04" });
    expect(p.model).toBe(AI_FIXTURE_MODEL);
    expect(p.plugins).toEqual([{ id: "web", engine: "exa", max_results: 8 }]);
    expect(p.response_format.type).toBe("json_schema");
    expect(p.provider.allow_fallbacks).toBe(false);
    expect("tools" in p).toBe(false);
    expect(p.messages[1]!.content).toContain("2026-11-02 to 2026-11-08");
  });

  it("caps the consented maximum cost from registry prices", () => {
    // 14k × 0.75 + 4k × 3.75 per million + $0.007 search fee = $0.0325 → $0.033
    expect(estimateAiFixtureMaxCostUsd({ inputPerMillion: 0.75, outputPerMillion: 3.75 })).toBe(
      0.033,
    );
  });
});

describe("AI fixture response parsing", () => {
  it("reads only https url_citation annotations as untrusted citations", () => {
    const r = parseAiFixtureResponse(ok({ fixtures: [] }));
    expect(r.citations).toEqual([{ url: "https://www.bbc.co.uk/sport/x", title: "BBC" }]);
    expect(r.usage.inputTokens).toBe(100);
  });
  it("accepts fenced JSON content and rejects truncated output", () => {
    const fenced = JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: '```json\n{"fixtures":[]}\n```' } }],
    });
    expect(parseAiFixtureResponse(fenced).content).toEqual({ fixtures: [] });
    const cut = JSON.stringify({
      choices: [{ finish_reason: "length", message: { content: "{" } }],
    });
    expect(() => parseAiFixtureResponse(cut)).toThrow(/incomplete/);
  });
  it("classifies provider HTTP, network and malformed responses without exposing payloads", async () => {
    const input = { leagueId: "EN-PL" as const, weekDate: "2026-11-04" };
    const opts = (fetcher: typeof fetch) => ({
      apiKey: "secret",
      model: AI_FIXTURE_MODEL,
      fetcher,
      signal: AbortSignal.timeout(1000),
    });
    for (const [status, kind] of [
      [400, "http_4xx"],
      [429, "http_4xx"],
      [502, "http_5xx"],
    ] as const) {
      try {
        await requestAiFixtureCandidates(
          input,
          opts(async () => new Response("private body", { status })),
        );
        throw new Error("expected provider failure");
      } catch (error) {
        expect(error).toBeInstanceOf(AiFixtureProviderError);
        expect((error as AiFixtureProviderError).kind).toBe(kind);
        expect((error as Error).message).not.toContain("private body");
      }
    }
    await expect(
      requestAiFixtureCandidates(
        input,
        opts(async () => {
          throw Error("private socket");
        }),
      ),
    ).rejects.toMatchObject({ kind: "network" });
    await expect(
      requestAiFixtureCandidates(
        input,
        opts(async () => new Response("malformed")),
      ),
    ).rejects.toMatchObject({ kind: "invalid_response" });
  });
  it("dispatches exactly once with manual redirects and never retries", async () => {
    const fetcher = vi.fn(async () => new Response("nope", { status: 502 }));
    await expect(
      requestAiFixtureCandidates(
        { leagueId: "EN-PL", weekDate: "2026-11-04" },
        {
          apiKey: "k",
          model: AI_FIXTURE_MODEL,
          fetcher: fetcher as never,
          signal: AbortSignal.timeout(1000),
        },
      ),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe("manual");
  });
});
