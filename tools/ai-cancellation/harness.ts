/**
 * PromptBeats — isolated, NON-PRODUCTION AI cancellation test harness.
 *
 * Not imported by the app. Never touches the database, production jobs or UI.
 * Each provider/API mode is evaluated separately and classified as one of:
 *   cancelled_upstream_confirmed | connection_aborted_unconfirmed |
 *   already_completed | cancel_failed | unsupported
 *
 * Only a provider-authoritative status (OpenAI Responses `status: cancelled`,
 * Gemini Interactions `status: cancelled`, OpenRouter Generation `cancelled: true`)
 * yields `cancelled_upstream_confirmed`. A plain HTTP/stream abort never does.
 *
 * Safety: exactly one billable "create" request per mode per run, no retries of
 * billable requests, worst-case cost admission before dispatch, prompt text and
 * secrets are never written to results or logs. The budget guard is a local
 * client-side guard, NOT a provider-side spending cap.
 */

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
  /** Conservative UPPER-BOUND prices in USD per 1M tokens (budget only). */
  maxInputUsdPerM: number;
  maxOutputUsdPerM: number;
  /** Hard output cap sent to the provider (includes reasoning where applicable). */
  maxOutputTokens: number;
  /** Conservative upper bound of input tokens for the neutral prompt. */
  maxInputTokens: number;
};

/** Neutral, non-sensitive prompt. Its text is never persisted in results. */
export const NEUTRAL_PROMPT =
  "Write a long, plain, factual description of how a public library organises its books, in numbered paragraphs.";

export const MODES: Record<ModeId, ModeConfig> = {
  openai_background_responses: {
    mode: "openai_background_responses",
    provider: "openai",
    model: "gpt-5.6-luna",
    apiMode: "Responses API, background=true, POST /v1/responses/{id}/cancel",
    envKey: "OPENAI_API_KEY",
    maxInputUsdPerM: 0.5,
    maxOutputUsdPerM: 3,
    maxOutputTokens: 1024,
    maxInputTokens: 200,
  },
  xai_stream_abort: {
    mode: "xai_stream_abort",
    provider: "xai",
    model: "grok-4.6",
    apiMode: "Chat Completions SSE stream, client abort (no documented cancel endpoint)",
    envKey: "XAI_API_KEY",
    maxInputUsdPerM: 5,
    maxOutputUsdPerM: 25,
    maxOutputTokens: 1024,
    maxInputTokens: 200,
  },
  openrouter_stream_abort: {
    mode: "openrouter_stream_abort",
    provider: "openrouter",
    model: "google/gemini-2.5-flash-lite",
    apiMode: "Chat Completions SSE stream abort + GET /api/v1/generation?id=",
    envKey: "OPENROUTER_API_KEY",
    maxInputUsdPerM: 1,
    maxOutputUsdPerM: 5,
    maxOutputTokens: 1024,
    maxInputTokens: 200,
  },
  gemini_background_interactions: {
    mode: "gemini_background_interactions",
    provider: "gemini",
    model: "gemini-3.6-flash",
    apiMode: "Interactions API, background=true, POST /v1beta/interactions/{id}/cancel",
    envKey: "GEMINI_API_KEY",
    maxInputUsdPerM: 1,
    maxOutputUsdPerM: 5,
    maxOutputTokens: 1024,
    maxInputTokens: 200,
  },
};

export const MAX_BILLABLE_CALLS_PER_MODE = 1;
export const DEFAULT_TOTAL_BUDGET_USD = 0.1;

export function worstCaseCostUsd(c: ModeConfig): number {
  const usd =
    (c.maxInputTokens * c.maxInputUsdPerM + c.maxOutputTokens * c.maxOutputUsdPerM) / 1_000_000;
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
  usage: Usage;
  /** Local estimate from usage x upper-bound prices; null without usage. */
  estimatedCostUsd: number | null;
  /** Only when the provider itself reports a billed amount (OpenRouter total_cost). */
  confirmedBilledCostUsd: number | null;
  worstCaseCostUsd: number;
  billableCreateRequests: number;
  elapsedMs: number;
};

export type Deps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  env: (key: string) => string | undefined;
};

