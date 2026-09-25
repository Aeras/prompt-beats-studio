from pathlib import Path
import re


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing exact pattern in {path}: {old[:120]!r}")
    text = text.replace(old, new, count)
    p.write_text(text)


def regex(path, pattern, repl, count=1):
    p = Path(path)
    text = p.read_text()
    text2, n = re.subn(pattern, repl, text, count=count, flags=re.S)
    if n != count:
        raise SystemExit(f"regex expected {count}, got {n} in {path}: {pattern[:100]!r}")
    p.write_text(text2)

# 1) Saved prompt organization/editing supports complete standalone edits and
#    clears folder placement when the prompt becomes a Project version.
ai = "src/lib/ai.functions.ts"
replace(ai,
'''        custom_name: z.string().trim().max(200).nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
        version_number: z.number().int().positive().nullable().optional(),
        version_label: z.string().trim().max(120).nullable().optional(),''',
'''        custom_name: z.string().trim().max(200).nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
        version_number: z.number().int().positive().nullable().optional(),
        version_label: z.string().trim().max(120).nullable().optional(),
        theme: z.string().max(500).nullable().optional(),
        genre: z.string().max(500).nullable().optional(),
        mood: z.string().max(120).nullable().optional(),
        language: z.string().max(80).nullable().optional(),
        tags: z.string().max(4000).nullable().optional(),
        lyrics: z.string().max(12000).nullable().optional(),
        note: z.string().max(6000).nullable().optional(),''')
replace(ai,
'''    if (data.custom_name !== undefined) patch.custom_name = data.custom_name;
    if (data.version_label !== undefined) patch.version_label = data.version_label;''',
'''    if (data.custom_name !== undefined) patch.custom_name = data.custom_name;
    if (data.version_label !== undefined) patch.version_label = data.version_label;
    if (data.theme !== undefined) patch.theme = data.theme;
    if (data.genre !== undefined) patch.genre = data.genre;
    if (data.mood !== undefined) patch.mood = data.mood;
    if (data.language !== undefined) patch.language = data.language;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.lyrics !== undefined) patch.lyrics = data.lyrics;
    if (data.note !== undefined) patch.note = data.note;''')
replace(ai,
'''      patch.project_id = data.project_id;
      patch.version_number = versionNumber;''',
'''      patch.project_id = data.project_id;
      patch.folder_id = null;
      patch.version_number = versionNumber;''')

# 2) Revision base can be either a Project version or a standalone prompt.
regex(ai,
r'''export const getPromptRevisionBase = createServerFn\(\{ method: "POST" \}\).*?\nexport const deleteSavedPrompt =''',
'''export const getPromptRevisionBase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid().nullable(),
        basePromptId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let project: { id: string; name: string } | null = null;
    if (data.projectId) {
      const { data: ownedProject, error: projectError } = await context.supabase
        .from("prompt_projects")
        .select("id, name")
        .eq("id", data.projectId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (projectError) throw new Error(projectError.message);
      if (!ownedProject) throw new Error("Project not found.");
      project = ownedProject;
    }

    let promptQuery = context.supabase
      .from("saved_prompts")
      .select(
        "id, title, custom_name, project_id, version_number, version_label, generator_input_snapshot, parent_prompt_id, revision_request, theme, genre, mood, language, tags, lyrics, note, created_at, updated_at",
      )
      .eq("id", data.basePromptId)
      .eq("user_id", context.userId);
    promptQuery = data.projectId
      ? promptQuery.eq("project_id", data.projectId)
      : promptQuery.is("project_id", null);
    const { data: prompt, error } = await promptQuery.maybeSingle();
    if (error) throw new Error(error.message);
    if (!prompt) throw new Error("Base prompt not found.");

    const snapshot = generatorInputSnapshotSchema.safeParse(prompt.generator_input_snapshot);
    return {
      project,
      prompt: {
        ...prompt,
        generator_input_snapshot: snapshot.success ? snapshot.data : null,
      },
    };
  });

export const deleteSavedPrompt =''')

