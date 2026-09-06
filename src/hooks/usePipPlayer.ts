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
 * top-down turntable / vinyl record player onto a square canvas, capture that
 * as a video stream, and put THAT video into PiP. The record spins only while
 * the track is playing and the tonearm (needle) sweeps from the outer edge
 * toward the center label in sync with playback progress.
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

    // 1:1 square canvas guarantees a perfectly circular record.
    const W = (canvas.width = 640);
    const H = (canvas.height = 640);
    const minDim = Math.min(W, H);
    const CX = W / 2;
    const CY = H / 2;
    const DISC_RADIUS = Math.round(minDim * 0.45); // 90% of min dimension
    const LABEL_RADIUS = Math.round(DISC_RADIUS * 0.28);
    const CENTER_HOLE_RADIUS = 5;
    const PIVOT = { x: W - 54, y: 54 };

    const draw = () => {
      // Sleek light metallic deck background.
      const bgGradient = ctx.createLinearGradient(0, 0, W, H);
      bgGradient.addColorStop(0, "#E5E7EB");
      bgGradient.addColorStop(0.5, "#D1D5DB");
      bgGradient.addColorStop(1, "#9CA3AF");
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, W, H);

      // Subtle brushed-metal highlight across the deck.
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.ellipse(CX, CY * 0.35, W * 0.65, H * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Update rotation while playing.
      if (playingRef.current) {
        rotationRef.current += 0.018;
      }

      // --- Vinyl disc (with strong drop shadow) ---
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 10;
      ctx.beginPath();
      ctx.arc(CX, CY, DISC_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#0a0a0a";
      ctx.fill();
      ctx.restore();

      // Subtle outer rim highlight.
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, DISC_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // Spinning content: label, grooves, sheen.
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(rotationRef.current);

      // Concentric groove rings.
      ctx.strokeStyle = "#333333";
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const r = LABEL_RADIUS + (DISC_RADIUS - LABEL_RADIUS) * ((i + 1) / 6);
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
        ctx.fillStyle = "#1f1f1f";
        ctx.fillRect(-LABEL_RADIUS, -LABEL_RADIUS, LABEL_RADIUS * 2, LABEL_RADIUS * 2);
        ctx.fillStyle = "#555555";
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Center spindle hole.
      ctx.beginPath();
      ctx.arc(0, 0, CENTER_HOLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#111111";
      ctx.fill();

      // Glossy sheen across the vinyl.
      ctx.beginPath();
      ctx.arc(0, 0, DISC_RADIUS, 0, Math.PI * 2);
      const sheen = ctx.createLinearGradient(-DISC_RADIUS, -DISC_RADIUS, DISC_RADIUS, DISC_RADIUS);
      sheen.addColorStop(0, "rgba(255,255,255,0.08)");
      sheen.addColorStop(0.45, "rgba(255,255,255,0)");
      sheen.addColorStop(0.55, "rgba(255,255,255,0)");
      sheen.addColorStop(1, "rgba(255,255,255,0.04)");
      ctx.fillStyle = sheen;
      ctx.fill();

      ctx.restore(); // undo disc rotation

      // --- Tonearm (needle) ---
      const currentTime = audioElement?.currentTime ?? 0;
      const duration = audioElement?.duration && Number.isFinite(audioElement.duration) ? audioElement.duration : 0;
      const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

      // Needle tip sweeps from outer groove to inner groove area.
      const startAngle = -Math.PI / 4; // -45°
      const endAngle = (-Math.PI * 5) / 9; // -100°
      const outerR = DISC_RADIUS - 16;
      const innerR = LABEL_RADIUS + 34;
      const needleRadius = outerR - progress * (outerR - innerR);
      const needleAngle = startAngle + progress * (endAngle - startAngle);
      const tipX = CX + needleRadius * Math.cos(needleAngle);
      const tipY = CY + needleRadius * Math.sin(needleAngle);

      const armAngle = Math.atan2(tipY - PIVOT.y, tipX - PIVOT.x);
      const armLength = Math.hypot(tipX - PIVOT.x, tipY - PIVOT.y);

      // Pivot base (sleek metallic cylinder).
      const baseGradient = ctx.createRadialGradient(PIVOT.x - 4, PIVOT.y - 4, 4, PIVOT.x, PIVOT.y, 22);
      baseGradient.addColorStop(0, "#F3F4F6");
      baseGradient.addColorStop(0.5, "#9CA3AF");
      baseGradient.addColorStop(1, "#374151");
      ctx.beginPath();
      ctx.arc(PIVOT.x, PIVOT.y, 22, 0, Math.PI * 2);
      ctx.fillStyle = baseGradient;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pivot top highlight ring.
      ctx.beginPath();
      ctx.arc(PIVOT.x, PIVOT.y, 14, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Counterweight.
      ctx.save();
      ctx.translate(PIVOT.x, PIVOT.y);
      ctx.rotate(armAngle + Math.PI / 2);
      const cwGradient = ctx.createLinearGradient(-10, -26, 10, 14);
      cwGradient.addColorStop(0, "#4B5563");
      cwGradient.addColorStop(0.5, "#9CA3AF");
      cwGradient.addColorStop(1, "#1F2937");
      ctx.fillStyle = cwGradient;
      ctx.beginPath();
      ctx.roundRect(-10, -26, 20, 40, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Metallic tonearm (thick, with white highlight line).
      const armGradient = ctx.createLinearGradient(PIVOT.x, PIVOT.y, tipX, tipY);
      armGradient.addColorStop(0, "#6B7280");
      armGradient.addColorStop(0.5, "#E5E7EB");
      armGradient.addColorStop(1, "#4B5563");

      ctx.save();
      ctx.strokeStyle = armGradient;
      ctx.lineWidth = 11;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(PIVOT.x, PIVOT.y);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      // White metallic shine line.
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(PIVOT.x + Math.cos(armAngle + Math.PI / 2) * 2, PIVOT.y + Math.sin(armAngle + Math.PI / 2) * 2);
      ctx.lineTo(tipX + Math.cos(armAngle + Math.PI / 2) * 2, tipY + Math.sin(armAngle + Math.PI / 2) * 2);
      ctx.stroke();
      ctx.restore();

      // Headshell / cartridge (rectangular, resting on grooves).
      const headshellLen = 44;
      const headshellW = 16;
      ctx.save();
      ctx.translate(tipX, tipY);
      ctx.rotate(armAngle);
      // Cartridge body.
      const cartGradient = ctx.createLinearGradient(-headshellW / 2, 0, headshellW / 2, 0);
      cartGradient.addColorStop(0, "#111827");
      cartGradient.addColorStop(0.5, "#374151");
      cartGradient.addColorStop(1, "#1F2937");
      ctx.fillStyle = cartGradient;
      ctx.beginPath();
      ctx.roundRect(-headshellW / 2, -headshellLen / 2, headshellW, headshellLen, 5);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Stylus tip glow.
      ctx.shadowColor = "rgba(251,191,36,0.9)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#FBBF24";
      ctx.beginPath();
      ctx.arc(0, headshellLen / 2 + 3, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // --- Track info at bottom ---
      ctx.textAlign = "left";
      ctx.fillStyle = "#111111";
      ctx.font = "600 28px Inter, system-ui, sans-serif";
      ctx.shadowColor = "rgba(255,255,255,0.4)";
      ctx.shadowBlur = 8;
      ctx.fillText(truncate(ctx, title ?? "", W - 80), 40, H - 54);
      if (subtitle) {
        ctx.fillStyle = "rgba(17,17,17,0.78)";
        ctx.font = "400 18px Inter, system-ui, sans-serif";
        ctx.fillText(truncate(ctx, subtitle, W - 80), 40, H - 26);
      }
      ctx.shadowBlur = 0;

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
