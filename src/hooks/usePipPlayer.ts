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

type PipGeometry = { width: number; height: number } | null;
type LayoutMode = "compact" | "expanded";

type RenderSize = {
  width: number;
  height: number;
  mode: LayoutMode;
};

const NATIVE_INSTANCE_ID = "promptbeats-native-player";
const TWO_PI = Math.PI * 2;
const VINYL_RAD_PER_SECOND = 0.72;
const COMPACT_WIDTH = 500;
const COMPACT_HEIGHT = 700;
const EXPANDED_WIDTH = 900;
const EXPANDED_HEIGHT = 600;
const EXPANDED_GEOMETRY_WIDTH = 360;

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

function renderSize(geometry: PipGeometry): RenderSize {
  const expanded = Boolean(geometry && geometry.width >= EXPANDED_GEOMETRY_WIDTH);
  if (expanded) return { width: EXPANDED_WIDTH, height: EXPANDED_HEIGHT, mode: "expanded" };
  return { width: COMPACT_WIDTH, height: COMPACT_HEIGHT, mode: "compact" };
}

/**
 * PB-011 isolated Family A proof renderer.
 * It intentionally approximates the selected Neon Graphite Compact/Expanded design while
 * remaining a proof harness rather than the final production implementation.
 */
export function usePipPlayer({ title, subtitle, playing, audioElement }: Options) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pipResizeCleanupRef = useRef<(() => void) | null>(null);
  const carrierSyncRef = useRef(false);
  const playingRef = useRef(playing);
  const configRef = useRef<ProofConfig>(proofConfig());
  const renderCountRef = useRef(0);
  const lastRenderAtRef = useRef<number | null>(null);
  const longestGapRef = useRef(0);
  const lastModeRef = useRef<LayoutMode>("compact");
  const [pipActive, setPipActive] = useState(false);
  const [supported, setSupported] = useState(false);
  const [pipGeometry, setPipGeometry] = useState<PipGeometry>(null);

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

    const size = renderSize(pipGeometry);
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;

    if (lastModeRef.current !== size.mode) {
      console.info("[PB-011 proof] PiP layout mode", {
        mode: size.mode,
        geometry: pipGeometry,
        renderSize: `${size.width}x${size.height}`,
      });
      lastModeRef.current = size.mode;
    }

    const width = size.width;
    const height = size.height;
    const expanded = size.mode === "expanded";
    const scale = width / (expanded ? EXPANDED_WIDTH : COMPACT_WIDTH);
    const progress = playbackProgress(audioElement);
    const angle = vinylAngle(audioElement);

    const now = performance.now();
    const previous = lastRenderAtRef.current;
    if (previous !== null) {
      longestGapRef.current = Math.max(longestGapRef.current, now - previous);
    }
    lastRenderAtRef.current = now;
    renderCountRef.current += 1;

    drawNeonGraphiteBackground(ctx, width, height, expanded);

    const vinyl = expanded
      ? { x: width * 0.42, y: height * 0.43, radius: height * 0.33 }
      : { x: width * 0.5, y: height * 0.35, radius: width * 0.34 };

    drawVinyl(ctx, vinyl.x, vinyl.y, vinyl.radius, angle, logoRef.current, scale);
    drawTonearm(ctx, vinyl.x, vinyl.y, vinyl.radius, expanded, scale);
    drawBrandGlyph(ctx, width, height, expanded, scale);

    const creator = subtitle ? (subtitle.startsWith("@") ? subtitle : `@${subtitle}`) : "";
    const currentTime = audioElement?.currentTime ?? 0;
    const duration =
      audioElement?.duration && Number.isFinite(audioElement.duration) ? audioElement.duration : 0;

    if (expanded) {
      const textX = width * 0.07;
      const titleY = height * 0.78;
      ctx.textAlign = "left";
      ctx.fillStyle = "#f8fafc";
      ctx.font = "700 34px sans-serif";
      ctx.fillText(truncate(ctx, title ?? "", width * 0.45), textX, titleY);
      if (creator) {
        ctx.fillStyle = "#a8b2c7";
        ctx.font = "24px sans-serif";
        ctx.fillText(truncate(ctx, creator, width * 0.42), textX, titleY + 34);
      }
      drawProgress(
        ctx,
        width * 0.07,
        height * 0.9,
        width * 0.86,
        7,
        progress,
        formatTime(currentTime),
        formatTime(duration),
        18,
      );
    } else {
      const titleY = height * 0.73;
      ctx.textAlign = "center";
      ctx.fillStyle = "#f8fafc";
      ctx.font = "700 29px sans-serif";
      ctx.fillText(truncate(ctx, title ?? "", width * 0.84), width / 2, titleY);
      if (creator) {
        ctx.fillStyle = "#a8b2c7";
        ctx.font = "19px sans-serif";
        ctx.fillText(truncate(ctx, creator, width * 0.78), width / 2, titleY + 32);
      }
      drawProgress(
        ctx,
        width * 0.09,
        height * 0.86,
        width * 0.82,
        6,
        progress,
        formatTime(currentTime),
        formatTime(duration),
        15,
      );
    }
  }, [audioElement, pipGeometry, subtitle, title]);

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

  const cleanupPipWindow = useCallback(() => {
    pipResizeCleanupRef.current?.();
    pipResizeCleanupRef.current = null;
    setPipGeometry(null);
  }, []);

  const closeProofSession = useCallback(() => {
    stopSchedulers();
    cleanupPipWindow();
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
  }, [cleanupPipWindow, disposeStream, stopSchedulers]);

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
      const pipWindow = await video.requestPictureInPicture();
      const updateGeometry = () => {
        setPipGeometry({ width: pipWindow.width, height: pipWindow.height });
      };
      updateGeometry();
      pipWindow.addEventListener("resize", updateGeometry);
      pipResizeCleanupRef.current = () => pipWindow.removeEventListener("resize", updateGeometry);
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

function drawNeonGraphiteBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  expanded: boolean,
) {
  ctx.clearRect(0, 0, width, height);

  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#101827");
  base.addColorStop(0.45, "#080d19");
  base.addColorStop(1, "#030711");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const cyanGlow = ctx.createRadialGradient(
    width * (expanded ? 0.36 : 0.28),
    height * 0.24,
    0,
    width * (expanded ? 0.36 : 0.28),
    height * 0.24,
    width * 0.48,
  );
  cyanGlow.addColorStop(0, "rgba(0,210,255,0.18)");
  cyanGlow.addColorStop(1, "rgba(0,210,255,0)");
  ctx.fillStyle = cyanGlow;
  ctx.fillRect(0, 0, width, height);

  const magentaGlow = ctx.createRadialGradient(
    width * 0.83,
    height * 0.64,
    0,
    width * 0.83,
    height * 0.64,
    width * 0.42,
  );
  magentaGlow.addColorStop(0, "rgba(211,56,255,0.14)");
  magentaGlow.addColorStop(1, "rgba(211,56,255,0)");
  ctx.fillStyle = magentaGlow;
  ctx.fillRect(0, 0, width, height);

  const border = ctx.createLinearGradient(0, 0, width, 0);
  border.addColorStop(0, "rgba(210,77,255,0.88)");
  border.addColorStop(0.48, "rgba(56,154,255,0.9)");
  border.addColorStop(1, "rgba(0,220,255,0.82)");
  ctx.strokeStyle = border;
  ctx.lineWidth = expanded ? 3 : 2.5;
  ctx.beginPath();
  ctx.roundRect(7, 7, width - 14, height - 14, expanded ? 34 : 28);
  ctx.stroke();
}

