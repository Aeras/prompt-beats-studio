from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'pattern not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# Server functions
ai_path = 'src/lib/ai.functions.ts'
ai = Path(ai_path).read_text()
marker = '''  });\n\n// ─────────────────────────────────────────────────────────────────────────────\n// Super Admin: server-authoritative provider/model selection.\n'''
addition = '''  });\n\nexport const detachSavedPromptFromProject = createServerFn({ method: "POST" })\n  .middleware([requireSupabaseAuth])\n  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))\n  .handler(async ({ data, context }) => {\n    const { data: result, error } = await (context.supabase as any).rpc(\n      "detach_prompt_project_version",\n      { _user_id: context.userId, _prompt_id: data.id },\n    );\n    if (error) throw new Error(error.message);\n    return { ok: true, result };\n  });\n\nexport const copySavedPromptToProject = createServerFn({ method: "POST" })\n  .middleware([requireSupabaseAuth])\n  .inputValidator((input: unknown) =>\n    z.object({ id: z.string().uuid(), destinationProjectId: z.string().uuid() }).parse(input),\n  )\n  .handler(async ({ data, context }) => {\n    const { data: result, error } = await (context.supabase as any).rpc(\n      "copy_prompt_version_to_project",\n      {\n        _user_id: context.userId,\n        _prompt_id: data.id,\n        _destination_project_id: data.destinationProjectId,\n      },\n    );\n    if (error) throw new Error(error.message);\n    return { ok: true, result };\n  });\n\nexport const moveSavedPromptToProject = createServerFn({ method: "POST" })\n  .middleware([requireSupabaseAuth])\n  .inputValidator((input: unknown) =>\n    z.object({ id: z.string().uuid(), destinationProjectId: z.string().uuid() }).parse(input),\n  )\n  .handler(async ({ data, context }) => {\n    const { data: result, error } = await (context.supabase as any).rpc(\n      "move_prompt_version_to_project",\n      {\n        _user_id: context.userId,\n        _prompt_id: data.id,\n        _destination_project_id: data.destinationProjectId,\n      },\n    );\n    if (error) throw new Error(error.message);\n    return { ok: true, result };\n  });\n\n// ─────────────────────────────────────────────────────────────────────────────\n// Super Admin: server-authoritative provider/model selection.\n'''
if marker not in ai:
    raise SystemExit('ai marker not found')
Path(ai_path).write_text(ai.replace(marker, addition, 1))

# Library imports
replace_once(
    'src/routes/library.tsx',
    '''  updatePromptProjectCreationNotes,\n  updateSavedPromptOrganization,\n} from "@/lib/ai.functions";''',
    '''  updatePromptProjectCreationNotes,\n  updateSavedPromptOrganization,\n  detachSavedPromptFromProject,\n  copySavedPromptToProject,\n  moveSavedPromptToProject,\n} from "@/lib/ai.functions";''',
)
replace_once(
    'src/routes/library.tsx',
    '''import { DeletePromptProjectDialog } from "@/components/promptbeats/DeletePromptProjectDialog";''',
    '''import { DeletePromptProjectDialog } from "@/components/promptbeats/DeletePromptProjectDialog";\nimport { ProjectPromptActionMenu } from "@/components/promptbeats/ProjectPromptActionMenu";''',
)

# SavedPromptCard state + long press
replace_once(
    'src/routes/library.tsx',
    '''  const [movingToProject, setMovingToProject] = useState(false);\n  const queryClient = useQueryClient();''',
    '''  const [movingToProject, setMovingToProject] = useState(false);\n  const [projectMenuAnchor, setProjectMenuAnchor] = useState<LibraryActionMenuAnchor | null>(null);\n  const [projectActionBusy, setProjectActionBusy] = useState(false);\n  const queryClient = useQueryClient();''',
)
replace_once(
    'src/routes/library.tsx',
    '''  const project = projects.find((p) => p.id === prompt.project_id);\n  const longPress = useLibraryLongPress((point) => onLongPress?.(point), !onLongPress);''',
    '''  const project = projects.find((p) => p.id === prompt.project_id);\n  const longPress = useLibraryLongPress(\n    (point) => {\n      if (prompt.project_id) setProjectMenuAnchor(point);\n      else onLongPress?.(point);\n    },\n    !prompt.project_id && !onLongPress,\n  );''',
)

# Add action handlers after move()
replace_once(
    'src/routes/library.tsx',
    '''  const saveEdit = async (values: StandalonePromptEditValues) => {''',
    '''  const detachFromProject = async () => {\n    if (!prompt.project_id || projectActionBusy) return;\n    setProjectActionBusy(true);\n    try {\n      await detachSavedPromptFromProject({ data: { id: prompt.id } });\n      await refresh();\n      setProjectMenuAnchor(null);\n    } finally {\n      setProjectActionBusy(false);\n    }\n  };\n\n  const copyToProject = async (destinationProjectId: string) => {\n    if (!prompt.project_id || projectActionBusy) return;\n    setProjectActionBusy(true);\n    try {\n      await copySavedPromptToProject({ data: { id: prompt.id, destinationProjectId } });\n      await refresh();\n      setProjectMenuAnchor(null);\n    } finally {\n      setProjectActionBusy(false);\n    }\n  };\n\n  const moveToAnotherProject = async (destinationProjectId: string) => {\n    if (!prompt.project_id || projectActionBusy) return;\n    setProjectActionBusy(true);\n    try {\n      await moveSavedPromptToProject({ data: { id: prompt.id, destinationProjectId } });\n      await refresh();\n      setProjectMenuAnchor(null);\n    } finally {\n      setProjectActionBusy(false);\n    }\n  };\n\n  const saveEdit = async (values: StandalonePromptEditValues) => {''',
)

