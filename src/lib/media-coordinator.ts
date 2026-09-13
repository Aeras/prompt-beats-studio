/** Coordinates native audio with opaque third-party iframes by focused iframe. */
export type MediaInstanceKind = "native" | "external";
type MediaActivation = { id: string; kind: MediaInstanceKind };
type ExternalIframe = { iframe: HTMLIFrameElement; sourceType: string; reset: () => void };

const ACTIVATE_EVENT = "promptbeats:media-activate";
const externalIframes = new Map<string, ExternalIframe>();
let observing = false;
let scheduled = false;
let activeExternalId: string | null = null;
let ignoredFocusedIframe: HTMLIFrameElement | null = null;
let fallbackTimer: number | null = null;

function resetExternalIframes(exceptId?: string) {
  for (const [id, entry] of externalIframes) if (id !== exceptId) entry.reset();
}

function checkFocusedIframe() {
  scheduled = false;
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  const activeElement = document.activeElement;
  if (activeElement === ignoredFocusedIframe) return;
  ignoredFocusedIframe = null;
  for (const [id, entry] of externalIframes) {
    if (entry.iframe === activeElement) {
      if (activeExternalId !== id) activateMedia({ id, kind: "external" });
      return;
    }
  }
}

function scheduleFocusedIframeCheck() {
  if (typeof window === "undefined" || scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    // Iframe focus can land after the blur event that follows a provider click.
    window.setTimeout(checkFocusedIframe, 0);
  });
}

function startObserving() {
  if (typeof window === "undefined" || observing) return;
  observing = true;
  window.addEventListener("blur", scheduleFocusedIframeCheck);
  window.addEventListener("focus", scheduleFocusedIframeCheck);
  document.addEventListener("focusin", scheduleFocusedIframeCheck);
  document.addEventListener("visibilitychange", scheduleFocusedIframeCheck);
  fallbackTimer = window.setInterval(checkFocusedIframe, 500);
}

function stopObserving() {
  if (typeof window === "undefined" || !observing) return;
  observing = false;
  window.removeEventListener("blur", scheduleFocusedIframeCheck);
  window.removeEventListener("focus", scheduleFocusedIframeCheck);
  document.removeEventListener("focusin", scheduleFocusedIframeCheck);
  document.removeEventListener("visibilitychange", scheduleFocusedIframeCheck);
  if (fallbackTimer !== null) window.clearInterval(fallbackTimer);
  fallbackTimer = null;
  scheduled = false;
  activeExternalId = null;
  ignoredFocusedIframe = null;
}

export function registerExternalIframe(id: string, entry: ExternalIframe) {
  if (typeof window === "undefined") return () => undefined;
  externalIframes.set(id, entry);
  startObserving();
  scheduleFocusedIframeCheck();
  return () => {
    if (externalIframes.get(id) === entry) externalIframes.delete(id);
    if (activeExternalId === id) activeExternalId = null;
    if (externalIframes.size === 0) stopObserving();
  };
}

export function activateMedia(instance: MediaActivation) {
  if (typeof window === "undefined") return;
  if (instance.kind === "external") {
    activeExternalId = instance.id;
    resetExternalIframes(instance.id);
  } else {
    activeExternalId = null;
    ignoredFocusedIframe = document.activeElement instanceof HTMLIFrameElement ? document.activeElement : null;
    resetExternalIframes();
  }
  window.dispatchEvent(new CustomEvent<MediaActivation>(ACTIVATE_EVENT, { detail: instance }));
}

export function subscribeToMediaActivation(listener: (activation: MediaActivation) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<MediaActivation>).detail);
  window.addEventListener(ACTIVATE_EVENT, handler);
  return () => window.removeEventListener(ACTIVATE_EVENT, handler);
}
