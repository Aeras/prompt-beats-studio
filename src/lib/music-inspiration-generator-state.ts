import type { AdvancedGeneratorSetup } from "./advanced-generator-setup";
import {
  INSPIRATION_APPLY_FIELDS,
  type InspirationApplyField,
} from "./music-inspiration-apply.shared";
export type MusicGeneratorFrame = {
  setup: AdvancedGeneratorSetup;
  versions: Record<InspirationApplyField, number>;
};
export function createMusicTracker() {
  return {
    versions: Object.fromEntries(INSPIRATION_APPLY_FIELDS.map((f) => [f, 0])) as Record<
      InspirationApplyField,
      number
    >,
    values: {} as Record<string, unknown>,
  };
}
export type MusicTracker = ReturnType<typeof createMusicTracker>;
/** Synchronous setter boundary: records even batched A→B→A, before React renders. */
export function trackMusicValue<T>(
  tracker: MusicTracker,
  key: string,
  group: InspirationApplyField,
  value: T,
): T {
  tracker.versions[group]++;
  tracker.values[key] = value;
  return value;
}
export function sameGeneratorFrame(a: MusicGeneratorFrame, b: MusicGeneratorFrame) {
  return (
    JSON.stringify(a.versions) === JSON.stringify(b.versions) &&
    JSON.stringify(a.setup) === JSON.stringify(b.setup)
  );
}
