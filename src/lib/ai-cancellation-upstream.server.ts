/**
 * Authoritative upstream cancellation for already-created background operations.
 * Server-only: API credentials and remote IDs must never be sent to the browser.
 *
 * This module does NOT turn an existing synchronous request into cancellable
 * background work. Callers must persist a remote ID before exposing "Stop",
 * and must fence late result writes in the database.
 */
export type BackgroundProvider = "openai" | "gemini";
export type CancelOutcome =
  | "cancelled_upstream_confirmed"
  | "already_completed"
  | "cancel_unconfirmed"
  | "cancel_failed";

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
};

const safeId = (s: string) => /^[A-Za-z0-9_.:-]{1,160}$/.test(s);
const statuses = new Set(["queued", "in_progress", "running", "pending", "cancelled", "completed", "failed", "incomplete", "expired"]);

function statusOf(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const raw = (json as { status?: unknown }).status;
  return typeof raw === "string" && statuses.has(raw) ? raw : null;
}

async function readStatus(response: Response): Promise<string | null> {
  if (!response.ok) return null;
  try {
    return statusOf(await response.json());
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
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const polls = Math.max(1, Math.min(deps.polls ?? 20, 30));
  const interval = Math.max(0, deps.pollIntervalMs ?? 500);
  const url = provider === "openai"
    ? `https://api.openai.com/v1/responses/${encodeURIComponent(remoteId)}`
    : `https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(remoteId)}`;
  const headers = provider === "openai"
    ? { authorization: `Bearer ${secret}` }
    : { "x-goog-api-key": secret };
  let cancelHttpStatus: number | null = null;
  let cancelFailed = false;
  try {
    const cancel = await fetchFn(`${url}/cancel`, {
      method: "POST",
      headers,
      signal: deps.signal,
    });
    cancelHttpStatus = cancel.status;
    cancelFailed = !cancel.ok;
  } catch {
    cancelFailed = true;
  }

  // Independent GET is mandatory. A 200 from POST /cancel is not proof.
  for (let i = 0; i < polls; i++) {
    let status: string | null = null;
    let getOk = false;
    try {
      const res = await fetchFn(url, { method: "GET", headers, signal: deps.signal });
      getOk = res.ok;
      status = await readStatus(res);
    } catch {
      // A transient read error is inconclusive, never a successful cancel.
    }
    if (getOk && status === "cancelled")
      return { provider, outcome: "cancelled_upstream_confirmed", finalStatus: status, cancelHttpStatus, verifiedByGet: true, requestId: remoteId };
    if (getOk && ["completed", "failed", "incomplete", "expired"].includes(status ?? ""))
      return { provider, outcome: "already_completed", finalStatus: status, cancelHttpStatus, verifiedByGet: true, requestId: remoteId };
    if (i < polls - 1) await sleep(interval);
  }
  return {
    provider,
    outcome: cancelFailed ? "cancel_failed" : "cancel_unconfirmed",
    finalStatus: null,
    cancelHttpStatus,
    verifiedByGet: false,
    requestId: remoteId,
  };
}
