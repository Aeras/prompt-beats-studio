/**
 * Authoritative upstream cancellation for already-created background operations.
 * Server-only: API credentials and remote IDs must never be sent to the browser.
 *
 * This module does NOT turn an existing synchronous request into cancellable
 * background work. Callers must persist a remote ID before exposing "Stop",
 * and must fence late result writes in the database.
 */
import { usageEvidence } from "./ai-usage-evidence";
export type BackgroundProvider = "openai" | "gemini";
export type CancelOutcome =
  "cancelled_upstream_confirmed" | "already_completed" | "cancel_unconfirmed" | "cancel_failed";

export type CancelResult = {
  provider: BackgroundProvider;
  outcome: CancelOutcome;
  finalStatus: string | null;
  cancelHttpStatus: number | null;
  verifiedByGet: boolean;
  requestId: string;
};

type Dependencies = {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  polls?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  totalTimeoutMs?: number;
  onUsageObserved?:
    ((usage: import("./ai-usage.server").NormalizedUsage) => void | Promise<void>) | undefined;
};

const safeId = (s: string) => /^[A-Za-z0-9_.:-]{1,160}$/.test(s);
const statuses = new Set([
  "queued",
  "in_progress",
  "running",
  "pending",
  "cancelled",
  "completed",
  "failed",
  "incomplete",
  "expired",
]);

function statusOf(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const raw = (json as { status?: unknown }).status;
  return typeof raw === "string" && statuses.has(raw) ? raw : null;
}

async function readStatus(
  response: Response,
  observe?: Dependencies["onUsageObserved"],
): Promise<string | null> {
  if (!response.ok) return null;
  try {
    const payload: unknown = await response.json();
    const usage = usageEvidence(payload);
    if (usage) await observe?.(usage);
    return statusOf(payload);
  } catch {
    return null;
  }
}

export async function cancelBackgroundOperation(
  provider: BackgroundProvider,
  remoteId: string,
  secret: string,
  deps: Dependencies = {},
): Promise<CancelResult> {
  if (!safeId(remoteId)) throw new Error("Invalid remote operation identifier.");
  if (!secret) throw new Error("Provider secret missing.");
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const polls = Math.max(1, Math.min(deps.polls ?? 20, 30));
  const interval = Math.max(0, deps.pollIntervalMs ?? 500);
  const url =
    provider === "openai"
      ? `https://api.openai.com/v1/responses/${encodeURIComponent(remoteId)}`
      : `https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(remoteId)}`;
  const headers: Record<string, string> =
    provider === "openai" ? { authorization: `Bearer ${secret}` } : { "x-goog-api-key": secret };
  let cancelHttpStatus: number | null = null;
  let cancelFailed = false;
  let timedOut = false;
  const end = Date.now() + Math.max(1, Math.min(deps.totalTimeoutMs ?? 20000, 30000));
  const bounded = async <T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const remaining = end - Date.now();
    if (remaining <= 0) {
      timedOut = true;
      throw new Error("Cancellation deadline.");
    }
    const controller = new AbortController();
    const signal = deps.signal
      ? AbortSignal.any([controller.signal, deps.signal])
      : controller.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        run(signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => {
              timedOut = true;
              controller.abort();
              reject(new Error("Cancellation deadline."));
            },
            Math.min(remaining, Math.max(1, deps.requestTimeoutMs ?? 5000)),
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const cancel = await bounded(async (signal) => {
      const response = await fetchFn(`${url}/cancel`, {
        method: "POST",
        headers,
        signal,
      });
      await readStatus(response, deps.onUsageObserved);
      return response;
    });
    cancelHttpStatus = cancel.status;
    cancelFailed = !cancel.ok;
  } catch {
    cancelFailed = true;
  }

  // Independent GET is mandatory. A 200 from POST /cancel is not proof.
  for (let i = 0; i < polls; i++) {
    if (Date.now() >= end || deps.signal?.aborted) break;
    let status: string | null = null;
    let getOk = false;
    try {
      const observed = await bounded(async (signal) => {
        const res = await fetchFn(url, {
          method: "GET",
          headers,
          signal,
        });
        return { ok: res.ok, status: await readStatus(res, deps.onUsageObserved) };
      });
      getOk = observed.ok;
      status = observed.status;
    } catch {
      // A transient read error is inconclusive, never a successful cancel.
    }
    if (getOk && status === "cancelled")
      return {
        provider,
        outcome: "cancelled_upstream_confirmed",
        finalStatus: status,
        cancelHttpStatus,
        verifiedByGet: true,
        requestId: remoteId,
      };
    if (getOk && ["completed", "failed", "incomplete", "expired"].includes(status ?? ""))
      return {
        provider,
        outcome: "already_completed",
        finalStatus: status,
        cancelHttpStatus,
        verifiedByGet: true,
        requestId: remoteId,
      };
    if (i < polls - 1) {
      try {
        await bounded(async () => sleep(Math.min(interval, Math.max(0, end - Date.now()))));
      } catch {
        break;
      }
    }
  }
  return {
    provider,
    outcome: cancelFailed && !timedOut ? "cancel_failed" : "cancel_unconfirmed",
    finalStatus: null,
    cancelHttpStatus,
    verifiedByGet: false,
    requestId: remoteId,
  };
}
