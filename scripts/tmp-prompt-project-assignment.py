from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label}: target not found")
    return text.replace(old, new, 1)

# Replace the race-prone standalone -> Project allocation path with the atomic RPC.
p = Path("src/lib/ai.functions.ts")
s = p.read_text()
old = '''    if (data.project_id !== undefined && data.project_id !== current.project_id) {
      if (current.project_id) {
        throw new Error(
          "Project versions cannot be moved between projects. Create or save a new version instead.",
        );
      }
      if (!data.project_id) {
        throw new Error("This prompt is not assigned to a project.");
      }

      const { data: targetProject, error: targetError } = await context.supabase
        .from("prompt_projects")
        .select("id")
        .eq("id", data.project_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (targetError) throw new Error(targetError.message);
      if (!targetProject) throw new Error("Project not found.");

      const { data: previous, error: previousError } = await context.supabase
        .from("saved_prompts")
        .select("id, generator_input_snapshot, lyrics")
        .eq("project_id", data.project_id)
        .eq("user_id", context.userId)
        .order("version_number", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previousError) throw new Error(previousError.message);

      const { data: next, error: versionError } = await context.supabase.rpc(
        "next_prompt_project_version",
        {
          p_project_id: data.project_id,
        },
      );
      if (versionError) throw new Error(versionError.message);
      const versionNumber = Number(next ?? 1);

      const currentSnapshot = generatorInputSnapshotSchema.safeParse(
        current.generator_input_snapshot,
      );
      const previousSnapshot = generatorInputSnapshotSchema.safeParse(
        previous?.generator_input_snapshot,
      );
      const metadata =
        versionNumber === 1
          ? buildInitialVersionMetadata()
          : buildManualVersionMetadata({
              baseSnapshot: previousSnapshot.success ? previousSnapshot.data : null,
              desiredSnapshot: currentSnapshot.success ? currentSnapshot.data : null,
              beforeLyrics: previous?.lyrics ?? null,
              afterLyrics: current.lyrics,
            });

      patch.project_id = data.project_id;
      patch.version_number = versionNumber;
      patch.parent_prompt_id = previous?.id ?? null;
      patch.version_change_metadata = metadata as Json;

      const { error: touchError } = await context.supabase
        .from("prompt_projects")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", data.project_id)
        .eq("user_id", context.userId);
      if (touchError) throw new Error(touchError.message);
    }

    const { error } = await context.supabase
      .from("saved_prompts")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };'''
new = '''    if (data.project_id !== undefined && data.project_id !== current.project_id) {
      if (current.project_id) {
        throw new Error(
          "Project versions cannot be moved between projects. Create or save a new version instead.",
        );
      }
      if (!data.project_id) {
        throw new Error("This prompt is not assigned to a project.");
      }

      const { data: assigned, error: assignError } = await context.supabase.rpc(
        "assign_standalone_prompt_to_project",
        {
          _prompt_id: data.id,
          _project_id: data.project_id,
        },
      );
      if (assignError) throw new Error(assignError.message);
      return { ok: true, assignment: assigned };
    }

    const { error } = await context.supabase
      .from("saved_prompts")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };'''
s = replace_once(s, old, new, "ai assignment block")
p.write_text(s)

# Add generated-style RPC typing.
p = Path("src/integrations/supabase/types.ts")
s = p.read_text()
needle = '''      next_prompt_project_version: {
        Args: { p_project_id: string };
        Returns: number;
      };'''
insert = '''      assign_standalone_prompt_to_project: {
        Args: { _prompt_id: string; _project_id: string };
        Returns: Json;
      };
      next_prompt_project_version: {
        Args: { p_project_id: string };
        Returns: number;
      };'''
s = replace_once(s, needle, insert, "rpc type")
p.write_text(s)

