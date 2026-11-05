/** Shared UI/wire limits. The JSON importer remains bounded to 5,000 rows / 4 MiB. */
export const KINO_HISTORY_WINDOWS = [
  5, 10, 20, 50, 100, 200, 500, 1000, 5000, 20000, 50000, 100000,
] as const;
export const KINO_PICK_SIZES = Array.from({ length: 12 }, (_, i) => i + 1);

export const formatKinoCount = (value: number) => value.toLocaleString("el-GR");

/** Equal-width observed range, not rank/quartile: ties always share a level.
 * All-equal samples use level 0. Four possible levels need not all occur.
 * Integer cross-multiplication keeps exact boundary ties deterministic.
 */
export function kinoHeatmapLevels(counts: readonly number[]): Array<0 | 1 | 2 | 3> {
  if (
    counts.length !== 80 ||
    counts.some((count) => !Number.isSafeInteger(count) || count < 0 || count > 100000)
  )
    throw Error("invalid_heatmap_counts");
  const min = Math.min(...counts),
    range = Math.max(...counts) - min;
  return counts.map((count) =>
    range === 0 ? 0 : (Math.min(3, Math.floor((4 * (count - min)) / range)) as 0 | 1 | 2 | 3),
  );
}
