/**
 * Shared Web Audio graph for the global player.
 *
 * The AudioContext -> MediaElementSource -> Analyser -> destination graph is created
 * lazily, ONLY inside user-gesture handlers (play / PiP button), because browsers
 * suspend AudioContext until a gesture. If creation fails or the audio host does not
 * return CORS headers, we mark the graph as blocked and never touch the element's
 * output path, so plain <audio> playback keeps working with zero visualizer.
 */

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let hookedEl: HTMLAudioElement | null = null;
let blocked = false;

/** True once we know the audio host won't serve CORS-enabled media. */
export function markAudioGraphBlocked() {
  blocked = true;
}

export function isAudioGraphBlocked() {
  return blocked;
}

/**
 * Wire the analyser for the given element. Must be called from a click handler.
 * Never throws: any failure just leaves the app without a visualizer.
 */
export function ensureAudioGraph(el: HTMLAudioElement | null) {
  if (!el || blocked) return;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        blocked = true;
        return;
      }
      ctx = new Ctor();
    }
    if (hookedEl !== el) {
      // createMediaElementSource may only be called once per element.
      const source = ctx.createMediaElementSource(el);
      const node = ctx.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.8;
      source.connect(node);
      node.connect(ctx.destination);
      hookedEl = el;
      analyser = node;
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  } catch {
    // Element already captured elsewhere or Web Audio unavailable — playback is unaffected.
    blocked = true;
  }
}

/** Resume the context from a user gesture (Play button). Safe to call anytime. */
export function resumeAudioGraph() {
  try {
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Current analyser, or null when the graph is unavailable/blocked. */
export function getAnalyser() {
  return analyser;
}
