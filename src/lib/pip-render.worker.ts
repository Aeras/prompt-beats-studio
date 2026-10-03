import {
  advanceRotation,
  drawPipTurntable,
  PIP_HEIGHT,
  PIP_WIDTH,
  type PipAssets,
  type PipPlayback,
} from "./pip-turntable";

// Not rAF: hidden documents commonly stop animation-frame callbacks.
// Browser/OS freezing can still suspend workers; this is not an OS keep-alive.
let assets: PipAssets | null = null;
let playback: PipPlayback | null = null;
let canvas: OffscreenCanvas | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let rotation = 0;
let lastFrame = performance.now();
let waitingForConsumer = false;

self.onmessage = (event: MessageEvent) => {
  const message = event.data;
  if (message.type === "init") {
    assets = message.assets;
    canvas = new OffscreenCanvas(PIP_WIDTH, PIP_HEIGHT);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PiP worker canvas unavailable");
    lastFrame = performance.now();
    timer = setInterval(() => {
      if (!canvas || !assets || !playback || waitingForConsumer) return;
      const now = performance.now();
      rotation = advanceRotation(rotation, (now - lastFrame) / 1000, playback.playing);
      lastFrame = now;
      drawPipTurntable(ctx, assets, playback, rotation);
      const frame = canvas.transferToImageBitmap();
      waitingForConsumer = true;
      self.postMessage({ type: "frame", frame }, { transfer: [frame] });
    }, 1000 / 30);
  } else if (message.type === "playback" || message.type === "consumed") {
    // Supplied from the actual HTMLAudioElement, not an independent audio clock.
    const now = performance.now();
    rotation = advanceRotation(rotation, (now - lastFrame) / 1000, playback?.playing ?? false);
    lastFrame = now;
    playback = message.playback;
    if (message.type === "consumed") waitingForConsumer = false;
  } else if (message.type === "stop") {
    if (timer !== null) clearInterval(timer);
    self.close();
  }
};
