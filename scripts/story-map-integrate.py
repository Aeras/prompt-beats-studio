from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)

# AppShell: route awareness, drawer-only mobile behavior.
p = Path("src/components/promptbeats/AppShell.tsx")
s = p.read_text()
s = replace_once(s, '  inspirationWall: "/inspiration-wall",\n  library:', '  inspirationWall: "/inspiration-wall",\n  storyMap: "/story-map",\n  library:', "appshell nav path")
s = replace_once(s, '    "musicLab" | "songAnalyzer" | "lyricsReview" | "inspirationWall" | "management"', '    "musicLab" | "songAnalyzer" | "lyricsReview" | "inspirationWall" | "storyMap" | "management"', "mobile exclude")
s = replace_once(s, '  if (pathname.startsWith("/inspiration-wall")) return "inspirationWall";\n  if (pathname.startsWith("/generate"))', '  if (pathname.startsWith("/inspiration-wall")) return "inspirationWall";\n  if (pathname.startsWith("/story-map")) return "storyMap";\n  if (pathname.startsWith("/generate"))', "active nav")
p.write_text(s)

# Shared handoff should not mutate beat order.
p = Path("src/lib/story-map.shared.ts")
s = p.read_text().replace('handoff.beats\n      .sort((a, b) => a.position - b.position)', '[...handoff.beats]\n      .sort((a, b) => a.position - b.position)')
p.write_text(s)

# Replace the obsolete client-loop reorder implementation with the atomic RPC.
p = Path("src/lib/story-map.functions.ts")
s = p.read_text()
start = s.find('export const reorderStoryBeats =')
if start != -1:
    s = s[:start] + '''export const reorderStoryBeats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reorderSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "story_map");
    const supabase = context.supabase as any;
    await requireOwnedStoryMap(supabase, data.storyMapId, context.userId);
    const { error } = await supabase.rpc("reorder_story_map_beats", {
      _story_map_id: data.storyMapId,
      _beat_ids: data.beatIds,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
'''
p.write_text(s)

# Story Map route cleanup/runtime validation.
p = Path("src/routes/story-map.tsx")
s = p.read_text()
s = s.replace('import { useEffect, useMemo, useRef, useState } from "react";', 'import { useEffect, useRef, useState } from "react";')
s = replace_once(s, '  type StoryMapSongSetupHandoff,\n} from "@/lib/story-map.shared";', '  storyMapSongSetupHandoffSchema,\n  type StoryMapSongSetupHandoff,\n} from "@/lib/story-map.shared";', "route handoff schema import")
s = replace_once(s, '                  window.sessionStorage.setItem(STORY_MAP_SONG_SETUP_HANDOFF_KEY, JSON.stringify(handoff));', '                  const parsed = storyMapSongSetupHandoffSchema.parse(handoff);\n                  window.sessionStorage.setItem(STORY_MAP_SONG_SETUP_HANDOFF_KEY, JSON.stringify(parsed));', "route handoff parse")
s = s.replace('    buildStoryMapSongSetupDescription(handoff, language); // validates the same structured context used by Song Setup.\n    onUseInSongSetup(handoff);', '    onUseInSongSetup(handoff);')
p.write_text(s)

# Lyrics Workspace integration.
p = Path("src/components/promptbeats/LyricsWorkspace.tsx")
s = p.read_text()
s = replace_once(s, 'import { useI18n } from "@/i18n";\nimport { cn } from "@/lib/utils";', 'import { useI18n } from "@/i18n";\nimport { cn } from "@/lib/utils";\nimport { StoryMapLyricsPanel } from "@/components/promptbeats/StoryMapLyricsPanel";', "lyrics import")
anchor = '      {saveError && <p className="text-xs text-red-400">{saveError}</p>}\n\n      <div className="space-y-3">'
insert = '''      {saveError && <p className="text-xs text-red-400">{saveError}</p>}

      <StoryMapLyricsPanel
        projectId={projectId}
        projectName={projectName}
        songTitle={song.title}
        lyrics={lyrics}
        structure={sections.map((section) => section.displayLabel).join(" → ")}
        model={model || null}
        onPrepareRewrite={(sectionKey, suggestion) => {
          if (locked.has(sectionKey)) return;
          setEditingKey(sectionKey);
          setAction("custom");
          setCustomInstruction(suggestion);
          setProposal(null);
          setProposalChoice(0);
          setAiError(null);
        }}
      />

      <div className="space-y-3">'''
s = replace_once(s, anchor, insert, "lyrics panel mount")
p.write_text(s)

