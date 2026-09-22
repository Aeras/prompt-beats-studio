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

  test("duplicate provenance columns exist without creating a branch graph", async () => {
    const sql = await source("supabase/migrations/20260922184000_library_folders_foundation.sql");

    expect(sql).toContain("duplicated_from_project_id");
    expect(sql).toContain("duplicated_from_prompt_id");
  });
});
