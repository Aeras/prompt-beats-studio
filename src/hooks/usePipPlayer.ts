import { useCallback, useEffect, useRef, useState } from "react";
import shellUrl from "@/assets/pip/shell.png";
import vinylUrl from "@/assets/pip/vinyl.png";
import labelUrl from "@/assets/pip/label.png";
import tonearmUrl from "@/assets/pip/tonearm.png";
import {
  advanceRotation,
  drawPipTurntable,
  PIP_HEIGHT,
  PIP_WIDTH,
  type PipAssets,
  type PipPlayback,
} from "@/lib/pip-turntable";

type Options = {
  // Caller compatibility only: song cover art is never drawn in PiP.
  art: string | undefined;
  title: string | undefined;
  subtitle: string | undefined;
  playing: boolean;
  toggle: () => void;
  audioElement: HTMLAudioElement | null;
};

function loadAssets(): Promise<Record<keyof PipAssets, HTMLImageElement>> {
  const entries = Object.entries({
    shell: shellUrl,
    vinyl: vinylUrl,
    label: labelUrl,
    tonearm: tonearmUrl,
  });
  return Promise.all(
    entries.map(
      ([key, url]) =>
        new Promise<[string, HTMLImageElement]>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve([key, image]);
          image.onerror = () => reject(new Error(`Unable to load PiP ${key}`));
          image.src = url;
        }),
    ),
  ).then((loaded) => Object.fromEntries(loaded) as Record<keyof PipAssets, HTMLImageElement>);
}