# 3) Revision context supports a null project id for in-place standalone replacement.
shared = "src/lib/generator-revision.shared.ts"
replace(shared, '  projectId: z.string().uuid(),\n  versionNumber:', '  projectId: z.string().uuid().nullable(),\n  versionNumber:')
replace(shared, 'export const revisionJobContextSchema = z.object({\n  projectId: z.string().uuid(),', 'export const revisionJobContextSchema = z.object({\n  projectId: z.string().uuid().nullable(),')

jobs = "src/lib/generation-jobs.functions.ts"
replace(jobs, '      projectId: z.string().uuid(),\n      basePromptId:', '      projectId: z.string().uuid().nullable(),\n      basePromptId:')
regex(jobs,
r'''      const \{ data: project, error: projectError \} = await supabase\n        \.from\("prompt_projects"\).*?      if \(!project\) throw new Error\("Project not found\."\);\n\n      const \{ data: basePrompt, error: baseError \} = await supabase\n        \.from\("saved_prompts"\)\n        \.select\(\n          "id, project_id, version_number, version_label, custom_name, title, theme, genre, mood, language, tags, lyrics, note, generator_input_snapshot",\n        \)\n        \.eq\("id", clientRevision\.basePromptId\)\n        \.eq\("project_id", clientRevision\.projectId\)\n        \.eq\("user_id", context\.userId\)\n        \.maybeSingle\(\);''',
'''      if (clientRevision.projectId) {
        const { data: project, error: projectError } = await supabase
          .from("prompt_projects")
          .select("id")
          .eq("id", clientRevision.projectId)
          .eq("user_id", context.userId)
          .maybeSingle();
        if (projectError) throw new Error(projectError.message);
        if (!project) throw new Error("Project not found.");
      }

      let basePromptQuery = supabase
        .from("saved_prompts")
        .select(
          "id, project_id, version_number, version_label, custom_name, title, theme, genre, mood, language, tags, lyrics, note, generator_input_snapshot",
        )
        .eq("id", clientRevision.basePromptId)
        .eq("user_id", context.userId);
      basePromptQuery = clientRevision.projectId
        ? basePromptQuery.eq("project_id", clientRevision.projectId)
        : basePromptQuery.is("project_id", null);
      const { data: basePrompt, error: baseError } = await basePromptQuery.maybeSingle();''')

server = "src/lib/generation-jobs.server.ts"
regex(server,
r'''    if \(input\.operation === "revision" && input\.revision\) \{.*?\n    \}\n\n    await db''',
'''    if (input.operation === "revision" && input.revision) {
      const revision = input.revision;
      const versionChangeMetadata = buildProjectRevisionVersionMetadata({
        revisionRequest: revision.revisionRequest,
        baseSnapshot: revision.baseSnapshot,
        desiredSnapshot: revision.desiredSnapshot,
        beforeLyrics: revision.baseVersion.lyrics,
        afterLyrics: out.result.lyrics,
      });

      if (!revision.projectId) {
        const { data: replaced, error: replaceError } = await db
          .from("saved_prompts")
          .update({
            title: out.result.title,
            tags: out.result.tags,
            lyrics: out.result.lyrics,
            note: out.result.note,
            theme: input.theme,
            genre: input.genre,
            mood: input.mood,
            language: input.language,
            generator_input_snapshot: revision.desiredSnapshot,
            revision_request: revision.revisionRequest,
            version_change_metadata: versionChangeMetadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", revision.basePromptId)
          .eq("user_id", job.user_id)
          .is("project_id", null)
          .select("id")
          .maybeSingle();
        if (replaceError || !replaced) {
          console.error("[generation-job] standalone revision replace failed", job.id, replaceError?.message);
          throw new Error("The standalone Prompt could not be replaced.");
        }
        persistedResult = out.result;
      } else {
        const { data: saved, error: saveError } = await db.rpc("create_prompt_revision_version", {
          _user_id: job.user_id,
          _job_id: job.id,
          _project_id: revision.projectId,
          _parent_prompt_id: revision.basePromptId,
          _revision_request: revision.revisionRequest,
          _generator_input_snapshot: revision.desiredSnapshot,
          _version_change_metadata: versionChangeMetadata,
          _title: out.result.title,
          _tags: out.result.tags,
          _lyrics: out.result.lyrics,
          _note: out.result.note,
          _theme: input.theme,
          _genre: input.genre,
          _mood: input.mood,
          _language: input.language,
        });
        if (saveError) {
          console.error("[generation-job] revision save failed", job.id, saveError.message);
          throw new Error("The revision version could not be saved.");
        }
        const meta = saved as {
          id?: string;
          project_id?: string;
          version_number?: number;
          parent_prompt_id?: string;
        } | null;
        if (!meta?.id || !meta.project_id || !meta.version_number || !meta.parent_prompt_id) {
          throw new Error("The revision version could not be saved.");
        }
        persistedResult = {
          ...out.result,
          revisionMeta: {
            savedPromptId: meta.id,
            projectId: meta.project_id,
            versionNumber: meta.version_number,
            parentPromptId: meta.parent_prompt_id,
          },
        };
      }
    }

    await db''')