# Desktop more button for project versions
replace_once(
    'src/routes/library.tsx',
    '''          <button\n            onClick={remove}\n            disabled={deleting}\n            aria-label={t("library.deletePrompt")}''',
    '''          <button\n            onClick={remove}\n            disabled={deleting}\n            aria-label={t("library.deletePrompt")}''',
)
# Insert after desktop delete button block via unique tail
replace_once(
    'src/routes/library.tsx',
    '''          </button>\n        </div>\n      </div>\n      <div className="mt-3 grid grid-cols-4 gap-2 sm:hidden">''',
    '''          </button>\n          {prompt.project_id && (\n            <button\n              type="button"\n              onClick={(event) => {\n                const rect = event.currentTarget.getBoundingClientRect();\n                setProjectMenuAnchor({ x: rect.right - 8, y: rect.bottom + 6 });\n              }}\n              className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"\n              aria-label={language === "el" ? "Περισσότερες επιλογές" : "More options"}\n              title={language === "el" ? "Περισσότερα" : "More"}\n            >\n              <MoreHorizontal className="h-3.5 w-3.5" />\n            </button>\n          )}\n        </div>\n      </div>\n      <div className="mt-3 grid grid-cols-4 gap-2 sm:hidden">''',
)

# Mobile more button chooses internal project menu
replace_once(
    'src/routes/library.tsx',
    '''          onClick={(event) => {\n            const rect = event.currentTarget.getBoundingClientRect();\n            onLongPress?.({ x: rect.right - 8, y: rect.bottom + 6 });\n          }}''',
    '''          onClick={(event) => {\n            const rect = event.currentTarget.getBoundingClientRect();\n            const anchor = { x: rect.right - 8, y: rect.bottom + 6 };\n            if (prompt.project_id) setProjectMenuAnchor(anchor);\n            else onLongPress?.(anchor);\n          }}''',
)

# Render project prompt action menu before dialogs
replace_once(
    'src/routes/library.tsx',
    '''      <EditStandalonePromptDialog\n        open={editing}''',
    '''      <ProjectPromptActionMenu\n        open={Boolean(prompt.project_id && projectMenuAnchor)}\n        anchor={projectMenuAnchor}\n        language={language}\n        title={prompt.custom_name || prompt.title || prompt.theme || t("library.untitledPrompt")}\n        currentProjectId={prompt.project_id}\n        projects={projects}\n        busy={projectActionBusy}\n        onClose={() => setProjectMenuAnchor(null)}\n        onDetach={detachFromProject}\n        onCopy={copyToProject}\n        onMove={moveToAnotherProject}\n      />\n      <EditStandalonePromptDialog\n        open={editing}''',
)

# Regression coverage appended to existing test suite
p = Path('src/lib/project-version-history.test.ts')
text = p.read_text()
needle = '''  test("detaching a Project version resets Project-only lineage before it can be reused", async () => {'''
idx = text.find(needle)
if idx < 0:
    raise SystemExit('test insertion anchor missing')
# append new test before final describe close
insert_at = text.rfind('\n});')
new_test = r'''

  test("Project prompt action menu supports detach, copy and move without renumbering source versions", async () => {
    const migration = await Bun.file(
      "supabase/migrations/20260925181500_project_prompt_rehome_actions.sql",
    ).text();
    const ai = await Bun.file("src/lib/ai.functions.ts").text();
    const library = await Bun.file("src/routes/library.tsx").text();
    const menu = await Bun.file(
      "src/components/promptbeats/ProjectPromptActionMenu.tsx",
    ).text();

    expect(migration).toContain("detach_prompt_project_version");
    expect(migration).toContain("copy_prompt_version_to_project");
    expect(migration).toContain("move_prompt_version_to_project");
    expect(migration).toContain("MAX(version_number)");
    expect(migration).not.toContain("version_number = version_number - 1");
    expect(migration).toContain("parent_prompt_id = v_source_parent_id");
    expect(migration).toContain("DELETE FROM public.project_version_tracks");
    expect(migration).toContain("UPDATE public.project_version_tracks");
    expect(migration).toContain("lyrics_review_latest");
    expect(ai).toContain("detachSavedPromptFromProject");
    expect(ai).toContain("copySavedPromptToProject");
    expect(ai).toContain("moveSavedPromptToProject");
    expect(library).toContain("<ProjectPromptActionMenu");
    expect(menu).toContain("Αφαίρεση από το Project");
    expect(menu).toContain("Αντιγραφή σε άλλο Project");
    expect(menu).toContain("Μετακίνηση σε άλλο Project");
  });
'''
p.write_text(text[:insert_at] + new_test + text[insert_at:])

print('patch applied')
