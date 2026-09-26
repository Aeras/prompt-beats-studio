from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Anchor not found in {path}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


# Settings
path = "src/components/promptbeats/SettingsPanel.tsx"
replace_once(
    path,
    'import { useAccountPreferences, type AccountPreferences } from "@/lib/account-preferences";\n',
    'import { useAccountPreferences, type AccountPreferences } from "@/lib/account-preferences";\nimport { clearAllDraftAutosaves } from "@/lib/draft-autosave";\n',
)
replace_once(path, '  | "exportFormat"\n  | "externalMedia"', '  | "exportFormat"\n  | "autoSaveDrafts"\n  | "externalMedia"')
replace_once(
    path,
    '  const { preferences, setPreference, signedIn } = useAccountPreferences();',
    '  const { preferences, setPreference, signedIn, userId } = useAccountPreferences();',
)
replace_once(
    path,
    '  const toggleInfo = (key: InfoKey) => setInfo((current) => (current === key ? null : key));',
    '''  const saveAutoSaveDrafts = (value: boolean) => {
    setSaveError("");
    void setPreference("autoSaveDrafts", value)
      .then(() => {
        if (!value) clearAllDraftAutosaves(userId);
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error ? error.message : el ? "Η αποθήκευση απέτυχε." : "Saving failed.",
        );
      });
  };

  const toggleInfo = (key: InfoKey) => setInfo((current) => (current === key ? null : key));''',
)
anchor = '''              <section className="relative py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">
                    {el ? "Προεπιλεγμένη καρτέλα Βιβλιοθήκης" : "Default Library tab"}
                  </h3>'''
addition = '''              <section className="relative py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">
                    {el ? "Αυτόματη αποθήκευση drafts" : "Auto-save drafts"}
                  </h3>
                  <InfoButton
                    infoKey="autoSaveDrafts"
                    active={info === "autoSaveDrafts"}
                    onToggle={toggleInfo}
                    label={infoLabel}
                  />
                </div>
                <Segmented
                  value={preferences.autoSaveDrafts}
                  options={[
                    { value: true, label: el ? "Ενεργό" : "On" },
                    { value: false, label: el ? "Ανενεργό" : "Off" },
                  ]}
                  onChange={saveAutoSaveDrafts}
                />
                {info === "autoSaveDrafts" && (
                  <InfoPopover>
                    {el
                      ? "Κρατά τοπικά στον browser τις μη ολοκληρωμένες αλλαγές στα δημιουργικά editors και τις επαναφέρει μετά από refresh, κλείσιμο ή επιστροφή. Οι κανονικές αποθηκεύσεις και τα Project versions παραμένουν η επίσημη πηγή αλήθειας. Αν το απενεργοποιήσεις, διαγράφονται τα τοπικά drafts αυτής της συσκευής."
                      : "Keeps unfinished changes locally in this browser across creative editors and restores them after refresh, closing, or returning. Explicit saves and Project versions remain the canonical source of truth. Turning this off clears local drafts on this device."}
                  </InfoPopover>
                )}
              </section>

'''
replace_once(path, anchor, addition + anchor)

# Generator
path = "src/routes/generate.tsx"
replace_once(
    path,
    'import { useAccountPreferences } from "@/lib/account-preferences";\n',
    'import { useAccountPreferences } from "@/lib/account-preferences";\nimport { useDraftAutosave } from "@/lib/draft-autosave";\n',
)
snapshot_end = '''    generationModel: generationModel || null,
  };
  const revisionReady ='''
