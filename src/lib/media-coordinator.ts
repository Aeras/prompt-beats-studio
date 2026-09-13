/**
 * Coordinates independent provider iframes with PromptBeats' single native
 * audio element. It intentionally reports interaction, rather than claiming
 * to observe opaque third-party player state.
 */
export type MediaInstanceKind = "native" | "external";

type MediaActivation = { id: string; kind: MediaInstanceKind };

const ACTIVATE_EVENT = "promptbeats:media-activate";

export function activateMedia(instance: MediaActivation) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<MediaActivation>(ACTIVATE_EVENT, { detail: instance }));
}

export function subscribeToMediaActivation(listener: (activation: MediaActivation) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<MediaActivation>).detail);
  window.addEventListener(ACTIVATE_EVENT, handler);
  return () => window.removeEventListener(ACTIVATE_EVENT, handler);
}
