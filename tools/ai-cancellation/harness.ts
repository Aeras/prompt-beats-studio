/**
 * PromptBeats — isolated, NON-PRODUCTION AI cancellation test harness.
 *
 * Not imported by the app. Never touches the database, production jobs or UI.
 * Each provider/API mode is evaluated separately and classified as one of:
 *   cancelled_upstream_confirmed | connection_aborted_unconfirmed |
 *   already_completed | cancel_failed | unsupported
 *
 * Only a provider-authoritative status read by an INDEPENDENT retrieval request
 * (OpenAI GET /v1/responses/{id} `status: cancelled`, Gemini GET
 * /v1beta/interactions/{id} `status: cancelled`, OpenRouter Generation API
 * `cancelled: true` from a cancellation-supporting upstream) yields
 * `cancelled_upstream_confirmed`. A cancel-endpoint HTTP 200 or a plain
 * stream abort never does.
 *
 * Safety: each billable create request is durably reserved in the ledger BEFORE
 * dispatch; at most one per mode, ever; no retries of billable requests; a
 * reservation without a result counts as possibly billed. The budget guard is a
 * local client-side admission check, NOT a provider-side spending cap.
 * Prompt text and secrets are never written to results or logs.
 */
import { MemoryLedger, type Ledger, type Reservation } from "./ledger";

export type Outcome =
  | "cancelled_upstream_confirmed"
  | "connection_aborted_unconfirmed"
  | "already_completed"
  | "cancel_failed"
  | "unsupported";

export type ProviderId = "openai" | "xai" | "openrouter" | "gemini";

export type ModeId =
  | "openai_background_responses"
  | "xai_stream_abort"
  | "openrouter_stream_abort"
  | "gemini_background_interactions";

export type ModeConfig = {
  mode: ModeId;
  provider: ProviderId;
  model: string;
  apiMode: string;
  envKey: string;
  /** Provider list prices in USD per 1M tokens, from the cited source. */
  inputUsdPerM: number;
  outputUsdPerM: number;
  pricingSource: string;
  pricingVerifiedOn: string;
  /** Provider's documented maximum output tokens for the model. */
  providerMaxOutputTokens: number;
  /** Hard output cap the harness sends. */
  maxOutputTokens: number;
  /**
   * Safety factor for billed output beyond the cap (e.g. thinking tokens that
   * may not be bounded by the visible-output cap).
   */
  outputBillMultiplier: number;
  /** Conservative upper bound of input tokens for the neutral prompt. */
  maxInputTokens: number;
};

/** Neutral, non-sensitive prompt. Its text is never persisted in results. */
export const NEUTRAL_PROMPT =
  "Write a long, plain, factual description of how a public library organises its books, in numbered paragraphs.";

/** OpenRouter upstreams documented as stopping processing+billing on stream abort. */
export const OPENROUTER_CANCEL_SUPPORTED_UPSTREAMS = ["OpenAI", "Azure", "xAI", "Anthropic"];