generator_autosave = '''    generationModel: generationModel || null,
  };
  const generatorDraftScope = revisionMode
    ? `generator:revision:${revisionProjectId || "none"}:${revisionBasePromptId || "none"}`
    : "generator:new";
  const clearGeneratorDraft = useDraftAutosave({
    ownerId: user?.id,
    scope: generatorDraftScope,
    enabled: Boolean(user && accountPreferences.autoSaveDrafts && search.workspace !== "lyrics"),
    value: { snapshot: currentSnapshot, revisionRequest },
    onRestore: (draft) => {
      const snapshot = draft.snapshot;
      setAdvanced(snapshot.generatorMode !== "basic");
      setTargetPlatform(snapshot.targetPlatform);
      setTheme(snapshot.theme);
      setGenres([...snapshot.selectedMusicStyles]);
      setCustomGenre(snapshot.customMusicStyle);
      setMoods([...snapshot.selectedMoods]);
      setCustomMood(snapshot.customMood);
      setInstruments([...snapshot.selectedInstruments]);
      setCustomInstruments(snapshot.customInstruments);
      setBpm(snapshot.bpmMode || "Auto");
      setCustomBpm(snapshot.customBpm);
      setStructure([...snapshot.songStructure]);
      setSongBlueprint(buildSongBlueprint(snapshot.songStructure, snapshot.songBlueprint));
      setActiveSmartPresetId(snapshot.smartPresetId ?? "");
      setPresetCulturalStyleId(snapshot.culturalStyleId || "");
      setProduction(snapshot.productionStyle);
      setInstructions(snapshot.additionalInstructions);
      setLanguage(snapshot.language);
      setLanguageVariant(snapshot.languageVariant ?? "");
      setCustomLanguage(snapshot.customLanguage);
      if (snapshot.generationModel) {
        setGenerationModel(snapshot.generationModel);
        setGenerationModelChosen(true);
      }
      setRevisionRequest(draft.revisionRequest ?? "");
    },
    isEmpty: (draft) => {
      const snapshot = draft.snapshot;
      return (
        !snapshot.theme &&
        snapshot.selectedMusicStyles.length === 0 &&
        !snapshot.customMusicStyle &&
        snapshot.selectedMoods.length === 0 &&
        !snapshot.customMood &&
        !snapshot.language &&
        !snapshot.customLanguage &&
        snapshot.selectedInstruments.length === 0 &&
        !snapshot.customInstruments &&
        snapshot.bpmMode === "Auto" &&
        !snapshot.customBpm &&
        snapshot.songStructure.length === 0 &&
        !snapshot.productionStyle &&
        !snapshot.additionalInstructions &&
        !snapshot.smartPresetId &&
        !draft.revisionRequest.trim()
      );
    },
  });
  const revisionReady ='''
replace_once(path, snapshot_end, generator_autosave)
replace_once(path, '    setTheme("");\n    setGenres([]);', '    clearGeneratorDraft();\n    setTheme("");\n    setGenres([]);')

# Lyrics Workspace
path = "src/components/promptbeats/LyricsWorkspace.tsx"
replace_once(
    path,
    'import { cn } from "@/lib/utils";\n',
    'import { cn } from "@/lib/utils";\nimport { useAccountPreferences } from "@/lib/account-preferences";\nimport { draftFingerprint, useDraftAutosave } from "@/lib/draft-autosave";\n',
)
replace_once(
    path,
    '''  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [lyrics, setLyrics] = useState(song.lyrics);''',
    '''  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { preferences, userId } = useAccountPreferences();
  const [lyrics, setLyrics] = useState(song.lyrics);''',
)
replace_once(
    path,
    '''  const workspaceLanguage = resolveLyricsWorkspaceLanguage(
    song.language,
    song.generatorInputSnapshot,
  );

  useEffect(() => {''',
    '''  const workspaceLanguage = resolveLyricsWorkspaceLanguage(
    song.language,
    song.generatorInputSnapshot,
  );
  const lyricsDraftScope = `lyrics-workspace:${projectId ?? "standalone"}:${
    basePromptId ?? draftFingerprint(`${song.title}\n${song.lyrics}`)
  }`;
  const clearLyricsDraft = useDraftAutosave({
    ownerId: userId,
    scope: lyricsDraftScope,
    enabled: preferences.autoSaveDrafts,
    value: { lyrics, lastEditSummary },
    onRestore: (draft) => {
      setLyrics(draft.lyrics);
      setLastEditSummary(draft.lastEditSummary || "Lyrics edit");
    },
    isEmpty: (draft) => draft.lyrics === baselineLyrics,
  });

  useEffect(() => {''',
)
replace_once(path, '      setBaselineLyrics(lyrics);\n      setUndoBySection({});', '      clearLyricsDraft();\n      setBaselineLyrics(lyrics);\n      setUndoBySection({});')
replace_once(
    path,
    '''  const closeWorkspace = () => {
    if (projectId && dirty) {
      if (!window.confirm(t("lyricsWorkspace.unsavedConfirm"))) return;
      onClose(baselineLyrics, savedVersion);
      return;
    }
    onClose(lyrics, savedVersion);
  };''',
    '''  const closeWorkspace = () => {
    if (projectId && dirty) {
      if (!window.confirm(t("lyricsWorkspace.unsavedConfirm"))) return;
      clearLyricsDraft();
      onClose(baselineLyrics, savedVersion);
      return;
    }
    clearLyricsDraft();
    onClose(lyrics, savedVersion);
  };''',
)

