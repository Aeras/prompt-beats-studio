import { useCallback, useEffect, useRef } from "react";

const DRAFT_PREFIX = "pb:draft:v1";
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type DraftEnvelope<T> = {
  version: 1;
  updatedAt: number;
  value: T;
};

export type DraftAutosaveOptions<T> = {
  ownerId: string | null | undefined;
  scope: string;
  enabled: boolean;
  value: T;
  onRestore: (value: T) => void;
  debounceMs?: number;
  maxAgeMs?: number;
  isEmpty?: (value: T) => boolean;
};

function storageKey(ownerId: string, scope: string) {
  return `${DRAFT_PREFIX}:${ownerId}:${scope}`;
}

export function draftFingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function clearAllDraftAutosaves(ownerId: string | null | undefined) {
  if (!ownerId || typeof window === "undefined") return;
  const prefix = `${DRAFT_PREFIX}:${ownerId}:`;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
  }
}

export function useDraftAutosave<T>({
  ownerId,
  scope,
  enabled,
  value,
  onRestore,
  debounceMs = 500,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  isEmpty,
}: DraftAutosaveOptions<T>) {
  const restoreRef = useRef(onRestore);
  const emptyRef = useRef(isEmpty);
  const hydratedKeyRef = useRef<string | null>(null);

  restoreRef.current = onRestore;
  emptyRef.current = isEmpty;

  const key = ownerId ? storageKey(ownerId, scope) : null;

  useEffect(() => {
    if (!key || typeof window === "undefined") return;
    if (!enabled) {
      window.localStorage.removeItem(key);
      hydratedKeyRef.current = key;
      return;
    }
    if (hydratedKeyRef.current === key) return;

    hydratedKeyRef.current = key;
    const raw = window.localStorage.getItem(key);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as DraftEnvelope<T>;
      if (parsed.version !== 1 || !Number.isFinite(parsed.updatedAt)) {
        window.localStorage.removeItem(key);
        return;
      }
      if (Date.now() - parsed.updatedAt > maxAgeMs) {
        window.localStorage.removeItem(key);
        return;
      }
      restoreRef.current(parsed.value);
    } catch {
      window.localStorage.removeItem(key);
    }
  }, [enabled, key, maxAgeMs]);

  useEffect(() => {
    if (!key || !enabled || typeof window === "undefined") return;
    if (hydratedKeyRef.current !== key) return;

    const timer = window.setTimeout(() => {
      if (emptyRef.current?.(value)) {
        window.localStorage.removeItem(key);
        return;
      }
      const envelope: DraftEnvelope<T> = { version: 1, updatedAt: Date.now(), value };
      try {
        window.localStorage.setItem(key, JSON.stringify(envelope));
      } catch {
        // Draft recovery is best-effort. A full/quota-limited browser store must not block editing.
      }
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [debounceMs, enabled, key, value]);

  return useCallback(() => {
    if (!key || typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  }, [key]);
}
