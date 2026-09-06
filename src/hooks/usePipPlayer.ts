import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  art: string | undefined;
  title: string | undefined;
  subtitle: string | undefined;
  playing: boolean;
  toggle: () => void;
  audioElement: HTMLAudioElement | null;
};

/**
 * HTML5 <audio> can't enter Picture-in-Picture, so we paint a realistic,
 * top-down turntable / vinyl record player onto a canvas, capture that as a
 * video stream, and put THAT video into PiP. The record spins only while the
 * track is playing and the tonearm (needle) sweeps from the outer edge toward
 * the center label in sync with playback progress.
 */
export function usePipPlayer({ art, title, subtitle, playing, toggle, audioElement }: Options) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const syncing = useRef(false);
  const playingRef = useRef(playing);
  const rotationRef = useRef(0);
  const [pipActive, setPipActive] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    setSupported(typeof document !== "undefined" && "pictureInPictureEnabled" in document);
  }, []);

  // Load cover art (crossOrigin so the canvas stays untainted / capturable).
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

  // Turntable draw loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = (canvas.width = 640);
    const H = (canvas.height = 360);
    const CX = W / 2;
    const CY = H / 2;
    const DISC_RADIUS = 138;
    const LABEL_RADIUS = 52;
    const CENTER_HOLE_RADIUS = 4;
    const PIVOT = { x: W - 52, y: 56 };

    const draw = () => {
      // Solid dark plinth/base.
      ctx.fillStyle = "#111111";
      ctx.fillRect(0, 0, W, H);

      // Subtle platter ring.
      ctx.beginPath();
      ctx.arc(CX, CY, DISC_RADIUS + 10, 0, Math.PI * 2);
      ctx.fillStyle = "#1a1a1a";
      ctx.fill();

      // Update rotation angle while playing.
      if (playingRef.current) {
        rotationRef.current += 0.025;
      }

      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(rotationRef.current);

      // Vinyl grooves.
      ctx.beginPath();
      ctx.arc(0, 0, DISC_RADIUS, 0, Math.PI * 2);
      const grooveGradient = ctx.createRadialGradient(0, 0, LABEL_RADIUS, 0, 0, DISC_RADIUS);
      grooveGradient.addColorStop(0, "#1c1c1c");
      grooveGradient.addColorStop(0.15, "#111111");
      grooveGradient.addColorStop(0.2, "#141414");
      grooveGradient.addColorStop(0.4, "#0f0f0f");
      grooveGradient.addColorStop(0.6, "#151515");
      grooveGradient.addColorStop(0.8, "#111111");
      grooveGradient.addColorStop(1, "#0a0a0a");
      ctx.fillStyle = grooveGradient;
      ctx.fill();

      // Fine groove rings.
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (let r = LABEL_RADIUS + 8; r < DISC_RADIUS - 8; r += 6) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Center label (clipped circle with cover art).
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, LABEL_RADIUS, 0, Math.PI * 2);
      ctx.clip();

      const img = imgRef.current;
      if (img && img.width > 0 && img.height > 0) {
        const scale = Math.max((LABEL_RADIUS * 2) / img.width, (LABEL_RADIUS * 2) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = "#222222";
        ctx.fillRect(-LABEL_RADIUS, -LABEL_RADIUS, LABEL_RADIUS * 2, LABEL_RADIUS * 2);
        ctx.fillStyle = "#666666";
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Center spindle hole.
      ctx.beginPath();
      ctx.arc(0, 0, CENTER_HOLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#111111";
      ctx.fill();

      // Highlight sheen on vinyl.
      ctx.beginPath();
      ctx.arc(0, 0, DISC_RADIUS, 0, Math.PI * 2);
      const sheen = ctx.createLinearGradient(-DISC_RADIUS, -DISC_RADIUS, DISC_RADIUS, DISC_RADIUS);
      sheen.addColorStop(0, "rgba(255,255,255,0.08)");
      sheen.addColorStop(0.5, "rgba(255,255,255,0)");
      sheen.addColorStop(1, "rgba(255,255,255,0.04)");
      ctx.fillStyle = sheen;
      ctx.fill();

      ctx.restore(); // undo disc rotation

      // Tonearm (needle) — time-synced from outer edge toward center label.
      const currentTime = audioElement?.currentTime ?? 0;
      const duration = audioElement?.duration && Number.isFinite(audioElement.duration) ? audioElement.duration : 0;
      const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

      // Needle tip sweeps from outer rim to inner label area.
      const startAngle = -Math.PI / 3; // -60°
      const endAngle = (-Math.PI * 2) / 3; // -120°
      const needleRadius = DISC_RADIUS - 10 - progress * (DISC_RADIUS - LABEL_RADIUS - 24);
      const needleAngle = startAngle + progress * (endAngle - startAngle);
      const tipX = CX + needleRadius * Math.cos(needleAngle);
      const tipY = CY + needleRadius * Math.sin(needleAngle);

      // Tonearm pivot assembly.
      ctx.fillStyle = "#2a2a2a";
      ctx.beginPath();
      ctx.arc(PIVOT.x, PIVOT.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#444444";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Tonearm line.
      ctx.strokeStyle = "#c0c0c0";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(PIVOT.x, PIVOT.y);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      // Inner accent line.
      ctx.strokeStyle = "#888888";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PIVOT.x, PIVOT.y);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      // Headshell / cartridge at the tip.
      const angleToTip = Math.atan2(tipY - PIVOT.y, tipX - PIVOT.x);
      ctx.save();
      ctx.translate(tipX, tipY);
      ctx.rotate(angleToTip);
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(-4, -8, 18, 16);
      ctx.fillStyle = "#d4af37"; // gold stylus
      ctx.beginPath();
      ctx.arc(12, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Counterweight at pivot.
      ctx.fillStyle = "#333333";
      ctx.beginPath();
      ctx.arc(PIVOT.x, PIVOT.y, 8, 0, Math.PI * 2);
      ctx.fill();

      // Track info overlay.
      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 20px system-ui, sans-serif";
      ctx.fillText(truncate(ctx, title ?? "", W - 120), 24, H - 38);
      if (subtitle) {
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.font = "400 14px system-ui, sans-serif";
        ctx.fillText(truncate(ctx, subtitle, W - 120), 24, H - 16);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [title, subtitle, audioElement]);

  // Keep the dummy video's state aligned with the audio element.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !pipActive) return;
    syncing.current = true;
    if (playing && video.paused) void video.play().catch(() => {});
    if (!playing && !video.paused) video.pause();
    const id = setTimeout(() => {
      syncing.current = false;
    }, 0);
    return () => clearTimeout(id);
  }, [playing, pipActive]);

  const onVideoPlay = useCallback(() => {
    if (syncing.current) return;
    if (!playingRef.current) toggle();
  }, [toggle]);

  const onVideoPause = useCallback(() => {
    if (syncing.current) return;
    if (playingRef.current) toggle();
  }, [toggle]);

  const togglePip = useCallback(async () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }
      if (!video.srcObject) {
        video.srcObject = canvas.captureStream(30);
      }
      video.muted = true;
      await video.play();
      await video.requestPictureInPicture();
    } catch {
      /* PiP unsupported or blocked */
    }
  }, []);

  // Native events (incl. play/pause from the OS PiP window).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnter = () => setPipActive(true);
    const onLeave = () => {
      setPipActive(false);
      video.pause();
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
  }, [onVideoPlay, onVideoPause]);

  return { canvasRef, videoRef, pipActive, supported, togglePip };
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}
