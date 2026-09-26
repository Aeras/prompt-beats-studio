const DEFAULT_PUBLIC_MESSAGE = "The action could not be completed. Please try again.";

function correlationId() {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `pb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Keep detailed infrastructure errors in server logs, not client responses. */
export function reportServerError(scope: string, error: unknown): string {
  const reference = correlationId();
  console.error(`[PromptBeats:${scope}] ${reference}`, error);
  return reference;
}

/**
 * Keep database/provider implementation details on the server boundary.
 * Expected validation and permission errors should still be thrown explicitly
 * by the caller; this helper is for unexpected infrastructure/data errors.
 */
export function throwSafeServerError(
  scope: string,
  error: unknown,
  publicMessage = DEFAULT_PUBLIC_MESSAGE,
): never {
  reportServerError(scope, error);
  throw new Error(publicMessage);
}
