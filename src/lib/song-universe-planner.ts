import type { SongUniverseType } from "@/lib/song-universe.shared";
import type {
  ProjectUniverseSummary,
  SongUniversePlannerContrast,
  SongUniverseUsageProfile,
} from "@/lib/song-universe-planner.shared";

export type SongUniverseStrategyProfile = {
  id: string;
  version: string;
  headline: string;
  priority: string;
  preserve: string[];
  diversify: string[];
  plannerQuestion: string;
  narrativeProgressionRequired: boolean;
};

export const SONG_UNIVERSE_STRATEGIES: Record<SongUniverseType, SongUniverseStrategyProfile> = {
  album: {
    id: "album",
    version: "album:v1",
    headline: "Preserve the artist, reinvent the song.",
    priority: "High artist continuity + high song diversity",
    preserve: [
      "musical identity",
      "production DNA",
      "vocal identity",
      "writing personality",
      "broad instrumentation identity",
      "overall aesthetic",
    ],
    diversify: [
      "lyrical theme",
      "narrative",
      "setting",
      "major imagery",
      "mood",
      "BPM range",
      "structure",
      "hook type",
      "dramatic angle",
      "point of view",
    ],
    plannerQuestion:
      "What is missing from this album without making it stop sounding like the same artist?",
    narrativeProgressionRequired: false,
  },
  ep: {
    id: "ep",
    version: "ep:v1",
    headline: "Preserve the creative period, explore different facets.",
    priority: "Medium-high thematic continuity + medium-high diversity",
    preserve: [
      "creative period",
      "overarching concept",
      "thematic family",
      "sonic cohesion",
      "artist identity",
    ],
    diversify: [
      "emotional stage",
      "narrative angle",
      "setting",
      "lyrical focus",
      "energy",
      "arrangement",
    ],
    plannerQuestion: "How can the next track explore a different facet of the same creative period?",
    narrativeProgressionRequired: false,
  },
  song_series: {
    id: "song_series",
    version: "song_series:v1",
    headline: "Continue the world, advance the story.",
    priority: "High narrative continuity + controlled song diversity",
    preserve: [
      "Story Canon",
      "characters",
      "relationships",
      "world rules",
      "timeline continuity",
      "relevant recurring symbols",
    ],
    diversify: [
      "central event",
      "scene",
      "dramatic beat",
      "emotional movement",
      "musical expression where appropriate",
    ],
    plannerQuestion:
      "What must happen next so the story advances instead of restating an already completed event?",
    narrativeProgressionRequired: true,
  },
  creative_era: {
    id: "creative_era",
    version: "creative_era:v1",
    headline: "Preserve the artistic identity, allow broad exploration.",
    priority: "Strong artist identity + broad exploration",
    preserve: [
      "production aesthetic",
      "vocal identity",
      "writing style",
      "genre family",
      "signature instrumentation",
    ],
    diversify: [
      "themes",
      "stories",
      "moods",
      "BPM",
      "arrangements",
      "structures",
      "narrative approaches",
    ],
    plannerQuestion:
      "How can the next track belong to the same creative era without being constrained by previous themes?",
    narrativeProgressionRequired: false,
  },
  other: {
    id: "other",
    version: "other:v1",
    headline: "Preserve meaningful identity while balancing continuity and exploration.",
    priority: "Balanced continuity + balanced diversity",
    preserve: ["core identity", "explicit user constraints"],
    diversify: ["overused content", "overused musical directions"],
    plannerQuestion: "What is the most useful next direction while preserving the Universe's core identity?",
    narrativeProgressionRequired: false,
  },
};

export function getSongUniverseStrategy(type: SongUniverseType) {
  return SONG_UNIVERSE_STRATEGIES[type];
}

const outlierWeight = (summary: ProjectUniverseSummary) => (summary.intentionalOutlier ? 0.25 : 1);

function usageLevel(weightedCount: number, totalComparable: number) {
  if (weightedCount <= 0 || totalComparable <= 0) return "unused" as const;
  const ratio = weightedCount / totalComparable;
  if (ratio <= 0.2) return "light" as const;
  if (ratio <= 0.45) return "moderate" as const;
  if (ratio <= 0.7) return "heavy" as const;
  return "saturated" as const;
}

function aggregate(
  summaries: ProjectUniverseSummary[],
  values: (summary: ProjectUniverseSummary) => string[],
) {
  const comparable = summaries.filter((summary) => values(summary).length > 0);
  const map = new Map<string, { label: string; count: number; weightedCount: number }>();
  for (const summary of comparable) {
    const seen = new Set<string>();
    for (const raw of values(summary)) {
      const label = raw.trim();
      if (!label) continue;
      const key = label.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const current = map.get(key) ?? { label, count: 0, weightedCount: 0 };
      current.count += 1;
      current.weightedCount += outlierWeight(summary);
      map.set(key, current);
    }
  }
  return [...map.values()]
    .map((item) => ({
      key: item.label,
      count: item.count,
      weightedCount: Number(item.weightedCount.toFixed(2)),
      totalComparable: comparable.length,
      level: usageLevel(item.weightedCount, comparable.length),
      source: "deterministic" as const,
    }))
    .sort((a, b) => b.weightedCount - a.weightedCount || a.key.localeCompare(b.key));
}

function bpmRange(bpm: number) {
  if (bpm < 70) return "<70 BPM";
  if (bpm <= 85) return "70–85 BPM";
  if (bpm <= 100) return "86–100 BPM";
  if (bpm <= 115) return "101–115 BPM";
  if (bpm <= 130) return "116–130 BPM";
  return ">130 BPM";
}

export function buildDeterministicUsageProfile(
  summaries: ProjectUniverseSummary[],
): SongUniverseUsageProfile {
  return {
    trackCount: summaries.length,
    bpmRanges: aggregate(summaries, (summary) =>
      summary.bpm == null ? [] : [bpmRange(summary.bpm)],
    ),
    moods: aggregate(summaries, (summary) => (summary.mood ? [summary.mood] : [])),
    genres: aggregate(summaries, (summary) =>
      [summary.genre, summary.style].filter((value): value is string => Boolean(value)),
    ),
    structures: aggregate(summaries, (summary) =>
      summary.structure.length ? [summary.structure.join(" → ")] : [],
    ),
    instruments: aggregate(summaries, (summary) => summary.instruments),
    roles: aggregate(summaries, (summary) =>
      summary.universeRole ? [summary.universeRole] : [],
    ),
    themeFamilies: [],
    settingFamilies: [],
    motifFamilies: [],
  };
}

export function contrastInstruction(level: SongUniversePlannerContrast) {
  switch (level) {
    case "low":
      return "Stay relatively close to established songs while avoiding direct repetition.";
    case "high":
      return "Seek a strong but still identity-compatible contrast from existing songs.";
    default:
      return "Balance recognizable identity with active exploration of underused directions.";
  }
}

export const SONG_UNIVERSE_PLANNER_BASE_RULES = [
  "Shared artist identity does not mean repeated song content.",
  "Explicit current-song instructions override Universe recommendations.",
  "Facts and recommendations must remain distinct.",
  "Saturation is advisory, not a prohibition.",
  "Intentional outliers have reduced statistical influence but remain part of project memory.",
  "The Planner proposes direction; it does not write or mutate the song, Story Map, Project, or Creative Bible.",
  "Do not claim a pattern when source completeness is insufficient to support it.",
] as const;
