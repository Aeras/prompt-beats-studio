from pathlib import Path


def replace_if_present(text: str, old: str, new: str) -> str:
    return text.replace(old, new) if old in text else text

# Generator: allow standalone revision/workspace bases and null project context.
gen = Path('src/routes/generate.tsx')
text = gen.read_text()
for old, new in [
    (
        'data: { projectId: revisionProjectId, basePromptId: revisionBasePromptId }',
        'data: { projectId: revisionProjectId || null, basePromptId: revisionBasePromptId }',
    ),
    (
        'enabled: Boolean(user && revisionMode && revisionProjectId && revisionBasePromptId)',
        'enabled: Boolean(user && revisionMode && revisionBasePromptId)',
    ),
    (
        'data: { projectId: search.project as string, basePromptId: search.base as string }',
        'data: { projectId: search.project ?? null, basePromptId: search.base as string }',
    ),
    (
        'enabled: Boolean(user && search.workspace === "lyrics" && search.project && search.base)',
        'enabled: Boolean(user && search.workspace === "lyrics" && search.base)',
    ),
    (
        'revisionMode && revisionProjectId && revisionBasePromptId',
        'revisionMode && revisionBasePromptId',
    ),
    (
        'projectId: revisionProjectId,\n                basePromptId:',
        'projectId: revisionProjectId || null,\n                basePromptId:',
    ),
    (
        'projectId: search.project as string,\n          basePromptId: search.base as string,',
        'projectId: search.project ?? null,\n          basePromptId: search.base as string,',
    ),
]:
    text = replace_if_present(text, old, new)
gen.write_text(text)

# Lyrics Workspace: standalone saves overwrite the same Prompt; Project saves remain new versions.
workspace = Path('src/components/promptbeats/LyricsWorkspace.tsx')
text = workspace.read_text()
old = '''      setCurrentBasePromptId(saved.savedPromptId);
      setCurrentBaseVersion(saved.versionNumber);
      setSavedVersion({ id: saved.savedPromptId, versionNumber: saved.versionNumber });'''
new = '''      setCurrentBasePromptId(saved.savedPromptId);
      if (saved.versionNumber) {
        setCurrentBaseVersion(saved.versionNumber);
        setSavedVersion({ id: saved.savedPromptId, versionNumber: saved.versionNumber });
      } else {
        setCurrentBaseVersion(null);
        setSavedVersion(null);
      }'''
if old not in text:
    raise SystemExit('missing LyricsWorkspace save-result block')
text = text.replace(old, new)
old = '''          {projectId && currentBasePromptId && (
            <button'''
new = '''          {currentBasePromptId && (
            <button'''
if old not in text:
    raise SystemExit('missing LyricsWorkspace save-button condition')
text = text.replace(old, new)
old = '''              {t("lyricsWorkspace.saveNewVersion")}
            </button>'''
new = '''              {projectId ? t("lyricsWorkspace.saveNewVersion") : t("common.save")}
            </button>'''
if old not in text:
    raise SystemExit('missing LyricsWorkspace save-button label')
text = text.replace(old, new)
workspace.write_text(text)

print('generator/workspace follow-up patch applied')
