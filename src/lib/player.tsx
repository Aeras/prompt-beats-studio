import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { Track } from "@/lib/tracks";

type PlayerState = {
  current: Track | null;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  play: (track: Track, queue?: Track[]) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  audioElement: HTMLAudioElement | null;
};

const PlayerContext = createContext<PlayerState | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // One audio element for the whole app so playback survives navigation.
  useEffect(() => {
    const el = new Audio();
    el.preload = "metadata";
    el.volume = volume;
    audioRef.current = el;
    setAudioElement(el);

    const onTime = () => setPosition(el.currentTime);
    const onMeta = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    const onEnd = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnd);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.pause();
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      audioRef.current = null;
      setAudioElement(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback((track: Track) => {
    const el = audioRef.current;
    if (!el || !track.audioUrl) return;
    setCurrent(track);
    setPosition(0);
    el.src = track.audioUrl;
    void el.play().catch(() => setPlaying(false));
  }, []);

  const play = useCallback(
    (track: Track, nextQueue?: Track[]) => {
      if (nextQueue) setQueue(nextQueue.filter((t) => Boolean(t.audioUrl)));
      const el = audioRef.current;
      if (current && current.id === track.id && el) {
        if (el.paused) void el.play().catch(() => setPlaying(false));
        else el.pause();
        return;
      }
      start(track);
    },
    [current, start],
  );

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || !current) return;
    if (el.paused) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [current]);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!current || queue.length === 0) return;
      const i = queue.findIndex((t) => t.id === current.id);
      const target = queue[(Math.max(i, 0) + dir + queue.length) % queue.length];
      if (target) start(target);
    },
    [current, queue, start],
  );

  // Auto-advance to the next queued track.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnded = () => step(1);
    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [step]);

  const seek = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = seconds;
    setPosition(seconds);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  const value = useMemo<PlayerState>(
    () => ({
      current,
      playing,
      position,
      duration,
      volume,
      play,
      toggle,
      next: () => step(1),
      prev: () => step(-1),
      seek,
      setVolume,
      audioElement,
    }),
    [current, playing, position, duration, volume, play, toggle, step, seek, setVolume, audioElement],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