# Generator: Story Map handoff + story-driven planning.
p = Path("src/routes/generate.tsx")
s = p.read_text()
old_import = '''import type { GeneratorInputSnapshot } from "@/lib/generator-revision.shared";'''
new_import = '''import type { GeneratorInputSnapshot } from "@/lib/generator-revision.shared";
import {
  buildStoryMapSongSetupDescription,
  STORY_MAP_SONG_SETUP_HANDOFF_KEY,
  storyMapSongSetupHandoffSchema,
  type StoryMapDraft,
  type StoryMapSongSetupHandoff,
} from "@/lib/story-map.shared";
import { planStoryDrivenGeneration } from "@/lib/story-map-ai.functions";
import { createStoryMap } from "@/lib/story-map.functions";
import { replaceStoryMapDraft } from "@/lib/story-map-workspace.functions";'''
s = replace_once(s, old_import, new_import, "generator story imports")
s = replace_once(s, '  const songSetupFeature = useFeatureAccess("song_setup_assistant");', '  const songSetupFeature = useFeatureAccess("song_setup_assistant");\n  const storyMapFeature = useFeatureAccess("story_map");', "story feature")
s = replace_once(s, '  const [inspirationWallHandoff, setInspirationWallHandoff] =\n    useState<InspirationWallSongSetupHandoff | null>(null);', '  const [inspirationWallHandoff, setInspirationWallHandoff] =\n    useState<InspirationWallSongSetupHandoff | null>(null);\n  const [storyMapHandoff, setStoryMapHandoff] = useState<StoryMapSongSetupHandoff | null>(null);\n  const [storyDriven, setStoryDriven] = useState(false);\n  const [storyDrivenDraft, setStoryDrivenDraft] = useState<StoryMapDraft | null>(null);\n  const [storyMapPreviewOpen, setStoryMapPreviewOpen] = useState(false);\n  const [storyMapSaved, setStoryMapSaved] = useState(false);', "generator story state")

# Story Map handoff consumer immediately before Inspiration Wall consumer.
anchor = '  useEffect(() => {\n    if (typeof window === "undefined") return;\n    const raw = window.sessionStorage.getItem(INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY);'
insert = '''  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(STORY_MAP_SONG_SETUP_HANDOFF_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(STORY_MAP_SONG_SETUP_HANDOFF_KEY);
    try {
      setStoryMapHandoff(storyMapSongSetupHandoffSchema.parse(JSON.parse(raw)));
    } catch {
      setStatus(
        appLanguage === "el"
          ? "Δεν ήταν δυνατή η φόρτωση του Story Map στο Song Setup."
          : "Could not load the Story Map handoff into Song Setup.",
      );
    }
  }, [appLanguage]);

  useEffect(() => {
    if (!storyMapHandoff || songSetupFeature.isLoading) return;
    if (!songSetupFeature.allowed) {
      setStatus(
        appLanguage === "el"
          ? "Το Song Setup Assistant δεν είναι διαθέσιμο για αυτόν τον λογαριασμό."
          : "Song Setup Assistant is not available for this account.",
      );
      setStoryMapHandoff(null);
      return;
    }
    const description = buildStoryMapSongSetupDescription(storyMapHandoff, appLanguage);
    setAdvanced(true);
    if (storyMapHandoff.projectId) setSaveProjectId(storyMapHandoff.projectId);
    setSongSetupPrefill({
      key: `${storyMapHandoff.storyMapId}:v1`,
      description,
      sourceLabel: storyMapHandoff.storyMapTitle,
    });
    setSongSetupAssistantOpen(true);
    setStatus(
      appLanguage === "el"
        ? "Το Story Map φορτώθηκε στο Song Setup για έλεγχο."
        : "Story Map loaded into Song Setup for review.",
    );
    setStoryMapHandoff(null);
  }, [appLanguage, songSetupFeature.allowed, songSetupFeature.isLoading, storyMapHandoff]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY);'''
s = replace_once(s, anchor, insert, "story handoff effects")

# Generate: reset and create internal plan before durable generation; inject compact plan into instructions.
s = replace_once(s, '    setSongContext(null);\n    setApplied({});', '    setSongContext(null);\n    setStoryDrivenDraft(null);\n    setStoryMapSaved(false);\n    setApplied({});', "generate reset story")
old_try = '''    try {
      const res = await startGenerationJob({
        data: {'''
