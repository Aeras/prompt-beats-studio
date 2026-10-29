import { useCallback, useRef, useState, type MutableRefObject, type SetStateAction } from "react";
import { trackMusicValue, type MusicTracker } from "@/lib/music-inspiration-generator-state";
import type { InspirationApplyField } from "@/lib/music-inspiration-apply.shared";
/** Narrow tracking for the seven music groups, not a global Generator event journal. */
export function useMusicInspirationState<T>(
  key: string,
  initial: T,
  group: InspirationApplyField,
  tracker: MutableRefObject<MusicTracker>,
): [T, (value: SetStateAction<T>) => void] {
  const [state, setState] = useState(initial),
    value = useRef(initial);
  if (!(key in tracker.current.values)) tracker.current.values[key] = initial;
  const set = useCallback(
    (next: SetStateAction<T>) => {
      const resolved =
        typeof next === "function" ? (next as (previous: T) => T)(value.current) : next;
      value.current = resolved;
      trackMusicValue(tracker.current, key, group, resolved);
      setState(resolved);
    },
    [key, group, tracker],
  );
  return [state, set];
}