export const MODES: Record<ModeId, ModeConfig> = {
  openai_background_responses: {
    mode: "openai_background_responses",
    provider: "openai",
    model: "gpt-5.6-luna",
    apiMode:
      "Responses API background=true; POST /v1/responses/{id}/cancel; verify via GET /v1/responses/{id}",
    envKey: "OPENAI_API_KEY",
    inputUsdPerM: 0.2,
    outputUsdPerM: 1.2,
    pricingSource: "developers.openai.com/api/docs/models/gpt-5.6-luna",
    pricingVerifiedOn: "2026-10-23",
    providerMaxOutputTokens: 128_000,
    maxOutputTokens: 1024,
    outputBillMultiplier: 1, // max_output_tokens includes reasoning tokens
    maxInputTokens: 200,
  },
  xai_stream_abort: {
    mode: "xai_stream_abort",
    provider: "xai",
    model: "grok-4.6",
    apiMode: "Chat Completions SSE stream, client abort (no documented per-request cancel/status endpoint)",
    envKey: "XAI_API_KEY",
    inputUsdPerM: 2,
    outputUsdPerM: 6,
    pricingSource: "docs.x.ai/developers/models/grok-4.6",
    pricingVerifiedOn: "2026-10-23",
    providerMaxOutputTokens: 450_000,
    maxOutputTokens: 1024,
    outputBillMultiplier: 2, // reasoning tokens may not be bounded by max_tokens
    maxInputTokens: 200,
  },
  openrouter_stream_abort: {
    mode: "openrouter_stream_abort",
    provider: "openrouter",
    model: "openai/gpt-5.6-luna",
    apiMode:
      "Chat Completions SSE stream abort, upstream pinned to OpenAI (cancellation-supported); verify via GET /api/v1/generation?id=",
    envKey: "OPENROUTER_API_KEY",
    inputUsdPerM: 0.2,
    outputUsdPerM: 1.2,
    pricingSource: "openrouter.ai/api/v1/models/openai/gpt-5.6-luna/endpoints (provider OpenAI)",
    pricingVerifiedOn: "2026-10-23",
    providerMaxOutputTokens: 128_000,
    maxOutputTokens: 1024,
    outputBillMultiplier: 1,
    maxInputTokens: 200,
  },
  gemini_background_interactions: {
    mode: "gemini_background_interactions",
    provider: "gemini",
    model: "gemini-3.8-flash",
    apiMode:
      "Interactions API background=true; POST /v1beta/interactions/{id}/cancel; verify via GET /v1beta/interactions/{id}",
    envKey: "GEMINI_API_KEY",
    inputUsdPerM: 0.75,
    outputUsdPerM: 3.75, // includes thinking tokens; valid through 2026-12-31
    pricingSource: "ai.google.dev/gemini-api/docs/pricing (Gemini 3.8 Flash, paid tier)",
    pricingVerifiedOn: "2026-10-23",
    providerMaxOutputTokens: 65_536,
    maxOutputTokens: 1024,
    outputBillMultiplier: 2, // thinking tokens billed as output
    maxInputTokens: 200,
  },
};

export const MAX_BILLABLE_CALLS_PER_MODE = 1;
export const DEFAULT_TOTAL_BUDGET_USD = 0.1;
export const GEMINI_API_REVISION = "2026-05-20";

export function worstCaseCostUsd(c: ModeConfig): number {
  const usd =
    (c.maxInputTokens * c.inputUsdPerM +
      c.maxOutputTokens * c.outputBillMultiplier * c.outputUsdPerM) /
    1_000_000;
  return Math.ceil(usd * 1e6) / 1e6;
}

export type Usage = {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  source: string;
} | null;

export type ModeResult = {
  mode: ModeId;
  provider: ProviderId;
  model: string;
  apiMode: string;
  outcome: Outcome;
  evidence: string[];
  providerRequestId: string | null;
  providerFinalStatus: string | null;
  /** Upstream that actually served the request, when the provider reports it. */
  servedBy: string | null;
  timestamps: Record<string, string | number | null>;
  usage: Usage;
  /** Local estimate: reported usage x list prices. null without usage. */
  estimatedCostUsd: number | null;
  /** Only a provider-reported billed amount (OpenRouter total_cost). */
  confirmedBilledCostUsd: number | null;
  worstCaseCostUsd: number;
  billableCreateRequests: number;
  /** True when the create request may have been billed without a known result. */
  possiblyBilledUnknown: boolean;
  elapsedMs: number;
};

export type Deps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  env: (key: string) => string | undefined;
  /** Resolves when a single request has waited too long. */
  requestTimeout?: (ms: number) => Promise<void>;
  ledger?: Ledger;
  newId?: () => string;
};

const STATUS_POLLS = 20;
const POLL_MS = 500;
const REQUEST_TIMEOUT_MS = 60_000;

class RequestTimeoutError extends Error {
  override readonly name = "RequestTimeoutError";
}