const STATUS_POLLS = 20;
const POLL_MS = 500;

function estimate(c: ModeConfig, u: Usage): number | null {
  if (!u || (u.inputTokens == null && u.outputTokens == null)) return null;
  const usd =
    ((u.inputTokens ?? 0) * c.maxInputUsdPerM + (u.outputTokens ?? 0) * c.maxOutputUsdPerM) /
    1_000_000;
  return Math.round(usd * 1e8) / 1e8;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Only safe identifiers/status strings may enter results. */
export function safeToken(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_.:\-]{1,160}$/.test(v) ? v : null;
}

function base(c: ModeConfig): Omit<ModeResult, "outcome" | "elapsedMs"> {
  return {
    mode: c.mode,
    provider: c.provider,
    model: c.model,
    apiMode: c.apiMode,
    evidence: [],
    providerRequestId: null,
    providerFinalStatus: null,
    usage: null,
    estimatedCostUsd: null,
    confirmedBilledCostUsd: null,
    worstCaseCostUsd: worstCaseCostUsd(c),
    billableCreateRequests: 0,
  };
}

// ---------------------------------------------------------------- OpenAI

async function runOpenAi(c: ModeConfig, key: string, d: Deps) {
  const r = base(c);
  const h = { authorization: `Bearer ${key}`, "content-type": "application/json" };
  r.billableCreateRequests = 1;
  const create = await d.fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      model: c.model,
      input: NEUTRAL_PROMPT,
      background: true,
      store: true,
      max_output_tokens: c.maxOutputTokens,
    }),
  });
  if (!create.ok) {
    r.evidence.push(`create HTTP ${create.status}`);
    return { ...r, outcome: create.status === 400 || create.status === 404 ? "unsupported" : "cancel_failed" } as const;
  }
  const created = (await create.json()) as any;
  const id = safeToken(created?.id);
  r.providerRequestId = id;
  if (!id) return { ...r, outcome: "cancel_failed" as const, evidence: ["no response id"] };
  let status = safeToken(created?.status);
  r.evidence.push(`created status=${status}`);
  if (status === "completed" || status === "failed" || status === "incomplete")
    return finalizeOpenAi(c, r, created, "already_completed");

  const cancel = await d.fetch(`https://api.openai.com/v1/responses/${id}/cancel`, {
    method: "POST",
    headers: h,
  });
  r.evidence.push(`cancel HTTP ${cancel.status}`);
  let last: any = cancel.ok ? await cancel.json() : null;
  for (let i = 0; i < STATUS_POLLS; i++) {
    status = safeToken(last?.status);
    if (status && status !== "queued" && status !== "in_progress") break;
    await d.sleep(POLL_MS);
    const g = await d.fetch(`https://api.openai.com/v1/responses/${id}`, { headers: h });
    last = g.ok ? await g.json() : last;
  }
  r.evidence.push(`authoritative GET status=${status}`);
  if (status === "cancelled") return finalizeOpenAi(c, r, last, "cancelled_upstream_confirmed");
  if (status === "completed" || status === "incomplete")
    return finalizeOpenAi(c, r, last, "already_completed");
  return finalizeOpenAi(c, r, last, "cancel_failed");
}

function finalizeOpenAi(c: ModeConfig, r: ReturnType<typeof base>, body: any, outcome: Outcome) {
  r.providerFinalStatus = safeToken(body?.status);
  const u = body?.usage;
  r.usage = u
    ? {
        inputTokens: num(u.input_tokens),
        outputTokens: num(u.output_tokens),
        reasoningTokens: num(u.output_tokens_details?.reasoning_tokens),
        source: "openai.responses.usage",
      }
    : null;
  r.estimatedCostUsd = estimate(c, r.usage);
  return { ...r, outcome };
}

// ---------------------------------------------------------------- Gemini