function drawVinyl(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  angle: number,
  logo: HTMLImageElement | null,
  scale: number,
) {
  ctx.save();
  ctx.shadowColor = "rgba(24,179,255,0.6)";
  ctx.shadowBlur = 22 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4 * scale, 0, TWO_PI);
  const rim = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  rim.addColorStop(0, "#8f3cff");
  rim.addColorStop(0.44, "#13bdf7");
  rim.addColorStop(0.72, "#2b7cff");
  rim.addColorStop(1, "#f147d4");
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  const record = ctx.createRadialGradient(0, 0, radius * 0.05, 0, 0, radius);
  record.addColorStop(0, "#131726");
  record.addColorStop(0.38, "#090b12");
  record.addColorStop(0.78, "#020307");
  record.addColorStop(1, "#000104");
  ctx.fillStyle = record;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TWO_PI);
  ctx.fill();

  for (let index = 1; index <= 11; index += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, radius * (0.34 + index * 0.052), 0, TWO_PI);
    ctx.strokeStyle = index % 2 === 0 ? "rgba(180,198,235,0.16)" : "rgba(255,255,255,0.08)";
    ctx.lineWidth = Math.max(0.8, scale);
    ctx.stroke();
  }

  const sheen = ctx.createLinearGradient(-radius, -radius, radius, radius);
  sheen.addColorStop(0, "rgba(120,164,255,0)");
  sheen.addColorStop(0.44, "rgba(151,183,255,0.2)");
  sheen.addColorStop(0.53, "rgba(255,114,212,0.09)");
  sheen.addColorStop(0.64, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.96, 0, TWO_PI);
  ctx.fill();

  // A subtle cyan dot is retained as the proof rotation marker, integrated into the design.
  ctx.fillStyle = "#20d9ff";
  ctx.shadowColor = "#20d9ff";
  ctx.shadowBlur = 9 * scale;
  ctx.beginPath();
  ctx.arc(radius * 0.76, 0, 4.5 * scale, 0, TWO_PI);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();

  const labelRadius = radius * 0.31;
  const labelGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, labelRadius * 1.25);
  labelGlow.addColorStop(0, "rgba(28,37,67,0.95)");
  labelGlow.addColorStop(0.72, "rgba(6,8,17,0.98)");
  labelGlow.addColorStop(1, "rgba(0,209,255,0.35)");
  ctx.fillStyle = labelGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, labelRadius * 1.08, 0, TWO_PI);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, labelRadius, 0, TWO_PI);
  ctx.clip();
  if (logo && logo.width > 0 && logo.height > 0) {
    const fit = Math.min((labelRadius * 1.72) / logo.width, (labelRadius * 1.72) / logo.height);
    const drawWidth = logo.width * fit;
    const drawHeight = logo.height * fit;
    ctx.drawImage(logo, cx - drawWidth / 2, cy - drawHeight / 2, drawWidth, drawHeight);
  } else {
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(cx - labelRadius, cy - labelRadius, labelRadius * 2, labelRadius * 2);
    const wordmark = ctx.createLinearGradient(cx - labelRadius, 0, cx + labelRadius, 0);
    wordmark.addColorStop(0, "#24d9ff");
    wordmark.addColorStop(1, "#ea4bff");
    ctx.fillStyle = wordmark;
    ctx.font = `700 ${Math.round(labelRadius * 0.38)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PB", cx, cy);
  }
  ctx.restore();
}

function drawTonearm(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  expanded: boolean,
  scale: number,
) {
  const pivotX = expanded ? cx + radius * 1.22 : cx + radius * 0.88;
  const pivotY = cy - radius * 0.93;
  const elbowX = cx + radius * 0.86;
  const elbowY = cy + radius * 0.08;
  const tipX = cx + radius * 0.48;
  const tipY = cy + radius * 0.62;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 12 * scale;
  ctx.strokeStyle = "#171d29";
  ctx.lineWidth = 13 * scale;
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(elbowX, elbowY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  const metal = ctx.createLinearGradient(pivotX, pivotY, tipX, tipY);
  metal.addColorStop(0, "#f5f7ff");
  metal.addColorStop(0.22, "#606a7e");
  metal.addColorStop(0.55, "#e1e6f0");
  metal.addColorStop(1, "#5a6374");
  ctx.strokeStyle = metal;
  ctx.lineWidth = 6 * scale;
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(elbowX, elbowY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.fillStyle = "#b9c2d2";
  ctx.strokeStyle = "#0b0e15";
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.roundRect(tipX - 18 * scale, tipY - 9 * scale, 34 * scale, 20 * scale, 4 * scale);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBrandGlyph(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  expanded: boolean,
  scale: number,
) {
  const x = width * (expanded ? 0.91 : 0.87);
  const y = height * (expanded ? 0.13 : 0.095);
  const barWidth = 5 * scale;
  const gap = 8 * scale;
  const heights = [18, 30, 42, 30, 18].map((value) => value * scale);
  const gradient = ctx.createLinearGradient(x - 20 * scale, y, x + 20 * scale, y);
  gradient.addColorStop(0, "#9b51ff");
  gradient.addColorStop(0.5, "#e24cff");
  gradient.addColorStop(1, "#30aaff");
  ctx.fillStyle = gradient;
  for (let index = 0; index < heights.length; index += 1) {
    const h = heights[index];
    ctx.beginPath();
    ctx.roundRect(x + (index - 2) * gap - barWidth / 2, y - h / 2, barWidth, h, barWidth / 2);
    ctx.fill();
  }
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
  labelSize: number,
) {
  ctx.fillStyle = "rgba(123,139,169,0.28)";
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, height / 2);
  ctx.fill();

  if (progress > 0) {
    const fill = ctx.createLinearGradient(x, 0, x + width, 0);
    fill.addColorStop(0, "#20d9ff");
    fill.addColorStop(0.55, "#4b9cff");
    fill.addColorStop(1, "#dc4cff");
    ctx.fillStyle = fill;
    ctx.shadowColor = "rgba(58,164,255,0.5)";
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(height, width * progress), height, height / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.fillStyle = "#8f9ab2";
  ctx.font = `${labelSize}px sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(elapsed, x, y + labelSize + 10);
  ctx.textAlign = "right";
  ctx.fillText(total, x + width, y + labelSize + 10);
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