/** Wraps fetch with a hard timeout; a timed-out request is aborted, never retried. */
async function timedFetch(d: Deps, url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const outer = init.signal;
  outer?.addEventListener("abort", () => controller.abort());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wait = d.requestTimeout
    ? d.requestTimeout(REQUEST_TIMEOUT_MS)
    : new Promise<void>((r) => {
        timer = setTimeout(r, REQUEST_TIMEOUT_MS);
      });
  const timeout = wait.then(() => {
    controller.abort();
    throw new RequestTimeoutError("timeout");
  });
  timeout.catch(() => {});
  try {
    return await Promise.race([d.fetch(url, { ...init, signal: controller.signal }), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function estimate(c: ModeConfig, u: Usage): number | null {
  if (!u || (u.inputTokens == null && u.outputTokens == null)) return null;
  const usd = ((u.inputTokens ?? 0) * c.inputUsdPerM + (u.outputTokens ?? 0) * c.outputUsdPerM) / 1_000_000;
  return Math.round(usd * 1e8) / 1e8;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Only safe identifiers/status strings may enter results. */
export function safeToken(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_.:\- ]{1,160}$/.test(v) ? v : null;
}

const iso = (d: Deps) => new Date(d.now()).toISOString();

type Partial0 = Omit<ModeResult, "outcome" | "elapsedMs">;

function base(c: ModeConfig): Partial0 {
  return {
    mode: c.mode,
    provider: c.provider,
    model: c.model,
    apiMode: c.apiMode,
    evidence: [],
    providerRequestId: null,
    providerFinalStatus: null,
    servedBy: null,
    timestamps: {},
    usage: null,
    estimatedCostUsd: null,
    confirmedBilledCostUsd: null,
    worstCaseCostUsd: worstCaseCostUsd(c),
    billableCreateRequests: 0,
    possiblyBilledUnknown: false,
  };
}

const createOutcome = (status: number): Outcome =>
  status === 400 || status === 404 || status === 422 ? "unsupported" : "cancel_failed";

// --------------------------------------- Background (OpenAI Responses, Gemini Interactions)

type BackgroundSpec = {
  createUrl: string;
  cancelUrl: (id: string) => string;
  getUrl: (id: string) => string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  terminalCompleted: string[];
  running: string[];
  usage: (body: any) => Usage;
};

async function runBackground(c: ModeConfig, spec: BackgroundSpec, d: Deps): Promise<Omit<ModeResult, "elapsedMs">> {
  const r = base(c);
  r.billableCreateRequests = 1;
  r.timestamps["createSentAt"] = iso(d);
  const create = await timedFetch(d, spec.createUrl, {
    method: "POST",
    headers: spec.headers,
    body: JSON.stringify(spec.body),
  });
  r.timestamps["createAnsweredAt"] = iso(d);
  if (!create.ok) {
    r.evidence.push(`create HTTP ${create.status}`);
    return { ...r, outcome: createOutcome(create.status) };
  }
  const created = (await create.json()) as any;
  const id = safeToken(created?.id);
  r.providerRequestId = id;
  r.timestamps["providerCreatedAt"] = num(created?.created_at) ?? safeToken(created?.created);
  if (!id) {
    r.possiblyBilledUnknown = true;
    r.evidence.push("create returned no id; cannot cancel or verify");
    return { ...r, outcome: "cancel_failed" };
  }
  const createdStatus = safeToken(created?.status);
  r.evidence.push(`created status=${createdStatus}`);
  if (createdStatus && spec.terminalCompleted.includes(createdStatus)) {
    return finalize(c, r, spec, created, "already_completed");
  }

  r.timestamps["cancelSentAt"] = iso(d);
  try {
    const cancel = await timedFetch(d, spec.cancelUrl(id), { method: "POST", headers: spec.headers });
    r.evidence.push(`cancel HTTP ${cancel.status} (not used as proof)`);
  } catch (e) {
    r.evidence.push(`cancel request error ${safeToken((e as Error)?.name) ?? "unknown"}`);
  }

  // Independent authoritative retrieval decides the outcome.
  let last: any = null;
  let status: string | null = null;
  let reachable = false;
  for (let i = 0; i < STATUS_POLLS; i++) {
    await d.sleep(POLL_MS);
    try {
      const g = await timedFetch(d, spec.getUrl(id), { headers: spec.headers });
      if (g.ok) {
        reachable = true;
        last = await g.json();
        status = safeToken(last?.status);
        if (status && !spec.running.includes(status)) break;
      }
    } catch {
      /* status read failures are free; keep polling within bound */
    }
  }
  r.timestamps["verifiedAt"] = iso(d);
  r.evidence.push(reachable ? `independent GET status=${status}` : "status endpoint unavailable");
  if (!reachable) {
    r.possiblyBilledUnknown = true;
    return { ...r, outcome: "cancel_failed" };
  }
  if (status === "cancelled") return finalize(c, r, spec, last, "cancelled_upstream_confirmed");
  if (status && spec.terminalCompleted.includes(status)) return finalize(c, r, spec, last, "already_completed");
  r.possiblyBilledUnknown = true;
  return finalize(c, r, spec, last, "cancel_failed");
}

function finalize(c: ModeConfig, r: Partial0, spec: BackgroundSpec, body: any, outcome: Outcome) {
  r.providerFinalStatus = safeToken(body?.status);
  r.timestamps["providerCompletedAt"] = num(body?.completed_at) ?? safeToken(body?.updated);
  r.usage = spec.usage(body);
  r.estimatedCostUsd = estimate(c, r.usage);
  if (outcome === "cancel_failed" && !r.usage) r.possiblyBilledUnknown = true;
  return { ...r, outcome };
}

function openAiSpec(c: ModeConfig, key: string): BackgroundSpec {
  const root = "https://api.openai.com/v1/responses";
  return {
    createUrl: root,
    cancelUrl: (id) => `${root}/${id}/cancel`,
    getUrl: (id) => `${root}/${id}`,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: { model: c.model, input: NEUTRAL_PROMPT, background: true, store: true, max_output_tokens: c.maxOutputTokens },
    terminalCompleted: ["completed", "incomplete", "failed"],
    running: ["queued", "in_progress"],
    usage: (b) =>
      b?.usage
        ? {
            inputTokens: num(b.usage.input_tokens),
            outputTokens: num(b.usage.output_tokens),
            reasoningTokens: num(b.usage.output_tokens_details?.reasoning_tokens),
            source: "openai.responses.usage",
          }
        : null,
  };
}

function geminiSpec(c: ModeConfig, key: string): BackgroundSpec {
  const root = "https://generativelanguage.googleapis.com/v1beta/interactions";
  return {
    createUrl: root,
    cancelUrl: (id) => `${root}/${id}/cancel`,
    getUrl: (id) => `${root}/${id}`,
    headers: { "x-goog-api-key": key, "content-type": "application/json", "api-revision": GEMINI_API_REVISION },
    body: {
      model: c.model,
      input: NEUTRAL_PROMPT,
      background: true,
      store: true,
      generation_config: { max_output_tokens: c.maxOutputTokens },
    },
    terminalCompleted: ["completed", "failed"],
    running: ["in_progress", "queued"],
    usage: (b) =>
      b?.usage
        ? {
            inputTokens: num(b.usage.total_input_tokens),
            outputTokens: num(b.usage.total_output_tokens),
            reasoningTokens: num(b.usage.total_thought_tokens),
            source: "gemini.interactions.usage",
          }
        : null,
  };
}

// ------------------------------------------------- Streaming (xAI, OpenRouter)

async function streamUntilStartedThenAbort(url: string, key: string, body: Record<string, unknown>, d: Deps) {
  const controller = new AbortController();
  const res = await timedFetch(d, url, {
    method: "POST",
    signal: controller.signal,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok || !res.body) {
    controller.abort();
    return { httpStatus: res.status, id: null as string | null, started: false, finished: false };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let id: string | null = null;
  let started = false;
  let finished = false;
  try {
    while (!started && !finished) {
      const chunk = await reader.read();
      if (chunk.done) {
        finished = true;
        break;
      }
      buf += dec.decode(chunk.value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          finished = true;
          continue;
        }
        let f: any;
        try {
          f = JSON.parse(data);
        } catch {
          continue;
        }
        id = id ?? safeToken(f?.id);
        const ch = f?.choices?.[0];
        if (ch?.finish_reason) finished = true;
        const delta = ch?.delta ?? {};
        if (delta.content || delta.reasoning || delta.reasoning_content) started = true;
      }
    }
  } finally {
    controller.abort();
    try {
      await reader.cancel();
    } catch {
      /* already aborted */
    }
  }
  return { httpStatus: res.status, id, started, finished };
}

async function runXai(c: ModeConfig, key: string, d: Deps): Promise<Omit<ModeResult, "elapsedMs">> {
  const r = base(c);
  r.billableCreateRequests = 1;
  r.timestamps["createSentAt"] = iso(d);
  const s = await streamUntilStartedThenAbort(
    "https://api.x.ai/v1/chat/completions",
    key,
    { model: c.model, messages: [{ role: "user", content: NEUTRAL_PROMPT }], max_tokens: c.maxOutputTokens },
    d,
  );
  r.timestamps["abortedAt"] = iso(d);
  r.providerRequestId = s.id;
  r.evidence.push(`stream HTTP ${s.httpStatus}, started=${s.started}, finished=${s.finished}`);
  if (s.httpStatus !== 200) return { ...r, outcome: createOutcome(s.httpStatus) };
  if (s.finished) return { ...r, outcome: "already_completed" };
  r.possiblyBilledUnknown = true;
  r.evidence.push("client abort sent; xAI documents no per-request status/cancel endpoint to verify");
  return { ...r, outcome: "connection_aborted_unconfirmed" };
}

async function runOpenRouter(c: ModeConfig, key: string, d: Deps): Promise<Omit<ModeResult, "elapsedMs">> {
  const r = base(c);
  r.billableCreateRequests = 1;
  r.timestamps["createSentAt"] = iso(d);
  const s = await streamUntilStartedThenAbort(
    "https://openrouter.ai/api/v1/chat/completions",
    key,
    {
      model: c.model,
      messages: [{ role: "user", content: NEUTRAL_PROMPT }],
      max_tokens: c.maxOutputTokens,
      // Pin to an upstream documented as supporting stream cancellation.
      provider: { order: ["openai"], only: ["openai"], allow_fallbacks: false },
    },
    d,
  );
  r.timestamps["abortedAt"] = iso(d);
  r.providerRequestId = s.id;
  r.evidence.push(`stream HTTP ${s.httpStatus}, started=${s.started}, finished=${s.finished}`);
  if (s.httpStatus !== 200) return { ...r, outcome: createOutcome(s.httpStatus) };
  if (!s.id) {
    r.possiblyBilledUnknown = true;
    return { ...r, outcome: "connection_aborted_unconfirmed" };
  }

  // Free metadata endpoint; may 404 until the generation record is written.
  let gen: any = null;
  for (let i = 0; i < STATUS_POLLS && !gen; i++) {
    await d.sleep(POLL_MS * 2);
    try {
      const g = await timedFetch(d, `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(s.id)}`, {
        headers: { authorization: `Bearer ${key}` },
      });
      if (g.ok) gen = ((await g.json()) as any)?.data ?? null;
    } catch {
      /* free read; bounded polling */
    }
  }
  r.timestamps["verifiedAt"] = iso(d);
  if (!gen) {
    r.possiblyBilledUnknown = true;
    r.evidence.push("generation record not available");
    return { ...r, outcome: s.finished ? "already_completed" : "connection_aborted_unconfirmed" };
  }
  r.servedBy = safeToken(gen.provider_name);
  r.timestamps["providerCreatedAt"] = safeToken(gen.created_at);
  r.usage = {
    inputTokens: num(gen.native_tokens_prompt) ?? num(gen.tokens_prompt),
    outputTokens: num(gen.native_tokens_completion) ?? num(gen.tokens_completion),
    reasoningTokens: num(gen.native_tokens_reasoning),
    source: "openrouter.generation",
  };
  r.estimatedCostUsd = estimate(c, r.usage);
  r.confirmedBilledCostUsd = num(gen.total_cost);
  if (r.confirmedBilledCostUsd == null) r.evidence.push("total_cost not reported; billed cost unknown");
  const cancelled = gen.cancelled === true;
  r.providerFinalStatus = cancelled
    ? "cancelled"
    : (safeToken(gen.finish_reason) ?? safeToken(gen.native_finish_reason));
  const supported = !!r.servedBy && OPENROUTER_CANCEL_SUPPORTED_UPSTREAMS.includes(r.servedBy);
  r.evidence.push(`generation.cancelled=${cancelled}, provider_name=${r.servedBy}, cancellation-supported=${supported}`);
  if (cancelled && supported) return { ...r, outcome: "cancelled_upstream_confirmed" };
  if (!supported) {
    r.possiblyBilledUnknown = r.confirmedBilledCostUsd == null;
    return { ...r, outcome: "unsupported" };
  }
  if (s.finished) return { ...r, outcome: "already_completed" };
  r.possiblyBilledUnknown = r.confirmedBilledCostUsd == null;
  return { ...r, outcome: "connection_aborted_unconfirmed" };
}

// ---------------------------------------------------------------- Runner

export type RunOptions = {
  modes: ModeId[];
  live: boolean;
  confirmSpendUsd: number | null;
  totalBudgetUsd: number;
  /** Extra prior calls/spend on top of what the ledger holds. */
  priorCalls: Partial<Record<ModeId, number>>;
  priorSpentUpperUsd: number;
};

export type Admission = { mode: ModeId; worstCaseCostUsd: number; admitted: boolean; reason: string };

export function admit(o: RunOptions): { admissions: Admission[]; totalWorstCaseUsd: number } {
  let running = o.priorSpentUpperUsd;
  const admissions = o.modes.map((m) => {
    const w = worstCaseCostUsd(MODES[m]);
    if ((o.priorCalls[m] ?? 0) >= MAX_BILLABLE_CALLS_PER_MODE)
      return { mode: m, worstCaseCostUsd: w, admitted: false, reason: "max billable calls reached" };
    if (running + w > o.totalBudgetUsd)
      return { mode: m, worstCaseCostUsd: w, admitted: false, reason: "total budget exceeded" };
    running += w;
    return { mode: m, worstCaseCostUsd: w, admitted: true, reason: "ok" };
  });
  return { admissions, totalWorstCaseUsd: Math.round((running - o.priorSpentUpperUsd) * 1e6) / 1e6 };
}

/** Every reservation (completed or not) counts as a billable call at worst-case cost. */
export function ledgerTotals(reservations: Reservation[]) {
  const calls: Partial<Record<ModeId, number>> = {};
  let spent = 0;
  for (const r of reservations) {
    calls[r.mode] = (calls[r.mode] ?? 0) + 1;
    spent += r.worstCaseCostUsd;
  }
  return { calls, spentUpperUsd: Math.round(spent * 1e6) / 1e6 };
}

export async function runHarness(
  o: RunOptions,
  d: Deps,
): Promise<{ admissions: Admission[]; results: ModeResult[] }> {
  const ledger = d.ledger ?? new MemoryLedger();
  const newId = d.newId ?? (() => crypto.randomUUID());
  const prior = ledgerTotals(ledger.read().reservations);
  const merged: RunOptions = {
    ...o,
    priorCalls: Object.fromEntries(
      Object.keys(MODES).map((m) => [m, (o.priorCalls[m as ModeId] ?? 0) + (prior.calls[m as ModeId] ?? 0)]),
    ),
    priorSpentUpperUsd: o.priorSpentUpperUsd + prior.spentUpperUsd,
  };
  const { admissions, totalWorstCaseUsd } = admit(merged);
  if (!o.live) return { admissions, results: [] };
  if (
    o.confirmSpendUsd == null ||
    o.confirmSpendUsd < totalWorstCaseUsd ||
    o.confirmSpendUsd > o.totalBudgetUsd
  )
    throw new Error("Live run refused: --confirm-spend-usd must be >= worst case and <= total budget.");

  ledger.acquireLock();
  const results: ModeResult[] = [];
  try {
    for (const a of admissions) {
      if (!a.admitted) continue;
      const c = MODES[a.mode];
      const key = d.env(c.envKey);
      if (!key) {
        results.push({ ...base(c), outcome: "unsupported", evidence: ["server secret not configured"], elapsedMs: 0 });
        continue;
      }

      // Durable reservation BEFORE dispatch. Re-read under the lock.
      const data = ledger.read();
      if (data.reservations.some((x) => x.mode === a.mode))
        throw new Error(`Mode ${a.mode} already has a reservation; refusing to dispatch again.`);
      const reservation: Reservation = {
        reservationId: newId(),
        mode: a.mode,
        reservedAt: iso(d),
        worstCaseCostUsd: a.worstCaseCostUsd,
        state: "reserved",
        completedAt: null,
        result: null,
      };
      data.reservations.push(reservation);
      ledger.write(data); // throws => nothing dispatched

      const t0 = d.now();
      let result: ModeResult;
      try {
        const out =
          c.provider === "openai"
            ? await runBackground(c, openAiSpec(c, key), d)
            : c.provider === "gemini"
              ? await runBackground(c, geminiSpec(c, key), d)
              : c.provider === "xai"
                ? await runXai(c, key, d)
                : await runOpenRouter(c, key, d);
        result = { ...out, elapsedMs: d.now() - t0 };
      } catch (e) {
        // No retry: the request may have reached the provider and been billed.
        result = {
          ...base(c),
          billableCreateRequests: 1,
          possiblyBilledUnknown: true,
          outcome: "cancel_failed",
          evidence: [`error ${safeToken(e instanceof Error ? e.name : "") ?? "unknown"}; possibly billed`],
          elapsedMs: d.now() - t0,
        };
      }
      results.push(result);
      try {
        const after = ledger.read();
        const entry = after.reservations.find((x) => x.reservationId === reservation.reservationId);
        if (entry) {
          entry.state = "completed";
          entry.completedAt = iso(d);
          entry.result = result;
          ledger.write(after);
        }
      } catch {
        // Reservation stays "reserved": still blocks re-dispatch and counts in budget.
        result.evidence.push("ledger completion write failed; reservation remains blocking");
      }
    }
  } finally {
    ledger.releaseLock();
  }
  return { admissions, results };
}
