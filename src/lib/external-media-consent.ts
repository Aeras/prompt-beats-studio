import { useEffect, useState } from "react";

export const EXTERNAL_MEDIA_CONSENT_KEY = "promptbeats:external-media-consent";
export const EXTERNAL_MEDIA_CONSENT_EVENT = "promptbeats:external-media-consent-change";

let externalMediaConsent = false;
const consentListeners = new Set<(enabled: boolean) => void>();

export function readExternalMediaConsent() {
  if (typeof window === "undefined") return false;
  externalMediaConsent = window.localStorage.getItem(EXTERNAL_MEDIA_CONSENT_KEY) === "enabled";
  return externalMediaConsent;
}

function broadcast(enabled: boolean) {
  externalMediaConsent = enabled;
  consentListeners.forEach((listener) => listener(enabled));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<boolean>(EXTERNAL_MEDIA_CONSENT_EVENT, { detail: enabled }));
  }
}

export function setExternalMediaConsent(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled) window.localStorage.setItem(EXTERNAL_MEDIA_CONSENT_KEY, "enabled");
  else window.localStorage.removeItem(EXTERNAL_MEDIA_CONSENT_KEY);
  broadcast(enabled);
}

export function useExternalMediaConsent() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(readExternalMediaConsent());
    consentListeners.add(setEnabled);
    const sync = (event: Event) => setEnabled(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener(EXTERNAL_MEDIA_CONSENT_EVENT, sync);
    return () => {
      consentListeners.delete(setEnabled);
      window.removeEventListener(EXTERNAL_MEDIA_CONSENT_EVENT, sync);
    };
  }, []);
  return {
    enabled,
    allow: () => setExternalMediaConsent(true),
    revoke: () => setExternalMediaConsent(false),
    setEnabled: setExternalMediaConsent,
  };
}
