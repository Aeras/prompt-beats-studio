export type HomeResumeType = "project" | "song_universe" | "story_map" | "inspiration_wall";

export type HomeResumeItem = {
  type: HomeResumeType;
  id: string;
  title: string;
  recency: string;
};

export type HomeResumeResult = {
  items: HomeResumeItem[];
  failedSources: HomeResumeType[];
};

export function orderHomeResumeItems(items: readonly HomeResumeItem[]): HomeResumeItem[] {
  return [...items]
    .sort((a, b) => {
      const byRecency = b.recency.localeCompare(a.recency);
      if (byRecency !== 0) return byRecency;
      const byType = a.type.localeCompare(b.type);
      return byType !== 0 ? byType : b.id.localeCompare(a.id);
    })
    .slice(0, 4);
}
