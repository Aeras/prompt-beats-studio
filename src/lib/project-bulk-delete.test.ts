import { describe, expect, test } from "bun:test";

const ROOT = new URL("../../", import.meta.url);
const source = (path: string) => Bun.file(new URL(path, ROOT)).text();

describe("Project bulk deletion", () => {
  test("database operation is one invoker-rights transaction with ownership validation", async () => {
    const sql = await source("supabase/migrations/20260929215330_bulk_prompt_project_delete.sql");
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.bulk_delete_prompt_projects(_plans jsonb)",
    );
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("FROM public.prompt_projects");
    expect(sql).toContain("FROM public.saved_prompts");
    expect(sql).toContain("DELETE FROM public.saved_prompts");
    expect(sql).toContain("DELETE FROM public.prompt_projects");
    expect(sql).toContain("Bulk Project deletion did not complete atomically.");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.bulk_delete_prompt_projects(jsonb) FROM PUBLIC, anon",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.bulk_delete_prompt_projects(jsonb) TO authenticated, service_role",
    );
  });

  test("preview is owner-scoped and reports prompt versions plus Song Universe impact", async () => {
    const functions = await source("src/lib/project-bulk-delete.functions.ts");
    expect(functions).toContain("requireSupabaseAuth");
    expect(functions).toContain('.from("prompt_projects")');
    expect(functions).toContain('.eq("user_id", context.userId)');
    expect(functions).toContain('.from("saved_prompts")');
    expect(functions).toContain(
      '"id,project_id,title,custom_name,version_number,version_label,theme"',
    );
    expect(functions).toContain('.from("song_universe_projects")');
    expect(functions).toContain("song_universes!inner(id,title,owner_id)");
    expect(functions).toContain('.rpc(\n      "bulk_delete_prompt_projects"');
  });

  test("review UI uses compact Title — Vn rows and supports project-level indeterminate selection", async () => {
    const dialog = await source("src/components/promptbeats/BulkDeletePromptProjectsDialog.tsx");
    expect(dialog).toContain("return `V${prompt.versionNumber}`");
    expect(dialog).toContain(
      "return version ? `${promptTitle(prompt)} — ${version}` : promptTitle(prompt)",
    );
    expect(dialog).toContain("node.indeterminate = partiallySelected");
    expect(dialog).toContain("ChevronRight");
    expect(dialog).toContain("remainingPromptCount");
    expect(dialog).toContain("Song Universe:");
    expect(dialog).not.toContain("SavedPromptCard");
  });

  test("Library long press enters Project selection while folders keep their existing action sheet", async () => {
    const actions = await source("src/components/promptbeats/LibraryItemActionSheet.tsx");
    expect(actions).toContain("projectBulkSelectionIdFromElement");
    expect(actions).toContain("activateProjectBulkSelection(projectId)");
    expect(actions).toContain("toggleProjectBulkSelection(projectId)");
    expect(actions).toContain("onLongPress(point)");
  });

  test("project list export control exposes selection checkboxes and one shared controller", async () => {
    const exportControl = await source("src/components/promptbeats/ExportControl.tsx");
    const controller = await source(
      "src/components/promptbeats/ProjectBulkSelectionController.tsx",
    );
    expect(exportControl).toContain("data-pb-project-bulk-id");
    expect(exportControl).toContain("registerBulkSelectableProject");
    expect(exportControl).toContain("ProjectBulkSelectionController");
    expect(controller).toContain('"Επιλογή όλων"');
    expect(controller).toContain("`Διαγραφή (${snapshot.selectedIds.length})`");
    expect(controller).toContain("BulkDeletePromptProjectsDialog");
    expect(controller).toContain("bulkDeletePromptProjects");
  });

  test("single Project delete uses the same compact title/version wording", async () => {
    const single = await source("src/components/promptbeats/DeletePromptProjectDialog.tsx");
    expect(single).toContain(
      'const title = prompt.custom_name || prompt.title || prompt.theme || "Prompt"',
    );
    expect(single).toContain("`V${prompt.version_number}`");
    expect(single).toContain("return version ? `${title} — ${version}` : title");
  });
});