# 4) Lyrics Workspace can replace a standalone prompt in place.
lws = "src/lib/lyrics-workspace.shared.ts"
replace(lws, 'export const workspaceSaveInputSchema = z.object({\n  projectId: z.string().uuid(),', 'export const workspaceSaveInputSchema = z.object({\n  projectId: z.string().uuid().nullable(),')

lwf = "src/lib/lyrics-workspace.functions.ts"
regex(lwf,
r'''  \.handler\(async \(\{ data, context \}\) => \{.*?\n  \}\);''',
'''  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "lyrics_workspace");

    let baseQuery = context.supabase
      .from("saved_prompts")
      .select("id, lyrics")
      .eq("id", data.basePromptId)
      .eq("user_id", context.userId);
    baseQuery = data.projectId
      ? baseQuery.eq("project_id", data.projectId)
      : baseQuery.is("project_id", null);
    const { data: base, error: baseError } = await baseQuery.maybeSingle();
    if (baseError) throw new Error(baseError.message);
    if (!base) throw new Error("Base prompt not found.");

    if (!data.projectId) {
      const { data: replaced, error } = await context.supabase
        .from("saved_prompts")
        .update({ lyrics: data.lyrics, updated_at: new Date().toISOString() })
        .eq("id", data.basePromptId)
        .eq("user_id", context.userId)
        .is("project_id", null)
        .select("id")
        .maybeSingle();
      if (error || !replaced) throw new Error("The edited lyrics could not replace the standalone Prompt.");
      return {
        savedPromptId: replaced.id,
        projectId: null,
        versionNumber: null,
        parentPromptId: null,
        versionLabel: null,
      };
    }

    const { data: project, error: projectError } = await context.supabase
      .from("prompt_projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found.");

    const versionChangeMetadata = buildLyricsWorkspaceVersionMetadata({
      beforeLyrics: base.lyrics,
      afterLyrics: data.lyrics,
      versionLabel: data.versionLabel,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: raw, error } = await supabaseAdmin.rpc("create_prompt_lyrics_workspace_version", {
      _user_id: context.userId,
      _project_id: data.projectId,
      _parent_prompt_id: data.basePromptId,
      _lyrics: data.lyrics,
      _version_label: data.versionLabel,
      _version_change_metadata: versionChangeMetadata,
    });
    if (error) throw new Error("The edited lyrics could not be saved as a new version.");

    const parsed = saveResultSchema.safeParse(raw);
    if (!parsed.success) throw new Error("The edited lyrics could not be saved as a new version.");
    return {
      savedPromptId: parsed.data.id,
      projectId: parsed.data.project_id,
      versionNumber: parsed.data.version_number,
      parentPromptId: parsed.data.parent_prompt_id,
      versionLabel: parsed.data.version_label,
    };
  });''')

# 5) Generator loads standalone bases and sends null projectId through revision/workspace flows.
gen = "src/routes/generate.tsx"
replace(gen,
'''        data: { projectId: revisionProjectId, basePromptId: revisionBasePromptId },
      }),
    enabled: Boolean(user && revisionMode && revisionProjectId && revisionBasePromptId),''',
'''        data: { projectId: revisionProjectId || null, basePromptId: revisionBasePromptId },
      }),
    enabled: Boolean(user && revisionMode && revisionBasePromptId),''')
