import { useCallback, useEffect, useRef, useState } from "react";

import logoAsset from "@/assets/logo.png.asset.json";
import { activateMedia } from "@/lib/media-coordinator";

type Options = {
  art: string | undefined;
  title: string | undefined;
  subtitle: string | undefined;
  playing: boolean;
  toggle: () => void;
  audioElement: HTMLAudioElement | null;
};

type ProofConfig = {
  fps: 8 | 10 | 12;
};

const NATIVE_INSTANCE_ID = "promptbeats-native-player";
const TWO_PI = Math.PI * 2;
const VINYL_RAD_PER_SECOND = 0.72;
const RENDER_WIDTH = 1000;
const RENDER_HEIGHT = 700;

function proofConfig(): ProofConfig {
  if (typeof window === "undefined") return { fps: 10 };
  const params = new URLSearchParams(window.location.search);
  const fpsRaw = Number(params.get("pbPipFps"));
  const fps: ProofConfig["fps"] = fpsRaw === 8 || fpsRaw === 12 ? fpsRaw : 10;
  return { fps };
}

function playbackProgress(audio: HTMLAudioElement | null) {
  if (!audio) return 0;
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  if (duration <= 0) return 0;
  return Math.min(1, Math.max(0, audio.currentTime / duration));
}

function vinylAngle(audio: HTMLAudioElement | null) {
  const angle = ((audio?.currentTime ?? 0) * VINYL_RAD_PER_SECOND) % TWO_PI;
  return angle < 0 ? angle + TWO_PI : angle;
}

/**
 * PB-011 isolated Family A proof renderer.
 * Single wide Neon Graphite layout based on the selected visual reference.
 * This is still proof-only code: it validates PiP animation/lifecycle, not final production polish.
 */
