const activeKeys = new Map<string, string>();
const STORAGE_PREFIX = "promptbeats:auxiliary-request:";

function readStoredKey(scope: string) {
  try {
    const value = window.sessionStorage.getItem(`${STORAGE_PREFIX}${scope}`);
    return value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

function storeKey(scope: string, key: string | null) {
  try {
    if (key) window.sessionStorage.setItem(`${STORAGE_PREFIX}${scope}`, key);
    else window.sessionStorage.removeItem(`${STORAGE_PREFIX}${scope}`);
  } catch {
    // Browser storage is a convenience only; the server still enforces the key.
  }
}

/** Keeps one UUID for a user action until it has either replayed or completed. */
export function getAuxiliaryRequestKey(scope: string) {
  const existing = activeKeys.get(scope);
  if (existing) return existing;
  const key = readStoredKey(scope) ?? crypto.randomUUID();
  activeKeys.set(scope, key);
  storeKey(scope, key);
  return key;
}

export function completeAuxiliaryRequest(scope: string) {
  activeKeys.delete(scope);
  storeKey(scope, null);
}
