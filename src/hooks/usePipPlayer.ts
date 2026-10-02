import { useCallback, useEffect, useRef, useState } from "react";
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
  width: 500 | 600 | 1000;
  height: 700 | 840 | 1400;
};

type PipGeometry = { width: number; height: number } | null;

const NATIVE_INSTANCE_ID = "promptbeats-native-player";
const TWO_PI = Math.PI * 2;
const VINYL_RAD_PER_SECOND = 0.72;

function proofConfig(): ProofConfig {
  if (typeof window === "undefined") return { fps: 10, width: 500, height: 700 };
  const params = new URLSearchParams(window.location.search);
  const fpsRaw = Number(params.get("pbPipFps"));
  const sizeRaw = Number(params.get("pbPipSize"));
  const fps: ProofConfig["fps"] = fpsRaw === 8 || fpsRaw === 12 ? fpsRaw : 10;
  if (sizeRaw === 600) return { fps, width: 600, height: 840 };
  if (sizeRaw === 1000) return { fps, width: 1000, height: 1400 };
  return { fps, width: 500, height: 700 };
}

function playbackProgress(audio: HTMLAudioElement | null) {
  if (!audio) return 0;
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  if (duration <= 0) return 0;
  return Math.min(1, Math.max(0, audio.currentTime / duration));
}

function vinylAngle(audio: HTMLAudioElement | null) {
  const seconds = audio?.currentTime ?? 0;
  return (seconds * VINYL_RAD_PER_SECOND) % TWO_PI;
}

/**
 * PB-011 isolated Family A proof renderer.
 *
 * This branch intentionally proves lifecycle, time-based motion, live progress,
 * system PiP play/pause synchronization and cleanup. It is NOT the final
 * Neon Graphite visual implementation and must not be merged as product code.
 */