/** Hidden canvas -> video stream -> native PiP. No page-level visual component. */
export function usePipPlayer(options: Options) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const latest = useRef(options);
  const assetsRef = useRef<ReturnType<typeof loadAssets> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cleanupEvents = useRef<(() => void) | null>(null);
  const activeRef = useRef(false);
  const openingRef = useRef(false);
  const mountedRef = useRef(true);
  const expectedEvent = useRef<"play" | "pause" | null>(null);
  const [pipActive, setPipActive] = useState(false);
  const [supported, setSupported] = useState(false);

  const snapshot = useCallback((): PipPlayback => {
    const { audioElement, title, subtitle, playing } = latest.current;
    return {
      title: title ?? "",
      creator: subtitle ? (subtitle.startsWith("@") ? subtitle : `@${subtitle}`) : "",
      currentTime: audioElement?.currentTime ?? 0,
      duration: audioElement?.duration ?? 0,
      playing: audioElement ? !audioElement.paused && !audioElement.ended : playing,
    };
  }, []);
  const sendPlayback = useCallback(() => {
    workerRef.current?.postMessage({ type: "playback", playback: snapshot() });
  }, [snapshot]);
  const stopRendering = useCallback(() => {
    activeRef.current = false;
    workerRef.current?.terminate();
    workerRef.current = null;
    if (timerRef.current !== null) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      expectedEvent.current = "pause";
      video.pause();
      video.srcObject = null;
    }
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    setSupported(
      document.pictureInPictureEnabled === true &&
        typeof HTMLCanvasElement.prototype.captureStream === "function",
    );
    return () => {
      mountedRef.current = false;
      cleanupEvents.current?.();
      stopRendering();
    };
  }, [stopRendering]);
  useEffect(() => {
    latest.current = options;
    // Preload local assets only. Rendering does not start until PiP is requested.
    if (options.playing && !assetsRef.current) {
      assetsRef.current = loadAssets();
      void assetsRef.current.catch(() => {
        assetsRef.current = null;
      });
    }
    sendPlayback();
    const video = videoRef.current;
    if (!video || !activeRef.current) return;
    if (options.playing && video.paused) {
      expectedEvent.current = "play";
      void video.play().catch(() => {
        expectedEvent.current = null;
      });
    } else if (!options.playing && !video.paused) {
      expectedEvent.current = "pause";
      video.pause();
    }
  }, [options, sendPlayback]);
  useEffect(() => {
    const audio = options.audioElement;
    if (!audio) return;
    const events = [
      "timeupdate",
      "seeking",
      "seeked",
      "durationchange",
      "play",
      "pause",
      "ended",
      "ratechange",
    ];
    events.forEach((event) => audio.addEventListener(event, sendPlayback));
    return () => events.forEach((event) => audio.removeEventListener(event, sendPlayback));
  }, [options.audioElement, sendPlayback]);

  const togglePip = useCallback(async () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || openingRef.current) return;
    if (document.pictureInPictureElement === video) {
      await document.exitPictureInPicture();
      return;
    }
    if (!latest.current.audioElement || latest.current.audioElement.paused) return;
    openingRef.current = true;
    try {
      assetsRef.current ??= loadAssets();
      const assets = await assetsRef.current;
      if (!mountedRef.current) return;
      canvas.width = PIP_WIDTH;
      canvas.height = PIP_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("PiP canvas unavailable");
      const stream = canvas.captureStream(30);
      streamRef.current = stream;
      const captureTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
      const requestFrame = () => captureTrack?.requestFrame?.();
      drawPipTurntable(ctx, assets, snapshot(), 0);
      requestFrame();
      video.srcObject = stream;
      video.muted = true;
      cleanupEvents.current?.();
      const onPlayback = (event: Event) => {
        if (expectedEvent.current === event.type) {
          expectedEvent.current = null;
          return;
        }
        if (!activeRef.current || document.pictureInPictureElement !== video) return;
        const playing = snapshot().playing;
        if ((event.type === "play" && !playing) || (event.type === "pause" && playing))
          latest.current.toggle();
      };
      const onLeave = () => {
        stopRendering();
        setPipActive(false);
      };
      video.addEventListener("play", onPlayback);
      video.addEventListener("pause", onPlayback);
      video.addEventListener("leavepictureinpicture", onLeave);
      cleanupEvents.current = () => {
        video.removeEventListener("play", onPlayback);
        video.removeEventListener("pause", onPlayback);
        video.removeEventListener("leavepictureinpicture", onLeave);
      };
      expectedEvent.current = "play";
      await video.play();
      await video.requestPictureInPicture();
      if (!mountedRef.current) {
        stopRendering();
        return;
      }
      activeRef.current = true;
      setPipActive(true);
      const startFallback = () => {
        workerRef.current?.terminate();
        workerRef.current = null;
        if (!activeRef.current || timerRef.current !== null) return;
        let rotation = 0;
        let previous = performance.now();
        timerRef.current = setInterval(() => {
          const now = performance.now();
          const state = snapshot();
          rotation = advanceRotation(rotation, (now - previous) / 1000, state.playing);
          previous = now;
          drawPipTurntable(ctx, assets, state, rotation);
          requestFrame();
        }, 1000 / 30);
      };
      // Worker paints OffscreenCanvas; main thread only presents the bitmap and samples
      // actual audio time. Only one unconsumed frame can be queued. No foreground rAF.
      try {
        if (
          typeof Worker === "undefined" ||
          typeof OffscreenCanvas === "undefined" ||
          typeof createImageBitmap === "undefined"
        ) {
          startFallback();
          return;
        }
        const bitmaps = await Promise.all(
          Object.values(assets).map((image) => createImageBitmap(image)),
        );
        if (!activeRef.current || !mountedRef.current) {
          bitmaps.forEach((bitmap) => bitmap.close());
          return;
        }
        const worker = new Worker(new URL("../lib/pip-render.worker.ts", import.meta.url), {
          type: "module",
        });
        workerRef.current = worker;
        worker.onerror = (event) => {
          event.preventDefault();
          startFallback();
        };
        worker.onmessage = (event: MessageEvent<{ type: string; frame: ImageBitmap }>) => {
          const frame = event.data.frame;
          if (activeRef.current) {
            ctx.drawImage(frame, 0, 0);
            requestFrame();
            worker.postMessage({ type: "consumed", playback: snapshot() });
          }
          frame.close();
        };
        worker.postMessage(
          {
            type: "init",
            assets: Object.fromEntries(
              Object.keys(assets).map((key, index) => [key, bitmaps[index]]),
            ),
          },
          bitmaps,
        );
        sendPlayback();
      } catch {
        startFallback();
      }
    } catch {
      stopRendering();
      if (mountedRef.current) setPipActive(false);
      // Unsupported/blocked PiP must not interrupt actual audio playback.
    } finally {
      openingRef.current = false;
    }
  }, [sendPlayback, snapshot, stopRendering]);
  return { canvasRef, videoRef, pipActive, supported, togglePip };
}