replace(gen,
'''        data: { projectId: search.project!, basePromptId: search.base! },
      }),
    enabled: Boolean(user && search.workspace === "lyrics" && search.project && search.base),''',
'''        data: { projectId: search.project ?? null, basePromptId: search.base! },
      }),
    enabled: Boolean(user && search.workspace === "lyrics" && search.base),''')
replace(gen,
'''          revision:
          revisionMode && revisionProjectId && revisionBasePromptId''',
'''          revision:
          revisionMode && revisionBasePromptId''')
replace(gen, '                projectId: revisionProjectId,\n                basePromptId:', '                projectId: revisionProjectId || null,\n                basePromptId:')
replace(gen, '          projectId: search.project!,\n          basePromptId: search.base!,', '          projectId: search.project ?? null,\n          basePromptId: search.base!,')

# 6) Library UX: complete edit, compact mobile actions and standalone warning / project choice.
lib = "src/routes/library.tsx"
replace(lib,
'''import { DeletePromptProjectDialog } from "@/components/promptbeats/DeletePromptProjectDialog";
import { LibraryTracksEmptyState }''',
'''import { DeletePromptProjectDialog } from "@/components/promptbeats/DeletePromptProjectDialog";
import {
  EditStandalonePromptDialog,
  StandalonePromptRevisionDialog,
  type StandalonePromptEditValues,
} from "@/components/promptbeats/PromptStandaloneDialogs";
import { LibraryTracksEmptyState }''')
replace(lib,
'''  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();''',
'''  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [standaloneAction, setStandaloneAction] = useState<"revision" | "lyrics" | null>(null);
  const [movingToProject, setMovingToProject] = useState(false);
  const queryClient = useQueryClient();''')
replace(lib,
'''  const revise = () => {
    if (!prompt.project_id) return;
    void navigate({
      to: "/generate",
      search: {
        mode: "revision",
        project: prompt.project_id,
        base: prompt.id,
      },
    });
  };

  const editLyrics = () => {
    if (!prompt.project_id) return;
    void navigate({
      to: "/generate",
      search: {
        workspace: "lyrics",
        project: prompt.project_id,
        base: prompt.id,
      },
    });
  };

  const move = async (projectId: string) => {
    const next = projectId || null;
    await updateSavedPromptOrganization({ data: { id: prompt.id, project_id: next } });
    await refresh();
  };''',
'''  const openAction = (action: "revision" | "lyrics", projectId: string | null) => {
    if (!projectId) {
      setStandaloneAction(action);
      return;
    }
    void navigate({
      to: "/generate",
      search:
        action === "revision"
          ? { mode: "revision" as const, project: projectId, base: prompt.id }
          : { workspace: "lyrics" as const, project: projectId, base: prompt.id },
    });
  };
  const revise = () => openAction("revision", prompt.project_id);
  const editLyrics = () => openAction("lyrics", prompt.project_id);

  const move = async (projectId: string) => {
    const next = projectId || null;
    await updateSavedPromptOrganization({ data: { id: prompt.id, project_id: next } });
    await refresh();
  };

  const saveEdit = async (values: StandalonePromptEditValues) => {
    setSavingEdit(true);
    try {
      await updateSavedPromptOrganization({ data: { id: prompt.id, ...values } });
      await refresh();
      setEditing(false);
    } finally {
      setSavingEdit(false);
    }
  };

  const continueStandalone = () => {
    const action = standaloneAction;
    if (!action) return;
    setStandaloneAction(null);
    void navigate({
      to: "/generate",
      search:
        action === "revision"
          ? { mode: "revision" as const, base: prompt.id }
          : { workspace: "lyrics" as const, base: prompt.id },
    });
  };

  const addToProjectThenContinue = async (projectId: string) => {
    const action = standaloneAction;
    if (!action) return;
    setMovingToProject(true);
    try {
      await updateSavedPromptOrganization({ data: { id: prompt.id, project_id: projectId } });
      await refresh();
      setStandaloneAction(null);
      openAction(action, projectId);
    } finally {
      setMovingToProject(false);
    }
  };''')
