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

export type RepeatMode = "off" | "all" | "one";
export type PlayerMode = "fixed" | "inline";

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
  shuffle: boolean;
  repeat: RepeatMode;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  playerMode: PlayerMode;
  setPlayerMode: (mode: PlayerMode) => void;
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
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const historyRef = useRef<string[]>([]);
  const playedRef = useRef<Set<string>>(new Set());

  // Restore lightweight UI preferences (no backend storage needed).
  useEffect(() => {
    try {
      setShuffle(localStorage.getItem("pb:shuffle") === "1");
      const r = localStorage.getItem("pb:repeat");
      if (r === "all" || r === "one" || r === "off") setRepeat(r);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((s) => {
      const nextVal = !s;
      try {
        localStorage.setItem("pb:shuffle", nextVal ? "1" : "0");
      } catch {
        /* ignore */
      }
      playedRef.current = new Set();
      historyRef.current = [];
      return nextVal;
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => {
      const nextVal: RepeatMode = r === "off" ? "all" : r === "all" ? "one" : "off";
      try {
        localStorage.setItem("pb:repeat", nextVal);
      } catch {
        /* ignore */
      }
      return nextVal;
    });
  }, []);

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

  const pickShuffled = useCallback(() => {
    if (queue.length === 0) return null;
    if (queue.length === 1) return queue[0] ?? null;
    let pool = queue.filter((t) => !playedRef.current.has(t.id) && t.id !== current?.id);
    if (pool.length === 0) {
      // Exhausted the queue — start a new shuffle cycle.
      playedRef.current = new Set(current ? [current.id] : []);
      pool = queue.filter((t) => t.id !== current?.id);
    }
    if (pool.length === 0) return current;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }, [queue, current]);

  const goTo = useCallback(
    (track: Track | null | undefined, pushHistory = true) => {
      if (!track) return;
      if (pushHistory && current) historyRef.current.push(current.id);
      playedRef.current.add(track.id);
      start(track);
    },
    [current, start],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!current || queue.length === 0) return;
      if (dir === -1) {
        if (shuffle) {
          const prevId = historyRef.current.pop();
          const prevTrack = prevId ? queue.find((t) => t.id === prevId) : null;
          if (prevTrack) {
            playedRef.current.add(prevTrack.id);
            start(prevTrack);
            return;
          }
        }
        const i = queue.findIndex((t) => t.id === current.id);
        goTo(queue[(Math.max(i, 0) - 1 + queue.length) % queue.length], false);
        return;
      }
      if (shuffle) {
        goTo(pickShuffled());
        return;
      }
      const i = queue.findIndex((t) => t.id === current.id);
      goTo(queue[(Math.max(i, 0) + 1) % queue.length]);
    },
    [current, queue, shuffle, pickShuffled, goTo, start],
  );

  // Auto-advance when a track ends, honouring repeat + shuffle.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnded = () => {
      if (!current) return;
      if (repeat === "one") {
        el.currentTime = 0;
        void el.play().catch(() => setPlaying(false));
        return;
      }
      if (queue.length === 0) return;
      if (shuffle) {
        goTo(pickShuffled());
        return;
      }
      const i = queue.findIndex((t) => t.id === current.id);
      const isLast = i === queue.length - 1 || i === -1;
      if (isLast) {
        if (repeat === "all") goTo(queue[0]);
        return; // repeat off: stop at the end
      }
      goTo(queue[i + 1]);
    };
    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [current, queue, shuffle, repeat, goTo, pickShuffled]);


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
      shuffle,
      repeat,
      toggleShuffle,
      cycleRepeat,
    }),
    [current, playing, position, duration, volume, play, toggle, step, seek, setVolume, audioElement, shuffle, repeat, toggleShuffle, cycleRepeat],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