export function usePipPlayer({ title, subtitle, playing, audioElement }: Options) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const carrierSyncRef = useRef(false);
  const playingRef = useRef(playing);
  const configRef = useRef<ProofConfig>(proofConfig());
  const renderCountRef = useRef(0);
  const lastRenderAtRef = useRef<number | null>(null);
  const longestGapRef = useRef(0);
  const [pipActive, setPipActive] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    setSupported(
      typeof document !== "undefined" &&
        document.pictureInPictureEnabled === true &&
        typeof HTMLVideoElement !== "undefined" &&
        "requestPictureInPicture" in HTMLVideoElement.prototype,
    );
  }, []);

  useEffect(() => {
    const logo = new Image();
    logo.crossOrigin = "anonymous";
    logo.onload = () => {
      logoRef.current = logo;
    };
    logo.onerror = () => {
      logoRef.current = null;
    };
    logo.src = logoAsset.url;
    return () => {
      logo.onload = null;
      logo.onerror = null;
    };
  }, []);

  const stopSchedulers = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
  }, []);

  const disposeStream = useCallback(() => {
    const video = videoRef.current;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (video?.srcObject) video.srcObject = null;
  }, []);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    if (canvas.width !== RENDER_WIDTH) canvas.width = RENDER_WIDTH;
    if (canvas.height !== RENDER_HEIGHT) canvas.height = RENDER_HEIGHT;

    const width = RENDER_WIDTH;
    const height = RENDER_HEIGHT;
    const progress = playbackProgress(audioElement);
    const angle = vinylAngle(audioElement);

    const now = performance.now();
    const previous = lastRenderAtRef.current;
    if (previous !== null) {
      longestGapRef.current = Math.max(longestGapRef.current, now - previous);
    }
    lastRenderAtRef.current = now;
    renderCountRef.current += 1;

    drawPanel(ctx, width, height);

    const vinyl = {
      x: width * 0.51,
      y: height * 0.4,
      radius: height * 0.34,
    };

    drawKnob(ctx, width * 0.105, height * 0.125, 34);
    drawVinyl(ctx, vinyl.x, vinyl.y, vinyl.radius, angle, logoRef.current);
    drawTonearm(ctx, vinyl.x, vinyl.y, vinyl.radius);
    drawBrandGlyph(ctx, width * 0.885, height * 0.12);

    const creator = subtitle ? (subtitle.startsWith("@") ? subtitle.slice(1) : subtitle) : "";
    const currentTime = audioElement?.currentTime ?? 0;
    const duration =
      audioElement?.duration && Number.isFinite(audioElement.duration) ? audioElement.duration : 0;

    const textX = width * 0.075;
    const titleY = height * 0.77;

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f7f9ff";
    ctx.font = "700 39px system-ui, sans-serif";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 6;
    ctx.fillText(truncate(ctx, title ?? "", width * 0.46), textX, titleY);

    if (creator) {
      ctx.fillStyle = "#b2b9d7";
      ctx.font = "400 29px system-ui, sans-serif";
      ctx.fillText(truncate(ctx, creator, width * 0.43), textX, titleY + 43);
    }
    ctx.shadowBlur = 0;

    drawProgress(
      ctx,
      width * 0.075,
      height * 0.895,
      width * 0.85,
      8,
      progress,
      formatTime(currentTime),
      formatTime(duration),
    );
  }, [audioElement, subtitle, title]);

  useEffect(() => {
    drawFrame();
  }, [drawFrame, playing]);

  useEffect(() => {
    stopSchedulers();
    if (!pipActive || !playing) {
      drawFrame();
      return;
    }

    const interval = 1000 / configRef.current.fps;
    let lastVisibleDraw = 0;

    const visibleTick = (timestamp: number) => {
      if (timestamp - lastVisibleDraw >= interval - 2) {
        drawFrame();
        lastVisibleDraw = timestamp;
      }
      rafRef.current = requestAnimationFrame(visibleTick);
    };

    const hiddenTick = () => {
      drawFrame();
      timerRef.current = window.setTimeout(hiddenTick, interval);
    };

    const startForVisibility = () => {
      stopSchedulers();
      if (!pipActive || !playingRef.current) {
        drawFrame();
        return;
      }
      if (document.visibilityState === "hidden") hiddenTick();
      else rafRef.current = requestAnimationFrame(visibleTick);
    };

    startForVisibility();
    document.addEventListener("visibilitychange", startForVisibility);
    return () => {
      document.removeEventListener("visibilitychange", startForVisibility);
      stopSchedulers();
    };
  }, [drawFrame, pipActive, playing, stopSchedulers]);

  const resumeRealAudio = useCallback(() => {
    const audio = audioElement;
    if (!audio || !audio.paused) return;
    activateMedia({ id: NATIVE_INSTANCE_ID, kind: "native" });
    void audio.play().catch(() => undefined);
  }, [audioElement]);

  const pauseRealAudio = useCallback(() => {
    const audio = audioElement;
    if (!audio || audio.paused) return;
    audio.pause();
  }, [audioElement]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    try {
      session.setActionHandler("play", resumeRealAudio);
      session.setActionHandler("pause", pauseRealAudio);
    } catch {
      return;
    }
    return () => {
      try {
        session.setActionHandler("play", null);
        session.setActionHandler("pause", null);
      } catch {
        // Media Session support varies by runtime.
      }
    };
  }, [pauseRealAudio, resumeRealAudio]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !pipActive) return;
    carrierSyncRef.current = true;
    if (playing && video.paused) void video.play().catch(() => undefined);
    if (!playing && !video.paused) video.pause();
    const id = window.setTimeout(() => {
      carrierSyncRef.current = false;
    }, 50);
    return () => window.clearTimeout(id);
  }, [playing, pipActive]);

  const onVideoPlay = useCallback(() => {
    if (carrierSyncRef.current) return;
    resumeRealAudio();
  }, [resumeRealAudio]);

  const onVideoPause = useCallback(() => {
    if (carrierSyncRef.current) return;
    pauseRealAudio();
  }, [pauseRealAudio]);

  const closeProofSession = useCallback(() => {
    stopSchedulers();
    const video = videoRef.current;
    if (video && !video.paused) {
      carrierSyncRef.current = true;
      video.pause();
      window.setTimeout(() => {
        carrierSyncRef.current = false;
      }, 50);
    }
    disposeStream();
    console.info("[PB-011 proof] session closed", {
      renders: renderCountRef.current,
      longestGapMs: Math.round(longestGapRef.current),
    });
    renderCountRef.current = 0;
    lastRenderAtRef.current = null;
    longestGapRef.current = 0;
  }, [disposeStream, stopSchedulers]);

  const togglePip = useCallback(async () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !supported) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }

      drawFrame();
      disposeStream();
      const stream = canvas.captureStream(configRef.current.fps);
      streamRef.current = stream;
      video.srcObject = stream;
      video.muted = true;
      carrierSyncRef.current = true;
      await video.play();
      await video.requestPictureInPicture();
      window.setTimeout(() => {
        carrierSyncRef.current = false;
      }, 50);
    } catch (error) {
      carrierSyncRef.current = false;
      disposeStream();
      console.warn("[PB-011 proof] PiP request failed", error);
    }
  }, [disposeStream, drawFrame, supported]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnter = () => {
      setPipActive(true);
      drawFrame();
    };
    const onLeave = () => {
      setPipActive(false);
      closeProofSession();
    };
    video.addEventListener("play", onVideoPlay);
    video.addEventListener("pause", onVideoPause);
    video.addEventListener("enterpictureinpicture", onEnter);
    video.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      video.removeEventListener("play", onVideoPlay);
      video.removeEventListener("pause", onVideoPause);
      video.removeEventListener("enterpictureinpicture", onEnter);
      video.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, [closeProofSession, drawFrame, onVideoPause, onVideoPlay]);

  useEffect(
    () => () => {
      closeProofSession();
    },
    [closeProofSession],
  );

  return { canvasRef, videoRef, pipActive, supported, togglePip };
}

