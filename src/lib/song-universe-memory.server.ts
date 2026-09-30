import { generatorInputSnapshotSchema } from "@/lib/generator-revision.shared";
import { buildDeterministicUsageProfile } from "@/lib/song-universe-planner";
import {
  projectUniverseSummarySchema,
  type ProjectUniverseSummary,
  type SongUniverseSummaryCompleteness,
} from "@/lib/song-universe-planner.shared";
import {
  songUniverseCreativeBibleSchema,
  songUniverseStoryBibleSchema,
  type SongUniverseCreativeBible,
  type SongUniverseStoryBible,
  type SongUniverseType,
} from "@/lib/song-universe.shared";

export type SongUniverseMemoryUniverse = {
  id: string;
  title: string;
  description: string | null;
  universeType: SongUniverseType;
  creativeBible: SongUniverseCreativeBible;
  initialDirection: string | null;
  plannedTrackCount: number | null;
  arcDirection: string | null;
  storyBible: SongUniverseStoryBible;
  plannerContrast: "low" | "balanced" | "high";
  updatedAt: string;
};

export type SongUniverseProjectMemory = {
  universe: SongUniverseMemoryUniverse;
  summaries: ProjectUniverseSummary[];
  usageProfile: ReturnType<typeof buildDeterministicUsageProfile>;
  historyFingerprint: string;
  historyUpdatedAt: string;
  overallCompleteness: SongUniverseSummaryCompleteness;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayFromJson(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function unique(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function splitCustomList(value: string | null | undefined) {
  if (!value) return [];
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function compactExcerpt(value: string | null, max = 2600) {
  if (!value) return null;
  const normalized = value.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) return null;
  if (normalized.length <= max) return normalized;
  const side = Math.floor((max - 80) / 2);
  return `${normalized.slice(0, side)}\n… [excerpt shortened] …\n${normalized.slice(-side)}`;
}

function parseBpm(snapshot: unknown) {
  const parsed = generatorInputSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return null;
  const source = parsed.data;
  const candidates = [source.customBpm, source.bpmMode];
  for (const candidate of candidates) {
    const match = candidate.match(/\b(\d{2,3}(?:\.\d+)?)\b/);
    if (!match) continue;
    const bpm = Number(match[1]);
    if (Number.isFinite(bpm) && bpm >= 20 && bpm <= 300) return bpm;
  }
  return null;
}

function sourceCompleteness(availableSources: string[]): SongUniverseSummaryCompleteness {
  const score = new Set(availableSources).size;
  if (score >= 8) return "complete";
  if (score >= 6) return "good";
  if (score >= 3) return "partial";
  return "sparse";
}

function maxIso(values: Array<string | null | undefined>, fallback: string) {
  let result = fallback;
  let max = Date.parse(fallback) || 0;
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > max) {
      max = parsed;
      result = value;
    }
  }
  return result;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildFingerprint(universe: SongUniverseMemoryUniverse, summaries: ProjectUniverseSummary[]) {
  const payload = {
    universeId: universe.id,
    universeType: universe.universeType,
    updatedAt: universe.updatedAt,
    plannedTrackCount: universe.plannedTrackCount,
    arcDirection: universe.arcDirection,
    plannerContrast: universe.plannerContrast,
    creativeBible: universe.creativeBible,
    storyBible: universe.storyBible,
    projects: summaries.map((summary) => ({
      projectId: summary.projectId,
      versionId: summary.versionId,
      versionNumber: summary.versionNumber,
      position: summary.position,
      universeRole: summary.universeRole,
      intentionalOutlier: summary.intentionalOutlier,
      outlierPurpose: summary.outlierPurpose,
      versionUpdatedAt: summary.versionUpdatedAt,
      storyMapUpdatedAt: summary.storyMapUpdatedAt,
      updatedAt: summary.updatedAt,
    })),
  };
  return `su2:${fnv1a(stableStringify(payload))}`;
}

function overallCompleteness(summaries: ProjectUniverseSummary[]): SongUniverseSummaryCompleteness {
  if (summaries.length === 0) return "complete";
  const rank: Record<SongUniverseSummaryCompleteness, number> = {
    sparse: 0,
    partial: 1,
    good: 2,
    complete: 3,
  };
  const average =
    summaries.reduce((sum, summary) => sum + rank[summary.sourceCompleteness], 0) /
    summaries.length;
  if (average >= 2.5) return "complete";
  if (average >= 1.7) return "good";
  if (average >= 0.7) return "partial";
  return "sparse";
}

export async function loadSongUniverseProjectMemory(
  supabase: any,
  universeId: string,
  userId: string,
): Promise<SongUniverseProjectMemory> {
  const { data: universeRow, error: universeError } = await supabase
    .from("song_universes")
    .select(
      "id,title,description,universe_type,creative_bible,initial_direction,planned_track_count,arc_direction,story_bible,planner_contrast,updated_at",
    )
    .eq("id", universeId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (universeError) throw new Error(universeError.message);
  if (!universeRow) throw new Error("Song Universe not found.");

  const universe: SongUniverseMemoryUniverse = {
    id: universeRow.id,
    title: universeRow.title,
    description: universeRow.description ?? null,
    universeType: universeRow.universe_type,
    creativeBible: songUniverseCreativeBibleSchema.parse(universeRow.creative_bible ?? { items: [] }),
    initialDirection: universeRow.initial_direction ?? null,
    plannedTrackCount:
      typeof universeRow.planned_track_count === "number" ? universeRow.planned_track_count : null,
    arcDirection: universeRow.arc_direction ?? null,
    storyBible: songUniverseStoryBibleSchema.parse(universeRow.story_bible ?? {}),
    plannerContrast:
      universeRow.planner_contrast === "low" || universeRow.planner_contrast === "high"
        ? universeRow.planner_contrast
        : "balanced",
    updatedAt: universeRow.updated_at,
  };

  const { data: memberships, error: membershipError } = await supabase
    .from("song_universe_projects")
    .select(
      "id,project_id,position,universe_role,project_status,intentional_outlier,outlier_purpose,inherited_traits,context_snapshot_at,updated_at,prompt_projects!inner(id,name,user_id,updated_at)",
    )
    .eq("universe_id", universeId)
    .eq("prompt_projects.user_id", userId)
    .order("position", { ascending: true });
  if (membershipError) throw new Error(membershipError.message);

  const projectIds = (memberships ?? []).map((row: any) => row.project_id);
  if (projectIds.length === 0) {
    return {
      universe,
      summaries: [],
      usageProfile: buildDeterministicUsageProfile([]),
      historyFingerprint: buildFingerprint(universe, []),
      historyUpdatedAt: universe.updatedAt,
      overallCompleteness: "complete",
    };
  }

  const { data: versions, error: versionsError } = await supabase
    .from("saved_prompts")
    .select(
      "id,project_id,title,theme,genre,mood,language,tags,lyrics,note,version_number,generator_input_snapshot,updated_at",
    )
    .eq("user_id", userId)
    .in("project_id", projectIds)
    .order("version_number", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });
  if (versionsError) throw new Error(versionsError.message);

  const latestByProject = new Map<string, any>();
  for (const version of versions ?? []) {
    if (version.project_id && !latestByProject.has(version.project_id)) {
      latestByProject.set(version.project_id, version);
    }
  }

  const { data: storyMaps, error: storyError } = await supabase
    .from("story_maps")
    .select(
      "id,project_id,title,concept,theme,emotional_direction,narrator,point_of_view,desired_ending,progression_type,summary,starting_state,central_change,turning_point,resolution,source_project_version_id,updated_at",
    )
    .eq("user_id", userId)
    .in("project_id", projectIds);
  if (storyError) throw new Error(storyError.message);

  const storyIds = (storyMaps ?? []).map((story: any) => story.id);
  let storyBeats: any[] = [];
  if (storyIds.length > 0) {
    const { data, error } = await supabase
      .from("story_map_beats")
      .select(
        "story_map_id,position,title,what_happens,emotion,purpose,narrator_state,key_image,reveal,change_after_beat,is_key_beat,updated_at",
      )
      .in("story_map_id", storyIds)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    storyBeats = data ?? [];
  }

  const storyByProject = new Map<string, any>();
  for (const story of storyMaps ?? []) {
    if (story.project_id) storyByProject.set(story.project_id, story);
  }
  const beatsByStory = new Map<string, any[]>();
  for (const beat of storyBeats) {
    const list = beatsByStory.get(beat.story_map_id) ?? [];
    list.push(beat);
    beatsByStory.set(beat.story_map_id, list);
  }

  const summaries = (memberships ?? []).map((membership: any) => {
    const projectRelation = membership.prompt_projects;
    const project = Array.isArray(projectRelation) ? projectRelation[0] : projectRelation;
    const version = latestByProject.get(membership.project_id) ?? null;
    const story = storyByProject.get(membership.project_id) ?? null;
    const beats = story ? beatsByStory.get(story.id) ?? [] : [];
    const snapshotParsed = generatorInputSnapshotSchema.safeParse(version?.generator_input_snapshot);
    const snapshot = snapshotParsed.success ? snapshotParsed.data : null;

    const style = snapshot
      ? unique([...snapshot.selectedMusicStyles, snapshot.customMusicStyle || null]).join(" / ") || null
      : null;
    const instruments = snapshot
      ? unique([...snapshot.selectedInstruments, ...splitCustomList(snapshot.customInstruments)])
      : [];
    const structure = snapshot?.songStructure ?? [];
    const productionStyle = snapshot?.productionStyle?.trim() || null;
    const rawImagery = beats.map((beat) => text(beat.key_image)).filter((value): value is string => Boolean(value));
    const majorImagery = unique(rawImagery);
    const motifCounts = new Map<string, { label: string; count: number }>();
    for (const image of rawImagery) {
      const key = image.toLocaleLowerCase();
      const current = motifCounts.get(key) ?? { label: image, count: 0 };
      current.count += 1;
      motifCounts.set(key, current);
    }
    const recurringMotifs = [...motifCounts.values()]
      .filter((item) => item.count > 1)
      .map((item) => item.label);
    const narrativeSummary = story
      ? [
          text(story.summary) ?? text(story.concept),
          beats
            .filter((beat) => beat.is_key_beat || text(beat.what_happens))
            .slice(0, 8)
            .map((beat) => `${beat.title}: ${text(beat.what_happens) ?? ""}`.trim())
            .join(" | "),
        ]
          .filter(Boolean)
          .join("\n") || null
      : null;

    const availableSources: string[] = ["project"];
    if (version) availableSources.push("latest_version");
    if (snapshot) availableSources.push("generator_snapshot");
    if (text(version?.lyrics)) availableSources.push("lyrics");
    if (text(version?.theme)) availableSources.push("theme");
    if (text(version?.mood)) availableSources.push("mood");
    if (snapshot && parseBpm(version?.generator_input_snapshot) != null) availableSources.push("bpm");
    if (story) availableSources.push("story_map");
    if (beats.length > 0) availableSources.push("story_beats");

    const expected = [
      "latest_version",
      "generator_snapshot",
      "lyrics",
      "theme",
      "mood",
      "bpm",
      "story_map",
      "story_beats",
    ];
    const missingSources = expected.filter((source) => !availableSources.includes(source));

    const summary: ProjectUniverseSummary = projectUniverseSummarySchema.parse({
      projectId: membership.project_id,
      projectTitle: project?.name ?? "Untitled Project",
      songTitle: text(version?.title),
      versionId: version?.id ?? null,
      versionNumber:
        typeof version?.version_number === "number" ? version.version_number : null,
      theme: text(version?.theme) ?? text(story?.theme),
      genre: text(version?.genre),
      style,
      mood: text(version?.mood) ?? text(story?.emotional_direction),
      bpm: parseBpm(version?.generator_input_snapshot),
      instruments,
      productionStyle,
      structure,
      hookType: null,
      lyricsSummary: text(version?.note),
      lyricsExcerpt: compactExcerpt(text(version?.lyrics)),
      narrativeSummary,
      narratorPov: text(story?.point_of_view) ?? text(story?.narrator),
      majorImagery,
      settings: [],
      recurringMotifs,
      storyMapSummary: text(story?.summary) ?? text(story?.concept),
      progressionType: text(story?.progression_type),
      startingState: text(story?.starting_state),
      centralChange: text(story?.central_change),
      turningPoint: text(story?.turning_point),
      resolution: text(story?.resolution),
      unresolvedQuestions: [],
      universeRole: text(membership.universe_role),
      projectStatus: text(membership.project_status),
      intentionalOutlier: membership.intentional_outlier === true,
      outlierPurpose: text(membership.outlier_purpose),
      inheritedUniverseTraits: arrayFromJson(membership.inherited_traits),
      position: membership.position,
      availableSources,
      missingSources,
      sourceCompleteness: sourceCompleteness(availableSources),
      versionUpdatedAt: version?.updated_at ?? null,
      storyMapUpdatedAt: story?.updated_at ?? null,
      updatedAt: maxIso(
        [membership.updated_at, project?.updated_at, version?.updated_at, story?.updated_at],
        membership.updated_at,
      ),
    });
    return summary;
  });

  const historyUpdatedAt = maxIso(
    [universe.updatedAt, ...summaries.flatMap((summary: { updatedAt: string | null; storyMapUpdatedAt: string | null }) => [summary.updatedAt, summary.storyMapUpdatedAt])],
    universe.updatedAt,
  );

  return {
    universe,
    summaries,
    usageProfile: buildDeterministicUsageProfile(summaries),
    historyFingerprint: buildFingerprint(universe, summaries),
    historyUpdatedAt,
    overallCompleteness: overallCompleteness(summaries),
  };
}