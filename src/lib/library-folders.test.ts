import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Library folders foundation", () => {
  test("uses one shared hierarchical folder model for Projects and standalone Prompts", async () => {
    const sql = await source("supabase/migrations/20260922184000_library_folders_foundation.sql");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.library_folders");
    expect(sql).toContain("parent_folder_id uuid NULL REFERENCES public.library_folders(id)");
    expect(sql).toContain("ALTER TABLE public.prompt_projects");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS folder_id uuid NULL");
    expect(sql).toContain("ALTER TABLE public.saved_prompts");
    expect(sql).toContain("saved_prompts_folder_only_for_standalone_check");
    expect(sql).toContain("CHECK (project_id IS NULL OR folder_id IS NULL)");
  });

  test("caps nesting at five levels and prevents circular hierarchy", async () => {
    const sql = await source("supabase/migrations/20260922184000_library_folders_foundation.sql");

    expect(sql).toContain("validate_library_folder_hierarchy");
    expect(sql).toContain("Folder nesting cannot exceed 5 levels");
    expect(sql).toContain("A folder cannot be moved into itself");
    expect(sql).toContain("A folder cannot be moved into one of its descendants");
    expect(sql).toContain("id = NEW.id");
  });

  test("folder ownership is enforced in RLS and destination triggers", async () => {
    const sql = await source("supabase/migrations/20260922184000_library_folders_foundation.sql");

    expect(sql).toContain('CREATE POLICY "Users manage their own library folders"');
    expect(sql).toContain("user_id = (SELECT auth.uid())");
    expect(sql).toContain("validate_library_item_folder_ownership");
    expect(sql).toContain("Destination folder does not belong to this user");
  });

  test("same-name folders are allowed in different branches but not under the same parent", async () => {
    const sql = await source("supabase/migrations/20260922184000_library_folders_foundation.sql");

    expect(sql).toContain("library_folders_unique_sibling_name_idx");
    expect(sql).toContain("COALESCE(parent_folder_id");
    expect(sql).toContain("lower(btrim(name))");
  });

  test("current-folder listing returns only direct children, Projects and standalone Prompts", async () => {
    const server = await source("src/lib/library-folders.functions.ts");

    expect(server).toContain("listLibraryFolderContents");
    expect(server).toContain('.eq("parent_folder_id", folderId)');
    expect(server).toContain('.is("parent_folder_id", null)');
    expect(server).toContain('.from("prompt_projects")');
    expect(server).toContain('.from("saved_prompts")');
    expect(server).toContain('.is("project_id", null)');
  });

  test("moving a Project changes only the Project container location", async () => {
    const server = await source("src/lib/library-folders.functions.ts");
    const start = server.indexOf("export const movePromptProjectToFolder");
    const next = server.indexOf("export const", start + 20);
    const block = server.slice(start, next === -1 ? server.length : next);

    expect(block).toContain('.from("prompt_projects")');
    expect(block).toContain("folder_id: destinationFolderId");
    expect(block).not.toContain('.from("saved_prompts")');
  });

  test("individual Project versions cannot receive their own folder assignment", async () => {
    const server = await source("src/lib/library-folders.functions.ts");
    const start = server.indexOf("export const moveStandalonePromptToFolder");
    const next = server.indexOf("export const", start + 20);
    const block = server.slice(start, next === -1 ? server.length : next);

    expect(block).toContain("if (prompt.project_id)");
    expect(block).toContain("Move the Project instead");
    expect(block).toContain('.is("project_id", null)');
  });

  test("folder delete is empty-only", async () => {
    const server = await source("src/lib/library-folders.functions.ts");

    expect(server).toContain("Folder must be empty before deletion.");
    expect(server).toContain('.from("library_folders")');
    expect(server).toContain('.from("prompt_projects")');
    expect(server).toContain('.from("saved_prompts")');
  });

  test("folder picker search exposes full paths without raw path storage", async () => {
    const sql = await source("supabase/migrations/20260922184000_library_folders_foundation.sql");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.search_library_folders");
    expect(sql).toContain("tree.path || ' / ' || child.name");
    expect(sql).not.toContain("path text NOT NULL");
  });

  test("Folder Picker is reusable for Move flows and always supports Root/breadcrumb navigation", async () => {
    const picker = await source("src/components/promptbeats/LibraryFolderPicker.tsx");

    expect(picker).toContain("listLibraryFolderContents");
    expect(picker).toContain("getLibraryFolderBreadcrumbs");
    expect(picker).toContain("searchLibraryFolders");
    expect(picker).toContain('Root');
    expect(picker).toContain("onSelect(null");
    expect(picker).toContain("breadcrumbItems.map");
  });

  test("Saved Prompts All view is a current-folder file manager with recursive scoped search", async () => {
    const library = await source("src/routes/library.tsx");
    const searchMigration = await source("supabase/migrations/20260922192000_library_folder_recursive_search.sql");

    expect(library).toContain("listLibraryFolderContents");
    expect(library).toContain("searchLibraryScope");
    expect(library).toContain("folder-breadcrumbs");
    expect(library).toContain("Νέος Φάκελος");
    expect(library).toContain("Move Project");
    expect(searchMigration).toContain("WITH RECURSIVE full_tree");
    expect(searchMigration).toContain("scope_tree AS");
    expect(searchMigration).toContain("sp.project_id IS NULL");
    expect(searchMigration).toContain("COALESCE(ft.path, 'Root')");
  });

  test("Folder browser moves Projects as containers and standalone Prompts independently", async () => {
    const library = await source("src/routes/library.tsx");

    expect(library).toContain("movePromptProjectToFolder");
    expect(library).toContain("moveStandalonePromptToFolder");
    expect(library).toContain("moveLibraryFolder");
    expect(library).toContain('kind: "project"');
    expect(library).toContain('kind: "prompt"');
    expect(library).toContain('kind: "folder"');
  });

  test("new Projects can be created directly inside the current folder", async () => {
    const ai = await source("src/lib/ai.functions.ts");
    const library = await source("src/routes/library.tsx");

    expect(ai).toContain("folderId: z.string().uuid().nullable().optional()");
    expect(ai).toContain("folder_id: data.folderId ?? null");
    expect(library).toContain('folderId: view === "all" ? currentFolderId : null');
  });

  test("duplicate provenance columns exist without creating a branch graph", async () => {
    const sql = await source("supabase/migrations/20260922184000_library_folders_foundation.sql");

    expect(sql).toContain("duplicated_from_project_id");
    expect(sql).toContain("duplicated_from_prompt_id");
  });
});