function drawPanel(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.clearRect(0, 0, width, height);

  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#11182a");
  base.addColorStop(0.38, "#0a1020");
  base.addColorStop(0.72, "#070c17");
  base.addColorStop(1, "#040711");
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.roundRect(12, 12, width - 24, height - 24, 52);
  ctx.fill();

  const purpleGlow = ctx.createRadialGradient(
    width * 0.11,
    height * 0.72,
    0,
    width * 0.11,
    height * 0.72,
    width * 0.34,
  );
  purpleGlow.addColorStop(0, "rgba(179,45,255,0.34)");
  purpleGlow.addColorStop(0.45, "rgba(124,59,237,0.18)");
  purpleGlow.addColorStop(1, "rgba(124,59,237,0)");
  ctx.fillStyle = purpleGlow;
  ctx.beginPath();
  ctx.roundRect(12, 12, width - 24, height - 24, 52);
  ctx.fill();

  const blueGlow = ctx.createRadialGradient(
    width * 0.59,
    height * 0.05,
    0,
    width * 0.59,
    height * 0.05,
    width * 0.42,
  );
  blueGlow.addColorStop(0, "rgba(0,198,255,0.24)");
  blueGlow.addColorStop(0.52, "rgba(36,99,235,0.1)");
  blueGlow.addColorStop(1, "rgba(36,99,235,0)");
  ctx.fillStyle = blueGlow;
  ctx.beginPath();
  ctx.roundRect(12, 12, width - 24, height - 24, 52);
  ctx.fill();

  const rim = ctx.createLinearGradient(0, 0, width, 0);
  rim.addColorStop(0, "#dc4cff");
  rim.addColorStop(0.22, "#8f5dff");
  rim.addColorStop(0.5, "#31b9ff");
  rim.addColorStop(0.78, "#79a8ff");
  rim.addColorStop(1, "#ff45d7");
  ctx.strokeStyle = rim;
  ctx.lineWidth = 4;
  ctx.shadowColor = "rgba(68,150,255,0.75)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.roundRect(16, 16, width - 32, height - 32, 48);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(23, 23, width - 46, height - 46, 42);
  ctx.stroke();
}

