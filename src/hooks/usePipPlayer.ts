import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  art?: string;
  title?: string;
  subtitle?: string;
  playing: boolean;
  toggle: () => void;
};

/**
 * HTML5 <audio> can't enter Picture-in-Picture, so we paint the cover art plus a
 * simple animated visualizer onto a canvas, capture that as a video stream, and
 * put THAT video into PiP. Play/pause from the OS PiP window is synced back.
 */
export function usePipPlayer({ art, title, subtitle, playing, toggle }: Options) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const syncing = useRef(false);
  const playingRef = useRef(playing);
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

  // Draw loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = (canvas.width = 640);
    const H = (canvas.height = 360);
    let t = 0;

    const draw = () => {
      t += 1;
      ctx.clearRect(0, 0, W, H);

      const img = imgRef.current;
      if (img) {
        // cover-fit the artwork
        const scale = Math.max(W / img.width, H / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        ctx.fillStyle = "rgba(8,8,12,0.55)";
        ctx.fillRect(0, 0, W, H);
      } else {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, "#0a0a0c");
        g.addColorStop(1, "#1a1030");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // Pulsing ring
      const pulse = playingRef.current ? 1 + Math.sin(t / 14) * 0.06 : 1;
      ctx.save();
      ctx.translate(W / 2, H / 2 - 18);
      ctx.beginPath();
      ctx.arc(0, 0, 54 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(168,85,247,0.85)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      // Bars
      const bars = 18;
      const bw = 8;
      const gap = 6;
      const totalW = bars * bw + (bars - 1) * gap;
      const startX = (W - totalW) / 2;
      for (let i = 0; i < bars; i++) {
        const seed = playingRef.current
          ? (Math.sin(t / (8 + (i % 5)) + i) + 1) / 2
          : 0.12;
        const bh = 8 + seed * 60;
        const x = startX + i * (bw + gap);
        const y = H - 58 - bh;
        const grad = ctx.createLinearGradient(0, y + bh, 0, y);
        grad.addColorStop(0, "#22c55e");
        grad.addColorStop(0.62, "#eab308");
        grad.addColorStop(1, "#ef4444");
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, bw, bh);
      }

      // Text
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 24px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(truncate(ctx, title ?? "", W - 60), W / 2, H - 26);
      if (subtitle) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "400 15px system-ui, sans-serif";
        ctx.fillText(truncate(ctx, subtitle, W - 60), W / 2, H - 6);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [title, subtitle]);

  // Keep the dummy video's state aligned with the audio element.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !pipActive) return;
    syncing.current = true;
    if (playing && video.paused) void video.play().catch(() => {});
    if (!playing && !video.paused) video.pause();
    // release the guard on the next tick, after the events fire
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
        video.srcObject = canvas.captureStream(24);
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
