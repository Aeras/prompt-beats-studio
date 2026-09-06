import { useCallback, useEffect, useRef, useState } from "react";
import { ensureAudioGraph, getAnalyser, resumeAudioGraph } from "@/lib/audioGraph";

type Options = {
  art: string | undefined;
  title: string | undefined;
  subtitle: string | undefined;
  playing: boolean;
  toggle: () => void;
  audioElement: HTMLAudioElement | null;
};

/**
 * HTML5 <audio> can't enter Picture-in-Picture, so we paint the cover art plus a
 * real-time retro hi-fi equalizer (Web Audio AnalyserNode -> canvas) onto a canvas,
 * capture that as a video stream, and put THAT video into PiP. Play/pause from the
 * OS PiP window is synced back to the real audio element.
 */
export function usePipPlayer({ art, title, subtitle, playing, toggle, audioElement }: Options) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const syncing = useRef(false);
  const playingRef = useRef(playing);
  const [pipActive, setPipActive] = useState(false);
  const [supported, setSupported] = useState(false);

  // Frequency buffer for the shared analyser (allocated lazily when available).
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

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

  // Draw loop: cover art background + retro hi-fi equalizer from live frequency data.
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
        ctx.fillStyle = "rgba(8,8,12,0.45)";
        ctx.fillRect(0, 0, W, H);
      } else {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, "#0a0a0c");
        g.addColorStop(1, "#1a1030");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // Live frequency data (or null if the analyser isn't wired yet / CORS-blocked).
      const analyser = getAnalyser();
      if (analyser && (!freqRef.current || freqRef.current.length !== analyser.frequencyBinCount)) {
        freqRef.current = new Uint8Array(analyser.frequencyBinCount);
      }
      const freq = analyser ? freqRef.current : null;
      let live: Uint8Array<ArrayBuffer> | null = null;
      if (analyser && freq) {
        analyser.getByteFrequencyData(freq);
        live = freq;
      }

      // Retro hi-fi equalizer: solid white vertical bars bouncing with the music.
      const bars = 24;
      const bw = 10;
      const gap = 6;
      const totalW = bars * bw + (bars - 1) * gap;
      const startX = (W - totalW) / 2;
      const maxH = 150;
      const baseline = H - 74;

      // Skip the lowest bins (rumble) and only use the musical range.
      const usable = live ? Math.floor(live.length * 0.72) : 0;

      for (let i = 0; i < bars; i++) {
        let level: number;
        if (live && playingRef.current && usable > 0) {
          const bin = Math.floor((i / bars) * usable) + 2;
          level = (live[Math.min(bin, live.length - 1)] ?? 0) / 255;
        } else {
          // Idle shimmer when paused or no analyser.
          level = playingRef.current ? 0.08 + ((Math.sin(t / (8 + (i % 5)) + i) + 1) / 2) * 0.1 : 0.06;
        }
        const bh = Math.max(3, level * maxH);
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
      // Wire/resume the analyser inside this user gesture so the AudioContext can run.
      ensureAudioGraph(audioElement);
      resumeAudioGraph();
      if (!video.srcObject) {
        video.srcObject = canvas.captureStream(30);
      }
      video.muted = true;
      await video.play();
      await video.requestPictureInPicture();
    } catch {
      /* PiP unsupported or blocked */
    }
  }, [ensureAudioGraph]);

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