new_try = '''    try {
      let narrativePlan: StoryMapDraft | null = null;
      if (storyDriven && storyMapFeature.allowed && !revisionMode) {
        setStatus(appLanguage === "el" ? "Δημιουργία αφηγηματικής ροής…" : "Building narrative flow…");
        const planned = await planStoryDrivenGeneration({
          data: {
            theme: theme.trim(),
            genre: effectiveGenre,
            mood: effectiveMood,
            language: effectiveLanguage,
            structure: structure.join(" → ").slice(0, 600),
            production: production.trim().slice(0, 2000),
            instructions: instructions.trim().slice(0, 2000),
            model: generationModel || null,
          },
        });
        narrativePlan = planned.draft;
        setStoryDrivenDraft(planned.draft);
      }
      const narrativeInstruction = narrativePlan
        ? `\\n\\nSTORY MAP — narrative/emotional intent only; Song Blueprint remains authoritative for section structure. Do not print Beat labels in lyrics. Follow this progression while preserving explicit user instructions:\\n${JSON.stringify(narrativePlan)}`
        : "";
      const res = await startGenerationJob({
        data: {'''
s = replace_once(s, old_try, new_try, "generate plan")
s = replace_once(s, '          instructions: instructions.trim().slice(0, 2000),', '          instructions: `${instructions.trim()}${narrativeInstruction}`.slice(0, 2000),', "generation instructions story")

# Add Story-driven UI just before the primary Generate button occurrence.
button_anchor = '''            <button
              onClick={generate}'''
ui = '''            {storyMapFeature.allowed && !revisionMode && (
              <div className="mb-3 rounded-2xl border border-accent/20 bg-accent/[0.04] p-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={storyDriven}
                    onChange={(event) => setStoryDriven(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-semibold">
                      {appLanguage === "el" ? "Story-driven lyrics" : "Story-driven lyrics"}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {appLanguage === "el"
                        ? "Χτίζει πρώτα μια αφηγηματική ή συναισθηματική εξέλιξη ώστε οι στίχοι να μην μένουν στην ίδια ιδέα."
                        : "Builds a narrative or emotional progression first, so the lyrics develop instead of repeating the same idea."}
                    </span>
                  </span>
                </label>
              </div>
            )}
            <button
              onClick={generate}'''
s = replace_once(s, button_anchor, ui, "story-driven toggle")

# Story Map result inspector before quality panel: use first ResultSection occurrence area by anchoring result block.
result_anchor = '''          {result && (
            <div className="space-y-3">'''
result_insert = '''          {storyDrivenDraft && result && (
            <div className="glass mb-3 rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Story Map</p>
                  <p className="text-xs text-muted-foreground">{storyDrivenDraft.summary}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStoryMapPreviewOpen((open) => !open)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-accent">
                    {storyMapPreviewOpen ? (appLanguage === "el" ? "Κλείσιμο Story Map" : "Hide Story Map") : (appLanguage === "el" ? "Προβολή Story Map" : "View Story Map")}
                  </button>
                  <button
                    type="button"
                    disabled={storyMapSaved}
                    onClick={() => void (async () => {
                      try {
                        const created = await createStoryMap({ data: {
                          title: `${result.title || theme.trim()} — Story Map`,
                          concept: theme.trim(),
                          projectId: saveProjectId || null,
                        }});
                        await replaceStoryMapDraft({ data: { storyMapId: created.storyMap.id, draft: storyDrivenDraft } });
                        setStoryMapSaved(true);
                        setStatus(appLanguage === "el" ? "Το Story Map αποθηκεύτηκε." : "Story Map saved.");
                      } catch (cause) {
                        setStatus(cause instanceof Error ? cause.message : "Could not save Story Map.");
                      }
                    })()}
                    className="rounded-lg border border-accent/35 px-3 py-1.5 text-xs text-accent disabled:opacity-40"
                  >
                    {storyMapSaved ? (appLanguage === "el" ? "Αποθηκεύτηκε" : "Saved") : (appLanguage === "el" ? "Αποθήκευση Story Map" : "Save Story Map")}
                  </button>
                </div>
              </div>
              {storyMapPreviewOpen && (
                <div className="mt-3 space-y-2">
                  {storyDrivenDraft.beats.map((beat, index) => (
                    <div key={`${beat.title}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
                      <span className="font-semibold text-accent">{index + 1}. {beat.title}</span>
                      {beat.whatHappens && <span className="ml-2 text-muted-foreground">{beat.whatHappens}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-3">'''
s = replace_once(s, result_anchor, result_insert, "story result inspector")
p.write_text(s)

print("Story Map integration patches applied")
