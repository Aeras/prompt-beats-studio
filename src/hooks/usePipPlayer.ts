import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  art: string | undefined;
  title: string | undefined;
  subtitle: string | undefined;
  playing: boolean;
  toggle: () => void;
  audioElement: HTMLAudioElement | null;
};

const BARS = 24;

/**
 * HTML5 <audio> can't enter Picture-in-Picture, so we paint the cover art plus a
 * fake retro equalizer (pure canvas math — no Web Audio, no CORS concerns) onto a
 * canvas, capture that as a video stream, and put THAT video into PiP. The bars
 * bounce only while the track is actually playing and rest at the bottom when
 * paused. Play/pause from the OS PiP window is synced back to the real audio.
 */
export function usePipPlayer({ art, title, subtitle, playing, toggle, audioElement }: Options) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const syncing = useRef(false);
  const playingRef = useRef(playing);
  // Per-bar animation state so motion looks organic instead of uniform noise.
  const levelsRef = useRef<number[]>(Array.from({ length: BARS }, () => 0.05));
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

  // Draw loop: cover art background + fake equalizer bars driven by simple math.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = (canvas.width = 640);
    const H = (canvas.height = 360);

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      const img = imgRef.current;
      if (img) {
        // cover-fit the artwork
        const scale = Math.max(W / img.width, H / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        ctx.fillStyle = "rgba(8,8,12,0.45)";
        ctx.fillRect(0, 0, W, H);
      } else {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, "#0a0a0c");
        g.addColorStop(1, "#1a1030");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // Fake hi-fi equalizer: solid white vertical bars. While playing, each bar
      // eases toward a fresh random target; when paused, everything settles to rest.
      const bw = 10;
      const gap = 6;
      const totalW = BARS * bw + (BARS - 1) * gap;
      const startX = (W - totalW) / 2;
      const maxH = 150;
      const baseline = H - 74;
      const isPlaying = playingRef.current;
      const levels = levelsRef.current;

      for (let i = 0; i < BARS; i++) {
        const rest = 0.06;
        const target = isPlaying ? 0.15 + Math.random() * 0.85 : rest;
        // Smooth easing so bars bounce instead of jittering.
        levels[i] = (levels[i] ?? rest) + (target - (levels[i] ?? rest)) * (isPlaying ? 0.35 : 0.12);
        const bh = Math.max(3, (levels[i] ?? rest) * maxH);
        const x = startX + i * (bw + gap);
        const y = baseline - bh;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, y, bw, bh);
        // Soft glow beneath the bars for the retro hi-fi look.
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(x, baseline, bw, 2);
      }

      // Text
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 24px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(truncate(ctx, title ?? "", W - 60), W / 2, H - 34);
      if (subtitle) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "400 15px system-ui, sans-serif";
        ctx.fillText(truncate(ctx, subtitle, W - 60), W / 2, H - 12);
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
