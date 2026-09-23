from pathlib import Path


def replace_all(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)


# AI functions: exactOptionalPropertyTypes + serializable typed analysis result.
p = Path("src/lib/story-map-ai.functions.ts")
s = p.read_text()
s = replace_once(
    s,
    "  type StoryMapDraft,\n} from \"@/lib/story-map.shared\";",
    "  type StoryMapAnalysis,\n  type StoryMapDraft,\n} from \"@/lib/story-map.shared\";",
    "analysis type import",
)
s = replace_all(s, "requestedModel: data.model,", "requestedModel: data.model ?? null,", "requested model null normalization")
s = replace_once(
    s,
    "    const result = await runStructured({\n      userId: context.userId,\n      requestedModel: data.model ?? null,\n      system: ANALYZE_SYSTEM,",
    "    const result = await runStructured<StoryMapAnalysis>({\n      userId: context.userId,\n      requestedModel: data.model ?? null,\n      system: ANALYZE_SYSTEM,",
    "typed analysis structured result",
)
p.write_text(s)

# DB row adapters: declare the fields that are accessed with dot notation under
# noPropertyAccessFromIndexSignature while preserving flexible Supabase payloads.
p = Path("src/lib/story-map.functions.ts")
s = p.read_text()
s = replace_once(
    s,
    "type StoryMapRow = Record<string, any>;\ntype BeatRow = Record<string, any>;",
    '''type StoryMapRow = Record<string, any> & {
  id: any;
  user_id: any;
  title: any;
  concept: any;
  theme: any;
  emotional_direction: any;
  narrator: any;
  point_of_view: any;
  desired_ending: any;
  progression_type: any;
  summary: any;
  starting_state: any;
  central_change: any;
  turning_point: any;
  resolution: any;
  project_id: any;
  source_project_version_id: any;
  source_lyrics_updated_at: any;
  created_at: any;
  updated_at: any;
};
type BeatRow = Record<string, any> & {
  id: any;
  position: any;
  title: any;
  what_happens: any;
  emotion: any;
  purpose: any;
  narrator_state: any;
  key_image: any;
  reveal: any;
  change_after_beat: any;
  lyric_anchor: any;
  suggested_sections: any;
  is_key_beat: any;
};''',
    "typed story map rows",
)
p.write_text(s)

# Standalone Story Map route: annotate data from server functions whose generated
# wrapper types are intentionally broad, and avoid possibly-undefined tuple swap.
p = Path("src/routes/story-map.tsx")
s = p.read_text()
s = replace_once(
    s,
    "(mapsQuery.data?.storyMaps ?? []).map((item) => (",
    "(mapsQuery.data?.storyMaps ?? []).map((item: StoryMapRecord) => (",
    "story map library item type",
)
s = replace_once(
    s,
    "    [ids[index], ids[target]] = [ids[target], ids[index]];",
    '''    const currentId = ids[index];
    const targetId = ids[target];
    if (!currentId || !targetId) return;
    ids[index] = targetId;
    ids[target] = currentId;''',
    "safe beat swap",
)
s = replace_once(
    s,
    "(projects.data?.projects ?? []).map((p) => <option",
    "(projects.data?.projects ?? []).map((p: { id: string; name: string }) => <option",
    "project option type",
)
p.write_text(s)

print("Story Map strict TypeScript fixes applied")