async function runGemini(c: ModeConfig, key: string, d: Deps) {
  const r = base(c);
  const h = { "x-goog-api-key": key, "content-type": "application/json" };
  const root = "https://generativelanguage.googleapis.com/v1beta/interactions";
  r.billableCreateRequests = 1;
  const create = await d.fetch(root, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      model: c.model,
      input: NEUTRAL_PROMPT,
      background: true,
      generation_config: { max_output_tokens: c.maxOutputTokens },
    }),
  });
  if (!create.ok) {
    r.evidence.push(`create HTTP ${create.status}`);
    // Background mode may be restricted to specific agents/models.
    return { ...r, outcome: create.status === 400 || create.status === 404 ? "unsupported" : "cancel_failed" } as const;
  }
  const created = (await create.json()) as any;
  const id = safeToken(created?.id);
  r.providerRequestId = id;
  if (!id) return { ...r, outcome: "cancel_failed" as const, evidence: ["no interaction id"] };
  let status = safeToken(created?.status);
  r.evidence.push(`created status=${status}`);
  if (status === "completed" || status === "failed")
    return finalizeGemini(c, r, created, "already_completed");

  const cancel = await d.fetch(`${root}/${id}/cancel`, { method: "POST", headers: h });
  r.evidence.push(`cancel HTTP ${cancel.status}`);
  let last: any = cancel.ok ? await cancel.json().catch(() => null) : null;
  for (let i = 0; i < STATUS_POLLS; i++) {
    status = safeToken(last?.status);
    if (status && status !== "in_progress" && status !== "queued") break;
    await d.sleep(POLL_MS);
    const g = await d.fetch(`${root}/${id}`, { headers: h });
    last = g.ok ? await g.json() : last;
  }
  r.evidence.push(`authoritative GET status=${status}`);
  if (status === "cancelled") return finalizeGemini(c, r, last, "cancelled_upstream_confirmed");
  if (status === "completed") return finalizeGemini(c, r, last, "already_completed");
  return finalizeGemini(c, r, last, "cancel_failed");
}

function finalizeGemini(c: ModeConfig, r: ReturnType<typeof base>, body: any, outcome: Outcome) {
  r.providerFinalStatus = safeToken(body?.status);
  const u = body?.usage;
  r.usage = u
    ? {
        inputTokens: num(u.total_input_tokens),
        outputTokens: num(u.total_output_tokens),
        reasoningTokens: num(u.total_thought_tokens),
        source: "gemini.interactions.usage",
      }
    : null;
  r.estimatedCostUsd = estimate(c, r.usage);
  return { ...r, outcome };
}

// ------------------------------------------------- Streaming (xAI, OpenRouter)

/**
 * Reads SSE until the first content/reasoning delta proves generation started,
 * then aborts. Returns the provider id seen in frames and whether a terminal
 * finish_reason arrived before the abort.
 */