# SavedPromptCard: invalidate every relevant Library view, show immediate selection,
# disable the selector while saving and revert with a visible error if the write fails.
p = Path("src/routes/library.tsx")
s = p.read_text()
s = replace_once(
    s,
    '  const [expanded, setExpanded] = useState(false);\n  const queryClient = useQueryClient();',
    '  const [expanded, setExpanded] = useState(false);\n  const [projectSaving, setProjectSaving] = useState(false);\n  const [projectSelection, setProjectSelection] = useState(prompt.project_id ?? "");\n  const [projectError, setProjectError] = useState("");\n  const queryClient = useQueryClient();',
    "card project state",
)
s = replace_once(
    s,
    '''  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),
    ]);''',
    '''  useEffect(() => {
    if (!projectSaving) setProjectSelection(prompt.project_id ?? "");
  }, [projectSaving, prompt.project_id]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-contents"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-scope-search"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-picker"], exact: false }),
    ]);''',
    "card refresh",
)
s = replace_once(
    s,
    '''  const move = async (projectId: string) => {
    const next = projectId || null;
    await updateSavedPromptOrganization({ data: { id: prompt.id, project_id: next } });
    await refresh();
  };''',
    '''  const move = async (projectId: string) => {
    if (!projectId || projectSaving || prompt.project_id) return;
    const previous = projectSelection;
    setProjectSelection(projectId);
    setProjectSaving(true);
    setProjectError("");
    try {
      await updateSavedPromptOrganization({ data: { id: prompt.id, project_id: projectId } });
      await refresh();
    } catch (error) {
      setProjectSelection(previous);
      setProjectError(
        error instanceof Error
          ? error.message
          : language === "el"
            ? "Η ανάθεση στο Project απέτυχε."
            : "Could not assign this prompt to the Project.",
      );
    } finally {
      setProjectSaving(false);
    }
  };''',
    "card move",
)
s = replace_once(
    s,
    '''            <select
              value={prompt.project_id ?? ""}
              onChange={(e) => move(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-xs"
            >''',
    '''            <select
              value={projectSelection}
              disabled={projectSaving || Boolean(prompt.project_id)}
              onChange={(e) => void move(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-xs disabled:opacity-60"
            >''',
    "card selector",
)
# Project versions cannot be detached here; remove stale remove-from-project branch from this standalone selector.
old_remove = '''            {prompt.project_id && (
              <button
                type="button"
                aria-label={language === "el" ? "Αφαίρεση από project" : "Remove from project"}
                title={language === "el" ? "Αφαίρεση από project" : "Remove from project"}
                onClick={() => move("")}
                className="min-h-10 min-w-10 rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
              >
                <FolderX className="h-4 w-4" />
              </button>
            )}'''
if old_remove in s:
    s = s.replace(old_remove, '''            {projectSaving && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />}''', 1)
# Error directly below the selector.
selector_close = '''          </div>
        ))}
      {(!listMode || expanded) && !compact && prompt.revision_request && ('''
selector_new = '''          </div>
        ))}
      {projectError && <p className="mt-2 text-xs text-red-400">{projectError}</p>}
      {(!listMode || expanded) && !compact && prompt.revision_request && ('''
s = replace_once(s, selector_close, selector_new, "card selector error")
p.write_text(s)

# Regression coverage for the race fix and cache synchronization.
p = Path("src/lib/library-folders.test.ts")
s = p.read_text()
needle = '\n});\n'
test = '''

  test("standalone prompts are assigned to Projects atomically and refresh every Library projection", async () => {
    const library = await source("src/routes/library.tsx");
    const ai = await source("src/lib/ai.functions.ts");
    const migration = await source(
      "supabase/migrations/20260925103000_atomic_prompt_project_assignment.sql",
    );

    expect(ai).toContain('"assign_standalone_prompt_to_project"');
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("uq_saved_prompts_project_version");
    expect(library).toContain('["library", "folder-contents"]');
    expect(library).toContain("projectSelection");
    expect(library).toContain("projectSaving");
    expect(library).toContain("setProjectSelection(previous)");
  });'''
idx = s.rfind(needle)
if idx < 0:
    raise SystemExit("test end not found")
s = s[:idx] + test + s[idx:]
p.write_text(s)

print("prompt project assignment patch applied")