function drawKnob(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(x, y, radius + 6, 0, TWO_PI);
  ctx.fillStyle = "rgba(4,8,18,0.95)";
  ctx.fill();
  ctx.shadowBlur = 0;

  const metal = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
  metal.addColorStop(0, "#dce6f5");
  metal.addColorStop(0.18, "#303949");
  metal.addColorStop(0.48, "#111827");
  metal.addColorStop(0.72, "#b7c2d7");
  metal.addColorStop(1, "#1b2434");
  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TWO_PI);
  ctx.fill();

  ctx.strokeStyle = "rgba(52,153,255,0.8)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawVinyl(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  angle: number,
  logo: HTMLImageElement | null,
) {
  ctx.save();
  ctx.shadowColor = "rgba(0,185,255,0.68)";
  ctx.shadowBlur = 24;
  const rim = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  rim.addColorStop(0, "#b24cff");
  rim.addColorStop(0.35, "#2f9dff");
  rim.addColorStop(0.6, "#12d6ff");
  rim.addColorStop(1, "#e44cff");
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 5, 0, TWO_PI);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  const record = ctx.createRadialGradient(
    -radius * 0.18,
    -radius * 0.22,
    radius * 0.04,
    0,
    0,
    radius,
  );
  record.addColorStop(0, "#283146");
  record.addColorStop(0.2, "#121722");
  record.addColorStop(0.48, "#080b12");
  record.addColorStop(0.8, "#030409");
  record.addColorStop(1, "#000104");
  ctx.fillStyle = record;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TWO_PI);
  ctx.fill();

  for (let index = 0; index < 18; index += 1) {
    const grooveRadius = radius * (0.34 + index * 0.034);
    ctx.beginPath();
    ctx.arc(0, 0, grooveRadius, 0, TWO_PI);
    ctx.strokeStyle = index % 3 === 0 ? "rgba(198,210,238,0.16)" : "rgba(255,255,255,0.07)";
    ctx.lineWidth = index % 4 === 0 ? 1.4 : 0.8;
    ctx.stroke();
  }

  const highlight = ctx.createLinearGradient(-radius, -radius * 0.65, radius, radius * 0.65);
  highlight.addColorStop(0, "rgba(67,122,255,0)");
  highlight.addColorStop(0.26, "rgba(140,178,255,0.22)");
  highlight.addColorStop(0.4, "rgba(255,255,255,0.08)");
  highlight.addColorStop(0.56, "rgba(255,89,200,0.10)");
  highlight.addColorStop(0.73, "rgba(255,255,255,0)");
  ctx.fillStyle = highlight;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.97, 0, TWO_PI);
  ctx.fill();

  ctx.fillStyle = "#25d9ff";
  ctx.shadowColor = "#25d9ff";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(radius * 0.79, 0, 4, 0, TWO_PI);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  const labelRadius = radius * 0.31;
  const labelRing = ctx.createLinearGradient(cx - labelRadius, cy, cx + labelRadius, cy);
  labelRing.addColorStop(0, "#20d9ff");
  labelRing.addColorStop(0.48, "#525cff");
  labelRing.addColorStop(1, "#e842ff");
  ctx.fillStyle = labelRing;
  ctx.beginPath();
  ctx.arc(cx, cy, labelRadius * 1.07, 0, TWO_PI);
  ctx.fill();

  ctx.fillStyle = "#060a14";
  ctx.beginPath();
  ctx.arc(cx, cy, labelRadius, 0, TWO_PI);
  ctx.fill();

  if (logo && logo.width > 0 && logo.height > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, labelRadius * 0.9, 0, TWO_PI);
    ctx.clip();
    const maxWidth = labelRadius * 1.6;
    const maxHeight = labelRadius * 1.6;
    const fit = Math.min(maxWidth / logo.width, maxHeight / logo.height);
    const drawWidth = logo.width * fit;
    const drawHeight = logo.height * fit;
    ctx.drawImage(logo, cx - drawWidth / 2, cy - drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  } else {
    const fallback = ctx.createLinearGradient(cx - labelRadius, cy, cx + labelRadius, cy);
    fallback.addColorStop(0, "#1ed8ff");
    fallback.addColorStop(0.55, "#b54cff");
    fallback.addColorStop(1, "#ff4fd1");
    ctx.fillStyle = fallback;
    ctx.font = "700 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PromptBeats", cx, cy);
  }
}