replace(lib, '        <div className="flex shrink-0 gap-1">\n          {prompt.project_id && lyricsWorkspaceAccess.allowed && (', '        <div className="hidden shrink-0 gap-1 sm:flex">\n          {lyricsWorkspaceAccess.allowed && (')
replace(lib, '          {prompt.project_id && generatorAccess.allowed && (', '          {generatorAccess.allowed && (')
replace(lib,
'''          <button
            type="button"
            onClick={rename}
            aria-label={language === "el" ? "Μετονομασία Prompt" : "Rename Prompt"}
            title={language === "el" ? "Μετονομασία Prompt" : "Rename Prompt"}''',
'''          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={language === "el" ? "Επεξεργασία Prompt" : "Edit Prompt"}
            title={language === "el" ? "Επεξεργασία Prompt" : "Edit Prompt"}''')
# Insert the mobile four-action row immediately after the header row.
replace(lib,
'''        </div>
      </div>
      {listMode && (''',
'''        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:hidden">
        <button type="button" onClick={() => setEditing(true)} className="grid min-h-11 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:text-accent" aria-label={language === "el" ? "Επεξεργασία Prompt" : "Edit Prompt"} title={language === "el" ? "Επεξεργασία" : "Edit"}><Pencil className="h-4 w-4" /></button>
        <button type="button" onClick={() => copy([prompt.tags, prompt.lyrics].filter(Boolean).join("\\n\\n"))} className="grid min-h-11 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:text-accent" aria-label={t("library.copyPrompt")} title={t("library.copyPrompt")}>{copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}</button>
        <button type="button" onClick={remove} disabled={deleting} className="grid min-h-11 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:text-destructive disabled:opacity-50" aria-label={t("library.deletePrompt")} title={t("library.deletePrompt")}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
        <button type="button" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onLongPress?.({ x: rect.right - 8, y: rect.bottom + 6 }); }} className="grid min-h-11 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:text-accent" aria-label={language === "el" ? "Περισσότερες επιλογές" : "More options"} title={language === "el" ? "Περισσότερα" : "More"}><MoreHorizontal className="h-4 w-4" /></button>
      </div>
      {listMode && (''')
# Dialogs before article closes (target unique tail of SavedPromptCard).
replace(lib,
'''      {(!listMode || expanded) && !compact && prompt.lyrics && (
        <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-[11px] text-muted-foreground">
          {prompt.lyrics}
        </pre>
      )}
    </article>''',
'''      {(!listMode || expanded) && !compact && prompt.lyrics && (
        <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-[11px] text-muted-foreground">
          {prompt.lyrics}
        </pre>
      )}
      <EditStandalonePromptDialog
        open={editing}
        language={language}
        prompt={prompt}
        busy={savingEdit}
        onClose={() => setEditing(false)}
        onSave={saveEdit}
      />
      <StandalonePromptRevisionDialog
        open={Boolean(standaloneAction)}
        language={language}
        projects={projects}
        busy={movingToProject}
        onClose={() => setStandaloneAction(null)}
        onReplace={continueStandalone}
        onAddToProject={addToProjectThenContinue}
      />
    </article>''')

# 7) Regression coverage for the agreed behavior.
test = "src/lib/library-folders.test.ts"
p = Path(test)
txt = p.read_text()
insert = '''\n\n  test("standalone prompts support full edit, compact mobile actions and safe revision choice", async () => {\n    const library = await source("src/routes/library.tsx");\n    const ai = await source("src/lib/ai.functions.ts");\n    const dialogs = await source("src/components/promptbeats/PromptStandaloneDialogs.tsx");\n    const jobs = await source("src/lib/generation-jobs.server.ts");\n    expect(library).toContain("EditStandalonePromptDialog");\n    expect(library).toContain("StandalonePromptRevisionDialog");\n    expect(dialogs).toContain("Συνέχεια και αντικατάσταση");\n    expect(dialogs).toContain("Προσθήκη σε Project");\n    expect(ai).toContain("patch.folder_id = null");\n    expect(ai).toContain("patch.lyrics = data.lyrics");\n    expect(jobs).toContain("standalone revision replace failed");\n    expect(jobs).toContain('.is("project_id", null)');\n  });\n'''
if 'standalone prompts support full edit, compact mobile actions and safe revision choice' not in txt:
    idx = txt.rfind('\n});')
    if idx < 0:
        raise SystemExit('could not append library regression test')
    txt = txt[:idx] + insert + txt[idx:]
    p.write_text(txt)

print("prompt/projects patch applied")
