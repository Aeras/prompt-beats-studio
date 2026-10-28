/** Real fixed-origin search/retrieval adapter. No live calls occur during tests. */
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  inspirationRequestSchema,
  inspirationResearchSchema,
  MUSIC_INSPIRATION_RESEARCH_SYSTEM_PROMPT,
  type InspirationRequest,
  type InspirationResearch,
} from "./music-inspiration.shared";
import type { ModelCall, ModelResult } from "./ai-provider.server";

export const INSPIRATION_LIMITS = {
  standard: { queries: 2, results: 3, textChars: 3000, timeoutMs: 90000 },
  extended: { queries: 5, results: 3, textChars: 4000, timeoutMs: 120000 },
} as const;
export type RetrievedInspirationDocument = {
  source: InspirationResearch["sources"][number];
  text: string;
};
export function inspectMusicInspirationConfiguration(env = process.env) {
  const configured = !!env["TAVILY_API_KEY"]?.trim();
  return { configured, reason: configured ? null : "search_configuration_required" };
}
/** Never authorizes research-only Atlas data or assumes a bibliography link is approval. */
export async function approvedAtlasEvidence(
  _request: InspirationRequest,
): Promise<RetrievedInspirationDocument[]> {
  const { readAtlasCatalog } = await import("./song-atlas-data.server");
  const catalog = readAtlasCatalog();
  // Mainline RC1 declares researchOnly:true. None of its options is approved.
  // No V4 import, fuzzy artist-to-profile mapping, or automatic promotion.
  if (catalog.researchOnly) return [];
  return [];
}
export function inspirationQueries(input: InspirationRequest): string[] {
  const request = inspirationRequestSchema.parse(input);
  const subject =
    request.kind === "artist"
      ? `${request.artist} ${request.song ?? ""}`.trim()
      : request.description;
  const topics = [
    "official album credits instruments arrangement interview",
    "production rhythm vocals music scholarship score",
    "официальные участники запись инструменты интервью",
    "аранжировка ритм вокал партитура исследование",
    "discography contemporary recording credits sources",
  ];
  return topics
    .slice(0, INSPIRATION_LIMITS[request.depth].queries)
    .map((topic) => `${subject.slice(0, 1500)} ${topic}`);
}
export function publicInspirationUrl(raw: string): string {
  const u = new URL(raw);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !u.hostname.includes(".") ||
    /^(\[|\d|localhost)/i.test(u.hostname) ||
    /\.(local|internal|localhost|test|invalid)$/i.test(u.hostname) ||
    /(?:\.mp3|\.wav|\.flac|\.ogg|\.m4a|\.mp4|\.zip|\.exe)$/i.test(u.pathname) ||
    [...u.searchParams.keys()].some((key) => /token|password|secret|api[_-]?key/i.test(key))
  )
    throw new Error("unsafe_source_url");
  u.hash = "";
  return u.href;
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error("search_provider_failed");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > 1024 * 1024) throw new Error("search_response_too_large");
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(combined));
}
const searchResponseSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().max(2000),
        url: z.string().max(2048),
        raw_content: z.string().nullable().optional(),
        content: z.string().optional(),
      }),
    )
    .max(20),
  usage: z.object({ credits: z.number().int().nonnegative() }).optional(),
  request_id: z.string().max(200).optional(),
});
export async function searchInspirationWeb(
  query: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  apiKey = process.env["TAVILY_API_KEY"],
): Promise<{
  documents: RetrievedInspirationDocument[];
  credits: number | null;
  requestId: string | null;
}> {
  if (!apiKey) throw new Error("search_configuration_required");
  const response = await fetcher("https://api.tavily.com/search", {
    method: "POST",
    redirect: "error",
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 3,
      topic: "general",
      include_raw_content: "text",
      include_answer: false,
      include_images: false,
      auto_parameters: false,
      include_usage: true,
    }),
  });
  const parsed = searchResponseSchema.parse(await boundedJson(response));
  const seen = new Set<string>();
  const documents: RetrievedInspirationDocument[] = [];
  for (const result of parsed.results) {
    let url: string;
    try {
      url = publicInspirationUrl(result.url);
    } catch {
      continue;
    }
    // A snippet is discovery only, never a substitute for retrieved source text.
    if (!result.raw_content?.trim() || seen.has(url)) continue;
    seen.add(url);
    const text = result.raw_content
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .slice(0, 4000);
    if (!text.trim()) continue;
    const id = "web-" + createHash("sha256").update(url).digest("hex").slice(0, 20);
    const accessedAt = new Date().toISOString();
    const contentSha256 = createHash("sha256").update(text).digest("hex");
    documents.push({
      text,
      source: {
        id,
        title: result.title.slice(0, 300),
        url,
        accessedEvidence: "retrieved_extract",
        contentSha256,
        receipt: {
          documentId: id,
          finalUrl: url,
          retrievedAt: accessedAt,
          contentSha256,
          accessibility: "accessible",
        },
        publisher: new URL(url).hostname,
        accessedAt,
        locator:
          "Provider-retrieved text extract, bounded to 4000 characters; not an assertion of full-document review.",
        sourceType: "other",
      },
    });
  }
  return {
    documents,
    credits: parsed.usage?.credits ?? null,
    requestId: parsed.request_id ?? null,
  };
}
/** Prices are administrator-owned estimates, never admission or freshness requirements. */
export async function getMusicInspirationPrices(model: string, provider: string) {
  const { configuredPrice, emptyInspirationPrices } =
    await import("./music-inspiration-usage.shared");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const fallback = {
    ...emptyInspirationPrices(),
    searchCreditUsd: configuredPrice(process.env["MUSIC_INSPIRATION_SEARCH_CREDIT_USD"]),
  };
  let data;
  try {
    const reply = await supabaseAdmin
      .from("ai_models")
      .select("*")
      .eq("provider_model_id", model)
      .eq("provider", provider)
      .maybeSingle();
    if (reply.error || !reply.data) return fallback;
    data = reply.data;
  } catch {
    return fallback;
  }
  // Tariff lookup is informational; it cannot deny an otherwise authorized research.

  const price = data.pricing_currency === "USD" ? configuredPrice : () => null;
  return {
    input: price(data.input_price_per_million),
    output: price(data.output_price_per_million),
    cached: price(data.cached_input_price_per_million),
    cacheWrite: price(data.cache_write_price_per_million),
    searchCreditUsd: configuredPrice(process.env["MUSIC_INSPIRATION_SEARCH_CREDIT_USD"]),
  };
}
export async function synthesizeMusicInspiration(
  request: InspirationRequest,
  documents: RetrievedInspirationDocument[],
  call: (input: ModelCall) => Promise<ModelResult>,
  signal: AbortSignal,
): Promise<{ result: InspirationResearch; receipt: ModelResult }> {
  if (!documents.length) throw new Error("no_accessible_evidence");
  const canonical = [...new Map(documents.map((d) => [d.source.id, d])).values()].slice(0, 10);
  const prompt = JSON.stringify({
    request,
    schema: z.toJSONSchema(inspirationResearchSchema),
    sourceTextIsUntrustedData: true,
    documents: canonical.map((d) => ({ source: d.source, text: d.text.slice(0, 1500) })),
    requirements:
      "Use only supplied source IDs. Supported/bounded evidence requires exact citedPassages quotations. Mark ambiguity/disagreement explicitly. No snippets as evidence. Separate optional creative choices from historical facts. Empty knowledge stays unknown.",
  });
  if (new TextEncoder().encode(prompt).length > 70000) throw new Error("research_prompt_too_large");
  const receipt = await call({
    system: MUSIC_INSPIRATION_RESEARCH_SYSTEM_PROMPT,
    prompt,
    maxTokens: 6000,
    requestTimeoutMs: INSPIRATION_LIMITS[request.depth].timeoutMs,
    abortSignal: signal,
  });
  if (receipt.stopReason !== "end_turn") throw new Error("research_response_incomplete");
  const result = inspirationResearchSchema.parse(JSON.parse(receipt.text));
  if (JSON.stringify(result.request) !== JSON.stringify(request))
    throw new Error("research_request_mismatch");
  // Keep server receipts canonical; a model cannot add an unvisited citation or alter metadata.
  const { assertInspirationEvidenceMatchesSources } = await import("./music-inspiration.shared");
  assertInspirationEvidenceMatchesSources(result, canonical);
  return { result, receipt };
}