function drawTonearm(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  const pivotX = cx + radius * 1.18;
  const pivotY = cy - radius * 0.97;
  const bendX = cx + radius * 0.94;
  const bendY = cy + radius * 0.08;
  const tipX = cx + radius * 0.57;
  const tipY = cy + radius * 0.68;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 15;
  ctx.strokeStyle = "#0c111b";
  ctx.lineWidth = 17;
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(bendX, bendY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.shadowBlur = 0;

  const metal = ctx.createLinearGradient(pivotX, pivotY, tipX, tipY);
  metal.addColorStop(0, "#f4f6ff");
  metal.addColorStop(0.16, "#353e50");
  metal.addColorStop(0.42, "#d7dce8");
  metal.addColorStop(0.66, "#697487");
  metal.addColorStop(1, "#eef1f7");
  ctx.strokeStyle = metal;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(bendX, bendY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.fillStyle = "#d9dee8";
  ctx.strokeStyle = "#101621";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(tipX - 24, tipY - 11, 48, 25, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#151a24";
  for (let index = 0; index < 3; index += 1) {
    ctx.beginPath();
    ctx.arc(tipX - 12 + index * 12, tipY + 1, 2.4, 0, TWO_PI);
    ctx.fill();
  }

  const pivotGradient = ctx.createLinearGradient(
    pivotX - 25,
    pivotY - 25,
    pivotX + 25,
    pivotY + 25,
  );
  pivotGradient.addColorStop(0, "#f1f4f9");
  pivotGradient.addColorStop(0.35, "#2b3340");
  pivotGradient.addColorStop(0.7, "#0b0f16");
  pivotGradient.addColorStop(1, "#bfc7d4");
  ctx.fillStyle = pivotGradient;
  ctx.beginPath();
  ctx.roundRect(pivotX - 22, pivotY - 12, 44, 25, 9);
  ctx.fill();
  ctx.restore();
}

function drawBrandGlyph(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const heights = [24, 42, 61, 42, 24];
  const gradient = ctx.createLinearGradient(x - 34, y, x + 34, y);
  gradient.addColorStop(0, "#874cff");
  gradient.addColorStop(0.5, "#dd50ff");
  gradient.addColorStop(1, "#3ba5ff");
  ctx.fillStyle = gradient;
  ctx.shadowColor = "rgba(169,75,255,0.45)";
  ctx.shadowBlur = 9;
  for (const [index, h] of heights.entries()) {
    ctx.beginPath();
    ctx.roundRect(x + (index - 2) * 14 - 4, y - h / 2, 8, h, 4);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawProgress(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  elapsed: string,
  total: string,
) {
  ctx.fillStyle = "rgba(123,139,169,0.34)";
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, height / 2);
  ctx.fill();

  if (progress > 0) {
    const fill = ctx.createLinearGradient(x, 0, x + width, 0);
    fill.addColorStop(0, "#20d9ff");
    fill.addColorStop(0.48, "#4f8fff");
    fill.addColorStop(1, "#e24cff");
    ctx.fillStyle = fill;
    ctx.shadowColor = "rgba(44,160,255,0.55)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(height, width * progress), height, height / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.fillStyle = "#9ea8c3";
  ctx.font = "400 18px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(elapsed, x, y + 31);
  ctx.textAlign = "right";
  ctx.fillText(total, x + width, y + 31);
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let output = text;
  while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output}…`;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
