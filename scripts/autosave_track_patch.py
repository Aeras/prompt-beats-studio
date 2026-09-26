from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Anchor not found in {path}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


path = "src/components/promptbeats/TrackOwnerActions.tsx"
replace_once(
    path,
    'import { COVER_ACCEPT, validateCoverFile } from "@/lib/cover-upload";\n',
    'import { COVER_ACCEPT, validateCoverFile } from "@/lib/cover-upload";\nimport { useAccountPreferences } from "@/lib/account-preferences";\nimport { useDraftAutosave } from "@/lib/draft-autosave";\n',
)
replace_once(
    path,
    '''  const { user } = useAuth();
  const { isAdmin } = useModeration();''',
    '''  const { user } = useAuth();
  const { preferences } = useAccountPreferences();
  const { isAdmin } = useModeration();''',
)
replace_once(
    path,
    '''  const [allowDownload, setAllowDownload] = useState(false);

  const isOwner = Boolean(user && track.user_id && user.id === track.user_id);''',
    '''  const [allowDownload, setAllowDownload] = useState(false);
  const clearTrackEditDraft = useDraftAutosave({
    ownerId: user?.id,
    scope: `track-edit:${track.id}`,
    enabled: editing && preferences.autoSaveDrafts,
    value: {
      title,
      genreOption,
      customGenre,
      prompt,
      lyrics,
      sourceUrl,
      createdWith,
      isPublished,
      promptIsPublic,
      lyricsIsPublic,
      containsExplicitLyrics,
      allowDownload,
    },
    onRestore: (draft) => {
      setTitle(draft.title);
      setGenreOption(draft.genreOption);
      setCustomGenre(draft.customGenre);
      setPrompt(draft.prompt);
      setLyrics(draft.lyrics);
      setSourceUrl(draft.sourceUrl);
      setCreatedWith(draft.createdWith);
      setIsPublished(draft.isPublished);
      setPromptIsPublic(draft.promptIsPublic);
      setLyricsIsPublic(draft.lyricsIsPublic);
      setContainsExplicitLyrics(draft.containsExplicitLyrics);
      setAllowDownload(draft.allowDownload);
    },
  });

  const isOwner = Boolean(user && track.user_id && user.id === track.user_id);''',
)
replace_once(
    path,
    '''      await refresh();
      setEditing(false);
      closeInlineMenu();''',
    '''      await refresh();
      clearTrackEditDraft();
      setEditing(false);
      closeInlineMenu();''',
)
replace_once(
    path,
    '''      await deleteTrack({ data: { id: track.id } });
      await refresh();
      setConfirming(false);''',
    '''      await deleteTrack({ data: { id: track.id } });
      clearTrackEditDraft();
      await refresh();
      setConfirming(false);''',
)

path = "src/lib/settings-preferences.test.ts"
p = Path(path)
text = p.read_text()
needle = '      "src/components/promptbeats/PromptStandaloneDialogs.tsx",\n'
if needle not in text:
    raise SystemExit("settings coverage anchor not found")
p.write_text(text.replace(needle, needle + '      "src/components/promptbeats/TrackOwnerActions.tsx",\n', 1))