async function streamUntilStartedThenAbort(
  url: string,
  key: string,
  body: Record<string, unknown>,
  d: Deps,
) {
  const controller = new AbortController();
  const res = await d.fetch(url, {
    method: "POST",
    signal: controller.signal,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok || !res.body) {
    controller.abort();
    return { httpStatus: res.status, id: null, started: false, finished: false, aborted: false };
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
  return { httpStatus: res.status, id, started, finished, aborted: !finished };
}

async function runXai(c: ModeConfig, key: string, d: Deps) {
  const r = base(c);
  r.billableCreateRequests = 1;
  const s = await streamUntilStartedThenAbort(
    "https://api.x.ai/v1/chat/completions",
    key,
    { model: c.model, messages: [{ role: "user", content: NEUTRAL_PROMPT }], max_tokens: c.maxOutputTokens },
    d,
  );
  r.providerRequestId = s.id;
  r.evidence.push(`stream HTTP ${s.httpStatus}, started=${s.started}, finished=${s.finished}`);
  if (s.httpStatus !== 200) return { ...r, outcome: s.httpStatus === 400 || s.httpStatus === 404 ? ("unsupported" as const) : ("cancel_failed" as const) };
  if (s.finished) return { ...r, outcome: "already_completed" as const };
  r.evidence.push("client abort sent; xAI exposes no authoritative per-request status/cancel endpoint");
  return { ...r, outcome: "connection_aborted_unconfirmed" as const };
}

async function runOpenRouter(c: ModeConfig, key: string, d: Deps) {
  const r = base(c);
  r.billableCreateRequests = 1;
  const s = await streamUntilStartedThenAbort(
    "https://openrouter.ai/api/v1/chat/completions",
    key,
    {
      model: c.model,
      messages: [{ role: "user", content: NEUTRAL_PROMPT }],
      max_tokens: c.maxOutputTokens,
      provider: { allow_fallbacks: false },
    },
    d,
  );
  r.providerRequestId = s.id;
  r.evidence.push(`stream HTTP ${s.httpStatus}, started=${s.started}, finished=${s.finished}`);
  if (s.httpStatus !== 200) return { ...r, outcome: s.httpStatus === 400 || s.httpStatus === 404 ? ("unsupported" as const) : ("cancel_failed" as const) };
  if (!s.id) return { ...r, outcome: "connection_aborted_unconfirmed" as const };

  // Free metadata endpoint; may 404 until the generation record is written.
  let gen: any = null;
  for (let i = 0; i < STATUS_POLLS && !gen; i++) {
    await d.sleep(POLL_MS * 2);
    const g = await d.fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(s.id)}`, {
      headers: { authorization: `Bearer ${key}` },
    });
    if (g.ok) gen = ((await g.json()) as any)?.data ?? null;
  }
  if (!gen) {
    r.evidence.push("generation record not available");
    return { ...r, outcome: s.finished ? ("already_completed" as const) : ("connection_aborted_unconfirmed" as const) };
  }
  r.usage = {
    inputTokens: num(gen.native_tokens_prompt) ?? num(gen.tokens_prompt),
    outputTokens: num(gen.native_tokens_completion) ?? num(gen.tokens_completion),
    reasoningTokens: num(gen.native_tokens_reasoning),
    source: "openrouter.generation",
  };
  r.estimatedCostUsd = estimate(c, r.usage);
  r.confirmedBilledCostUsd = num(gen.total_cost);
  r.providerFinalStatus = gen.cancelled === true ? "cancelled" : safeToken(gen.finish_reason) ?? safeToken(gen.native_finish_reason);
  r.evidence.push(`generation.cancelled=${gen.cancelled === true}`);
  if (gen.cancelled === true) return { ...r, outcome: "cancelled_upstream_confirmed" as const };
  if (s.finished || r.providerFinalStatus) return { ...r, outcome: "already_completed" as const };
  return { ...r, outcome: "connection_aborted_unconfirmed" as const };
}

// ---------------------------------------------------------------- Runner

export type RunOptions = {
  modes: ModeId[];
  live: boolean;
  confirmSpendUsd: number | null;
  totalBudgetUsd: number;
  /** Billable create requests already recorded in the ledger, per mode. */
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

export async function runHarness(o: RunOptions, d: Deps): Promise<{ admissions: Admission[]; results: ModeResult[] }> {
  const { admissions, totalWorstCaseUsd } = admit(o);
  if (!o.live) return { admissions, results: [] };
  if (o.confirmSpendUsd == null || o.confirmSpendUsd < totalWorstCaseUsd || o.confirmSpendUsd > o.totalBudgetUsd)
    throw new Error("Live run refused: --confirm-spend-usd must be >= worst case and <= total budget.");
  const results: ModeResult[] = [];
  for (const a of admissions) {
    if (!a.admitted) continue;
    const c = MODES[a.mode];
    const key = d.env(c.envKey);
    const t0 = d.now();
    if (!key) {
      results.push({ ...base(c), outcome: "unsupported", evidence: ["server secret not configured"], elapsedMs: 0 });
      continue;
    }
    const run =
      c.provider === "openai" ? runOpenAi : c.provider === "gemini" ? runGemini : c.provider === "xai" ? runXai : runOpenRouter;
    try {
      const r = await run(c, key, d);
      results.push({ ...r, elapsedMs: d.now() - t0 });
    } catch (e) {
      // No retry: a thrown request may still have been billed.
      results.push({
        ...base(c),
        billableCreateRequests: 1,
        outcome: "cancel_failed",
        evidence: [`error ${safeToken(e instanceof Error ? e.name : "") ?? "unknown"}`],
        elapsedMs: d.now() - t0,
      });
    }
  }
  return { admissions, results };
}
