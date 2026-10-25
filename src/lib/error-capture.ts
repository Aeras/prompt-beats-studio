import { safeErrorType } from "./safe-diagnostics";

// Retain the short-lived error reference for SSR correlation. Logging must never
// expand its message, stack or cause payload: upstream errors may echo secrets.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

// h3 may log Error objects itself. Keep only allowlisted category/status evidence
// rather than reconstructing sensitive provider bodies through their cause chain.
const CAUSE_DEPTH_LIMIT = 5;
const DESCRIPTION_LENGTH_LIMIT = 8_000;

export function describeError(error: unknown): string {
  const parts: Array<{ errorType: string; status?: number }> = [];
  let current: unknown = error;
  for (let depth = 0; depth < CAUSE_DEPTH_LIMIT && current != null; depth++) {
    const item: { errorType: string; status?: number } = { errorType: safeErrorType(current) };
    try {
      const value = current as { status?: unknown; statusCode?: unknown; cause?: unknown };
      const status = value.status ?? value.statusCode;
      if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599)
        item.status = status;
      current = value.cause;
    } catch {
      current = null;
    }
    parts.push(item);
  }
  return JSON.stringify(parts).slice(0, DESCRIPTION_LENGTH_LIMIT);
}

function isErrorLike(value: unknown): value is Error {
  return value instanceof Error;
}

// Wrap console.error so errors logged by any layer — including h3's internal
// unhandled-error logging — are correlated without serializing private detail.
const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const expanded = args.map((arg) => {
    if (!isErrorLike(arg)) return arg;
    record(arg);
    return describeError(arg);
  });
  originalConsoleError(...expanded);
};

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