export function usePipPlayer({ art, title, subtitle, playing, toggle, audioElement }: Options) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pipWindowRef = useRef<PictureInPictureWindow | null>(null);
  const pipResizeCleanupRef = useRef<(() => void) | null>(null);
  const carrierSyncRef = useRef(false);
  const playingRef = useRef(playing);
  const configRef = useRef<ProofConfig>(proofConfig());
  const renderCountRef = useRef(0);
  const lastRenderAtRef = useRef<number | null>(null);
  const longestGapRef = useRef(0);
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
    if (!art) {
      imgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
    };
    img.onerror = () => {
      imgRef.current = null;
    };
    img.src = art;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [art]);

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
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const config = configRef.current;
    if (canvas.width !== config.width) canvas.width = config.width;
    if (canvas.height !== config.height) canvas.height = config.height;

    const W = config.width;
    const H = config.height;
    const compact = Boolean(pipGeometry && pipGeometry.width > 0 && pipGeometry.width < 300);
    const scale = W / 500;
    const CX = W / 2;
    const CY = compact ? H * 0.36 : H * 0.38;
    const discRadius = Math.min(W * (compact ? 0.31 : 0.34), H * 0.26);
    const labelRadius = discRadius * 0.32;
    const progress = playbackProgress(audioElement);
    const angle = vinylAngle(audioElement);

    const now = performance.now();
    const previous = lastRenderAtRef.current;
    if (previous !== null) longestGapRef.current = Math.max(longestGapRef.current, now - previous);
    lastRenderAtRef.current = now;
    renderCountRef.current += 1;

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#111827");
    bg.addColorStop(1, "#020617");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.shadowColor = "rgba(34,211,238,0.28)";
    ctx.shadowBlur = 18 * scale;
    ctx.beginPath();
    ctx.arc(CX, CY, discRadius, 0, TWO_PI);
    ctx.fillStyle = "#050505";
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(angle);
    ctx.strokeStyle = "rgba(255,255,255,0.13)";
    ctx.lineWidth = Math.max(1, scale);
    for (let i = 1; i <= 4; i += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, labelRadius + ((discRadius - labelRadius) * i) / 5, 0, TWO_PI);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, labelRadius, 0, TWO_PI);
    ctx.clip();
    const img = imgRef.current;
    if (img && img.width > 0 && img.height > 0) {
      const imageScale = Math.max((labelRadius * 2) / img.width, (labelRadius * 2) / img.height);
      const drawW = img.width * imageScale;
      const drawH = img.height * imageScale;
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    } else {
      ctx.fillStyle = "#111827";
      ctx.fillRect(-labelRadius, -labelRadius, labelRadius * 2, labelRadius * 2);
      ctx.fillStyle = "#22d3ee";
      ctx.font = `${Math.round(24 * scale)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PB", 0, 0);
    }
    ctx.restore();

    // Temporary high-contrast proof marker so rotation is measurable on screen recordings.
    const markerRadius = discRadius * 0.78;
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(angle);
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(markerRadius, 0, 7 * scale, 0, TWO_PI);
    ctx.fill();
    ctx.restore();

    // Simplified tonearm: static identity cue only for this proof.
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 6 * scale;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(W * 0.86, H * 0.12);
    ctx.lineTo(W * 0.72, CY - discRadius * 0.35);
    ctx.stroke();

    const titleY = compact ? H * 0.69 : H * 0.70;
    ctx.textAlign = "center";
    ctx.fillStyle = "#f8fafc";
    ctx.font = `700 ${Math.round((compact ? 24 : 28) * scale)}px sans-serif`;
    ctx.fillText(truncate(ctx, title ?? "", W * 0.86), CX, titleY);
    if (subtitle) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = `${Math.round((compact ? 16 : 18) * scale)}px sans-serif`;
      const creator = subtitle.startsWith("@") ? subtitle : `@${subtitle}`;
      ctx.fillText(truncate(ctx, creator, W * 0.82), CX, titleY + 34 * scale);
    }

    const barX = W * 0.1;
    const barY = compact ? H * 0.82 : H * 0.84;
    const barW = W * 0.8;
    const barH = Math.max(5 * scale, 4);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, barH / 2);
    ctx.fill();
    if (progress > 0) {
      const fill = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      fill.addColorStop(0, "#22d3ee");
      fill.addColorStop(0.5, "#3b82f6");
      fill.addColorStop(1, "#d946ef");
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(barX, barY, Math.max(barH, barW * progress), barH, barH / 2);
      ctx.fill();
    }

    if (!compact) {
      const current = audioElement?.currentTime ?? 0;
      const duration = audioElement?.duration && Number.isFinite(audioElement.duration) ? audioElement.duration : 0;
      ctx.font = `${Math.round(13 * scale)}px monospace`;
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "left";
      ctx.fillText(formatTime(current), barX, barY + 28 * scale);
      ctx.textAlign = "right";
      ctx.fillText(formatTime(duration), barX + barW, barY + 28 * scale);
    }

    // Proof diagnostics; intentionally not part of production visual design.
    ctx.textAlign = "left";
    ctx.font = `${Math.round(11 * scale)}px monospace`;
    ctx.fillStyle = "rgba(148,163,184,0.75)";
    ctx.fillText(
      `PB-011 PROOF ${config.fps}fps ${config.width}x${config.height} ${document.visibilityState}`,
      W * 0.04,
      H * 0.965,
    );
  }, [audioElement, pipGeometry, subtitle, title]);

  // Draw exactly one preparation/current-state frame while PiP is inactive or paused.
  useEffect(() => {
    drawFrame();
  }, [art, drawFrame, playing]);

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
      if (document.visibilityState === "hidden") {
        hiddenTick();
      } else {
        rafRef.current = requestAnimationFrame(visibleTick);
      }
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
        // Media Session support can vary by runtime.
      }
    };
  }, [pauseRealAudio, resumeRealAudio]);

  // Keep the muted carrier video aligned with real audio without making it playback authority.
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
    pipWindowRef.current = null;
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
    if (typeof console !== "undefined") {
      console.info("[PB-011 proof] session closed", {
        renders: renderCountRef.current,
        longestGapMs: Math.round(longestGapRef.current),
      });
    }
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
      pipWindowRef.current = pipWindow;
      const updateGeometry = () => setPipGeometry({ width: pipWindow.width, height: pipWindow.height });
      updateGeometry();
      pipWindow.addEventListener("resize", updateGeometry);
      pipResizeCleanupRef.current = () => pipWindow.removeEventListener("resize", updateGeometry);
      window.setTimeout(() => {
        carrierSyncRef.current = false;
      }, 50);
    } catch (error) {
      carrierSyncRef.current = false;
      disposeStream();
      if (typeof console !== "undefined") console.warn("[PB-011 proof] PiP request failed", error);
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

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