# Lyrics Review
path = "src/routes/lyrics-review.tsx"
replace_once(path, 'import { cn } from "@/lib/utils";\n', 'import { cn } from "@/lib/utils";\nimport { useAccountPreferences } from "@/lib/account-preferences";\nimport { useDraftAutosave } from "@/lib/draft-autosave";\n')
replace_once(path, '  const { user, loading } = useAuth();\n  const navigate = useNavigate();', '  const { user, loading } = useAuth();\n  const { preferences: accountPreferences } = useAccountPreferences();\n  const navigate = useNavigate();')
replace_once(
    path,
    '''  const [copied, setCopied] = useState(false);

  const modelAccess = useQuery({''',
    '''  const [copied, setCopied] = useState(false);
  const lyricsReviewDraftScope =
    mode === "project"
      ? `lyrics-review:project:${search.project ?? "none"}:${search.version ?? "latest"}`
      : mode === "generator"
        ? `lyrics-review:generator:${search.handoff ?? "none"}`
        : "lyrics-review:standalone";
  const clearLyricsReviewDraft = useDraftAutosave({
    ownerId: user?.id,
    scope: lyricsReviewDraftScope,
    enabled: Boolean(user && sourceReady && accountPreferences.autoSaveDrafts),
    value: { title, lyrics, languageCode, manualLanguage },
    onRestore: (draft) => {
      setTitle(draft.title);
      setLyrics(draft.lyrics);
      setLanguageCode(draft.languageCode);
      setManualLanguage(draft.manualLanguage);
    },
    isEmpty: (draft) =>
      mode === "standalone"
        ? !draft.title.trim() && !draft.lyrics.trim()
        : draft.lyrics === baselineLyrics,
  });

  const modelAccess = useQuery({''',
)
replace_once(path, '      setBaselineLyrics(lyrics);\n      setLastApplied(null);', '      clearLyricsReviewDraft();\n      setBaselineLyrics(lyrics);\n      setLastApplied(null);')
replace_once(path, '    writeLyricsReviewGeneratorHandoff({\n      ...generatorHandoff,', '    clearLyricsReviewDraft();\n    writeLyricsReviewGeneratorHandoff({\n      ...generatorHandoff,')
replace_once(path, '    void navigate({ to: "/" });\n  };', '    clearLyricsReviewDraft();\n    void navigate({ to: "/" });\n  };')

# Song Setup Assistant
path = "src/components/promptbeats/SongSetupAssistantModal.tsx"
replace_once(path, 'import { useI18n, type AppTranslationKey } from "@/i18n";\n', 'import { useI18n, type AppTranslationKey } from "@/i18n";\nimport { useAccountPreferences } from "@/lib/account-preferences";\nimport { useDraftAutosave } from "@/lib/draft-autosave";\n')
replace_once(path, '  const { language, t } = useI18n();\n  const text = copy[language];', '  const { language, t } = useI18n();\n  const { preferences, userId } = useAccountPreferences();\n  const text = copy[language];')
replace_once(
    path,
    '''  const aiModel = useAiModelSelection("aiTools");

  useEffect(() => {''',
    '''  const aiModel = useAiModelSelection("aiTools");
  const clearSongSetupDraft = useDraftAutosave({
    ownerId: userId,
    scope: `song-setup:${prefillKey ?? targetPlatform}`,
    enabled: open && preferences.autoSaveDrafts,
    value: { description, draft },
    onRestore: (saved) => {
      setDescription(saved.description);
      setDraft(saved.draft);
    },
    isEmpty: (saved) => !saved.description.trim() && saved.draft === null,
  });

  useEffect(() => {''',
)
replace_once(path, '    setDescription("");\n    setDraft(null);', '    clearSongSetupDraft();\n    setDescription("");\n    setDraft(null);')
replace_once(path, '                onApply(draft);\n                onOpenChange(false);', '                onApply(draft);\n                clearSongSetupDraft();\n                onOpenChange(false);')

