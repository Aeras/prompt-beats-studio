from pathlib import Path

p = Path("src/routes/library.tsx")
s = p.read_text()
s = s.replace(
    'import { PromptBeatsFolderIcon } from "@/components/promptbeats/PromptBeatsFolderIcon";',
    'import { PromptBeatsFolderIcon } from "@/components/promptbeats/PromptBeatsFolderIcon";\nimport { DeletePromptProjectDialog } from "@/components/promptbeats/DeletePromptProjectDialog";',
    1,
)
s = s.replace(
    '  const [busy, setBusy] = useState(false);\n  const [promptDisplayMode, setPromptDisplayMode] = useState<"expanded" | "list">("list");',
    '  const [busy, setBusy] = useState(false);\n  const [deleteProjectDialog, setDeleteProjectDialog] = useState<PromptProject | null>(null);\n  const [promptDisplayMode, setPromptDisplayMode] = useState<"expanded" | "list">("list");',
    1,
)
old = '''  const removeProject = async (project: PromptProject) => {
    if (
      !window.confirm(
        language === "el"
          ? "Να διαγραφεί το project; Τα prompts και οι αναλύσεις θα παραμείνουν στη βιβλιοθήκη χωρίς project."
          : "Delete this project? Its prompts and analyses will remain in your library with no project.",
      )
    )
      return;
    setBusy(true);
    try {
      await deletePromptProject({ data: { id: project.id } });
      await refresh();
    } finally {
      setBusy(false);
    }
  };'''
new = '''  const removeProject = (project: PromptProject) => {
    setDeleteProjectDialog(project);
  };
  const confirmRemoveProject = async (deletePromptIds: string[]) => {
    if (!deleteProjectDialog) return;
    setBusy(true);
    try {
      await deletePromptProject({ data: { id: deleteProjectDialog.id, deletePromptIds } });
      setDeleteProjectDialog(null);
      await refresh();
    } catch (error) {
      await refresh();
      window.alert(
        error instanceof Error
          ? error.message
          : language === "el"
            ? "Η διαγραφή του project απέτυχε."
            : "Project deletion failed.",
      );
    } finally {
      setBusy(false);
    }
  };'''
if old not in s:
    raise SystemExit("removeProject block not found")
s = s.replace(old, new, 1)
marker = '  return (\n    <div className="mt-6 space-y-4">'
insert = '''  const deleteDialogPrompts = deleteProjectDialog
    ? prompts.filter((prompt) => prompt.project_id === deleteProjectDialog.id)
    : [];

  return (
    <div className="mt-6 space-y-4">
      <DeletePromptProjectDialog
        open={Boolean(deleteProjectDialog)}
        language={language}
        projectName={deleteProjectDialog?.name ?? ""}
        prompts={deleteDialogPrompts}
        busy={busy}
        onClose={() => setDeleteProjectDialog(null)}
        onConfirm={confirmRemoveProject}
      />'''
if marker not in s:
    raise SystemExit("return marker not found")
p.write_text(s.replace(marker, insert, 1))

p = Path("src/lib/ai.functions.ts")
s = p.read_text()
old = '''export const deletePromptProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("prompt_projects")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });'''
new = '''export const deletePromptProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        deletePromptIds: z.array(z.string().uuid()).max(500).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const requestedPromptIds = Array.from(new Set(data.deletePromptIds));
    if (requestedPromptIds.length > 0) {
      const { data: ownedPrompts, error: promptError } = await context.supabase
        .from("saved_prompts")
        .select("id")
        .eq("user_id", context.userId)
        .eq("project_id", data.id)
        .in("id", requestedPromptIds);
      if (promptError) throw new Error(promptError.message);
      if ((ownedPrompts ?? []).length !== requestedPromptIds.length) {
        throw new Error("One or more selected prompts do not belong to this project.");
      }
    }

    const { data: deletedProject, error } = await context.supabase
      .from("prompt_projects")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deletedProject) throw new Error("Project not found.");

    if (requestedPromptIds.length > 0) {
      const { error: deletePromptError } = await context.supabase
        .from("saved_prompts")
        .delete()
        .eq("user_id", context.userId)
        .in("id", requestedPromptIds);
      if (deletePromptError) throw new Error(deletePromptError.message);
    }
    return { ok: true, deletedPromptCount: requestedPromptIds.length };
  });'''
if old not in s:
    raise SystemExit("server block not found")
p.write_text(s.replace(old, new, 1))

p = Path("src/lib/library-folders.test.ts")
s = p.read_text()
test = '''

  test("project deletion supports selective prompt removal with safe default", async () => {
    const library = await source("src/routes/library.tsx");
    const dialog = await source("src/components/promptbeats/DeletePromptProjectDialog.tsx");
    const ai = await source("src/lib/ai.functions.ts");
    expect(library).toContain("DeletePromptProjectDialog");
    expect(library).toContain("deletePromptIds");
    expect(dialog).toContain("Διαγραφή και prompts από αυτό το Project");
    expect(dialog).toContain("Delete Project + all prompts");
    expect(ai).toContain("deletePromptIds: z.array(z.string().uuid()).max(500).default([])");
    expect(ai).toContain("One or more selected prompts do not belong to this project.");
    expect(ai).toContain("deletedPromptCount");
  });'''
idx = s.rfind("\n});\n")
if idx < 0:
    raise SystemExit("test end not found")
p.write_text(s[:idx] + test + s[idx:])
