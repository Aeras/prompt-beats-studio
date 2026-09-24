const activeKeys = new Map<string, string>();

/** Keeps one UUID for a user action until it has either replayed or completed. */
export function getAuxiliaryRequestKey(scope: string) {
  const existing = activeKeys.get(scope);
  if (existing) return existing;
  const key = crypto.randomUUID();
  activeKeys.set(scope, key);
  return key;
}

export function completeAuxiliaryRequest(scope: string) {
  activeKeys.delete(scope);
}