# Submit Track
path = "src/components/promptbeats/StudioModal.tsx"
replace_once(path, 'import { useEffect, useRef, useState } from "react";\n', 'import { useEffect, useMemo, useRef, useState } from "react";\n')
replace_once(path, '} from "@/lib/account-preferences";\n', '} from "@/lib/account-preferences";\nimport { useDraftAutosave } from "@/lib/draft-autosave";\n')
replace_once(path, 'type SubmitTrackDefaults = Pick<', 'type RowDraft = Omit<Row, "file" | "cover">;\n\ntype SubmitTrackDefaults = Pick<')
replace_once(
    path,
    '''  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {''',
    '''  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const serializableRows = useMemo<RowDraft[]>(
    () => rows.map(({ file: _file, cover: _cover, ...row }) => row),
    [rows],
  );
  const clearStudioDraft = useDraftAutosave({
    ownerId: user?.id,
    scope: "submit-track",
    enabled: open && preferences.autoSaveDrafts,
    value: serializableRows,
    onRestore: (saved) => setRows(saved.map((row) => ({ ...row, file: null, cover: null }))),
    isEmpty: (saved) =>
      saved.length === 1 &&
      !saved[0]?.sourceUrl.trim() &&
      !saved[0]?.title.trim() &&
      !saved[0]?.genre &&
      !saved[0]?.customGenre.trim() &&
      !saved[0]?.prompt.trim() &&
      !saved[0]?.lyrics.trim(),
  });

  useEffect(() => {''',
)
replace_once(path, '      setStatus(t("studio.published", { count: rows.length }));\n      setRows([emptyRow(preferences)]);', '      setStatus(t("studio.published", { count: rows.length }));\n      clearStudioDraft();\n      setRows([emptyRow(preferences)]);')

# Song Universe
path = "src/routes/song-universe.tsx"
replace_once(path, 'import { useI18n } from "@/i18n";\n', 'import { useI18n } from "@/i18n";\nimport { useAccountPreferences } from "@/lib/account-preferences";\nimport { useDraftAutosave } from "@/lib/draft-autosave";\n')
replace_once(path, '  const { language } = useI18n();\n  const el = language === "el";\n  const navigate = useNavigate();', '  const { language } = useI18n();\n  const { preferences, userId } = useAccountPreferences();\n  const el = language === "el";\n  const navigate = useNavigate();')
replace_once(
    path,
    '''  const [projectId, setProjectId] = useState("");

  const options = useQuery({''',
    '''  const [projectId, setProjectId] = useState("");
  useDraftAutosave({
    ownerId: userId,
    scope: `song-universe:${universe.id}`,
    enabled: preferences.autoSaveDrafts,
    value: { title, description, newItem, projectId },
    onRestore: (draft) => {
      setTitle(draft.title);
      setDescription(draft.description);
      setNewItem(draft.newItem);
      setProjectId(draft.projectId);
    },
    isEmpty: (draft) =>
      draft.title === universe.title &&
      draft.description === (universe.description ?? "") &&
      Object.values(draft.newItem).every((value) => !value.trim()) &&
      !draft.projectId,
  });

  const options = useQuery({''',
)

# Library Creation Notes
path = "src/routes/library.tsx"
replace_once(path, 'import { useAccountPreferences } from "@/lib/account-preferences";\n', 'import { useAccountPreferences } from "@/lib/account-preferences";\nimport { useDraftAutosave } from "@/lib/draft-autosave";\n')
replace_once(path, 'function ProjectCreationNotes({ project }: { project: PromptProject }) {\n  const { language } = useI18n();\n  const queryClient = useQueryClient();', 'function ProjectCreationNotes({ project }: { project: PromptProject }) {\n  const { language } = useI18n();\n  const { preferences, userId } = useAccountPreferences();\n  const queryClient = useQueryClient();')
replace_once(
    path,
    '''  useEffect(() => {
    setDraft(project.creation_notes ?? "");
    setSaved(false);
    setError("");
  }, [project.id, project.creation_notes]);

  const save = async () => {''',
    '''  useEffect(() => {
    setDraft(project.creation_notes ?? "");
    setSaved(false);
    setError("");
  }, [project.id, project.creation_notes]);

  const clearCreationNotesDraft = useDraftAutosave({
    ownerId: userId,
    scope: `project-creation-notes:${project.id}`,
    enabled: preferences.autoSaveDrafts,
    value: draft,
    onRestore: setDraft,
    isEmpty: (value) => value === (project.creation_notes ?? ""),
  });

  const save = async () => {''',
)
replace_once(path, '      await queryClient.invalidateQueries({\n        queryKey: ["library", "prompt-projects"],\n        exact: false,\n      });\n      setSaved(true);', '      clearCreationNotesDraft();\n      await queryClient.invalidateQueries({\n        queryKey: ["library", "prompt-projects"],\n        exact: false,\n      });\n      setSaved(true);')

# Story Map creation dialog (workspace metadata/beats already DB-autosave).
path = "src/routes/story-map.tsx"
replace_once(path, 'import { useI18n } from "@/i18n";\n', 'import { useI18n } from "@/i18n";\nimport { useAccountPreferences } from "@/lib/account-preferences";\nimport { useDraftAutosave } from "@/lib/draft-autosave";\n')
replace_once(path, '  const { user, loading } = useAuth();\n  const access = useFeatureAccess("story_map");', '  const { user, loading } = useAuth();\n  const { preferences } = useAccountPreferences();\n  const access = useFeatureAccess("story_map");')
replace_once(
    path,
    '''  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapsQuery = useQuery({''',
    '''  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearNewStoryMapDraft = useDraftAutosave({
    ownerId: user?.id,
    scope: "story-map:new",
    enabled: newOpen && preferences.autoSaveDrafts,
    value: { title, concept },
    onRestore: (draft) => {
      setTitle(draft.title);
      setConcept(draft.concept);
    },
    isEmpty: (draft) => !draft.title.trim() && !draft.concept.trim(),
  });

  const mapsQuery = useQuery({''',
)
replace_once(path, '      setSelectedId(result.storyMap.id);\n      setTitle("");', '      setSelectedId(result.storyMap.id);\n      clearNewStoryMapDraft();\n      setTitle("");')

# Inspiration Wall creation dialog (Wall/card edits already debounce-save to DB).
path = "src/routes/inspiration-wall.tsx"
replace_once(path, 'import { useI18n } from "@/i18n";\n', 'import { useI18n } from "@/i18n";\nimport { useAccountPreferences } from "@/lib/account-preferences";\nimport { useDraftAutosave } from "@/lib/draft-autosave";\n')
replace_once(path, '  const { user, loading } = useAuth();\n  const access = useFeatureAccess("inspiration_wall");', '  const { user, loading } = useAuth();\n  const { preferences } = useAccountPreferences();\n  const access = useFeatureAccess("inspiration_wall");')
replace_once(
    path,
    '''  const [newWallTheme, setNewWallTheme] = useState<InspirationWallTheme>("neon_studio");

  const walls = useQuery({''',
    '''  const [newWallTheme, setNewWallTheme] = useState<InspirationWallTheme>("neon_studio");
  const clearNewWallDraft = useDraftAutosave({
    ownerId: user?.id,
    scope: "inspiration-wall:new",
    enabled: newWallOpen && preferences.autoSaveDrafts,
    value: { title: newWallTitle, description: newWallDescription, theme: newWallTheme },
    onRestore: (draft) => {
      setNewWallTitle(draft.title);
      setNewWallDescription(draft.description);
      setNewWallTheme(draft.theme);
    },
    isEmpty: (draft) =>
      !draft.title.trim() && !draft.description.trim() && draft.theme === "neon_studio",
  });

  const walls = useQuery({''',
)
replace_once(path, '      setSelectedWallId(created.wall.id);\n      setNewWallOpen(false);', '      setSelectedWallId(created.wall.id);\n      clearNewWallDraft();\n      setNewWallOpen(false);')

# Regression contract
path = "src/lib/settings-preferences.test.ts"
p = Path(path)
text = p.read_text()
marker = "\n});\n"
addition = r'''

  test("Auto-save drafts is account-backed and covers all creative editors", async () => {
    const preferences = await source("src/lib/account-preferences.ts");
    expect(preferences).toContain("autoSaveDrafts: boolean");
    expect(preferences).toContain('autoSaveDrafts: "auto_save_drafts"');
    expect(preferences).toContain("autoSaveDrafts: true");

    const settings = await source("src/components/promptbeats/SettingsPanel.tsx");
    expect(settings).toContain('"Auto-save drafts"');
    expect(settings).toContain('"Αυτόματη αποθήκευση drafts"');
    expect(settings).toContain("clearAllDraftAutosaves(userId)");

    const helper = await source("src/lib/draft-autosave.ts");
    expect(helper).toContain('const DRAFT_PREFIX = "pb:draft:v1"');
    expect(helper).toContain("DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000");
    expect(helper).toContain("export function useDraftAutosave");

    for (const file of [
      "src/routes/generate.tsx",
      "src/components/promptbeats/LyricsWorkspace.tsx",
      "src/routes/lyrics-review.tsx",
      "src/components/promptbeats/SongSetupAssistantModal.tsx",
      "src/components/promptbeats/StudioModal.tsx",
      "src/components/promptbeats/PromptStandaloneDialogs.tsx",
      "src/routes/song-universe.tsx",
      "src/routes/library.tsx",
      "src/routes/story-map.tsx",
      "src/routes/inspiration-wall.tsx",
    ]) {
      expect(await source(file)).toContain("useDraftAutosave");
    }
  });'''
idx = text.rfind(marker)
if idx < 0:
    raise SystemExit("settings-preferences test closing anchor not found")
p.write_text(text[:idx] + addition + text[idx:])
