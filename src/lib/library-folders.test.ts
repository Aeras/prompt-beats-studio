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

  test("caps nesting at five levels for the whole moved subtree and prevents circular hierarchy", async () => {
    const foundation = await source(
      "supabase/migrations/20260922184000_library_folders_foundation.sql",
    );
    const hardening = await source(
      "supabase/migrations/20260922210500_library_folder_integrity_hardening.sql",
    );

    expect(foundation).toContain("A folder cannot be moved into itself");
    expect(foundation).toContain("A folder cannot be moved into one of its descendants");
    expect(hardening).toContain("validate_library_folder_hierarchy");
    expect(hardening).toContain("v_subtree_height");
    expect(hardening).toContain("v_node_depth + v_subtree_height - 1 > 5");
    expect(hardening).toContain("Folder nesting cannot exceed 5 levels");
    expect(hardening).toContain("bool_or(id = NEW.id)");
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
    expect(server).toContain("has_subfolders");
    expect(server).toContain('.in("parent_folder_id", folderIds)');
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
    expect(picker).toContain("Root");
    expect(picker).toContain("onSelect(null");
    expect(picker).toContain("breadcrumbItems.map");
    expect(picker).toContain("disabledDestinationFolderId");
    expect(picker).toContain("destinationDisabled");
    expect(picker).toContain("Folders in this location");
    expect(picker).toContain("Current location:");
    expect(picker).not.toContain("autoFocus");
  });

  test("Saved Prompts and Projects views share the current-folder file manager with recursive scoped search", async () => {
    const library = await source("src/routes/library.tsx");
    const searchMigration = await source(
      "supabase/migrations/20260922192000_library_folder_recursive_search.sql",
    );

    expect(library).toContain("listLibraryFolderContents");
    expect(library).toContain("searchLibraryScope");
    expect(library).toContain("folder-breadcrumbs");
    expect(library).toContain("promptbeats:library-current-folder");
    expect(library).toContain("Νέος Φάκελος");
    expect(library).toContain("Move Project");
    expect(library).toContain('(view === "all" || (view === "projects" && !openProject))');
    expect(library).toContain('view === "all" && (folderContents.data?.prompts ?? []).length > 0');
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
    expect(library).toContain('folderId: view === "analyses" ? null : currentFolderId');
  });

  test("Duplicate Project is transactional, copies all versions and rebuilds the internal parent graph in two passes", async () => {
    const base = await source(
      "supabase/migrations/20260922193000_library_folder_transactional_duplicate.sql",
    );
    const hardening = await source(
      "supabase/migrations/20260922210500_library_folder_integrity_hardening.sql",
    );

    expect(base).toContain("duplicated_from_project_id");
    expect(base).toContain("duplicated_from_prompt_id");
    expect(base).toContain("source_generation_job_id");
    expect(hardening).toContain(
      "CREATE OR REPLACE FUNCTION public.duplicate_prompt_project_to_folder",
    );
    expect(hardening).toContain("Pass 1");
    expect(hardening).toContain("Pass 2");
    expect(hardening).toContain("v_id_map");
    expect(hardening).toContain("SET parent_prompt_id = v_new_parent_id");
    expect(hardening).toContain(
      "Project version graph contains an external or missing parent reference",
    );
    expect(hardening).toContain("Preferred Project version could not be mapped");
  });

  test("Duplicate standalone Prompt produces an independent copy in the selected folder", async () => {
    const sql = await source(
      "supabase/migrations/20260922193000_library_folder_transactional_duplicate.sql",
    );
    const server = await source("src/lib/library-folders.functions.ts");

    expect(sql).toContain("duplicate_standalone_prompt_to_folder");
    expect(sql).toContain("project_id IS NULL");
    expect(sql).toContain("v_source.generator_input_snapshot");
    expect(server).toContain("duplicateStandalonePromptToFolder");
    expect(server).toContain("duplicatePromptProjectToFolder");
  });

  test("Duplicate does not copy audio or track records", async () => {
    const sql = await source(
      "supabase/migrations/20260922193000_library_folder_transactional_duplicate.sql",
    );

    expect(sql).not.toContain("INSERT INTO public.tracks");
    expect(sql).not.toContain("audio_url");
    expect(sql).not.toContain("audio_key");
  });

  test("folder UI exposes Duplicate and Undo Move without turning Undo into persistent history", async () => {
    const library = await source("src/routes/library.tsx");

    expect(library).toContain('operation: "duplicate"');
    expect(library).toContain("startDuplicateProject");
    expect(library).toContain("startDuplicatePrompt");
    expect(library).toContain("undoLastMove");
    expect(library).toContain("previousFolderId");
    expect(library).toContain('"Undo"');
  });

  test("mobile long-press opens the reusable anchored context menu after 550ms with movement cancellation", async () => {
    const sheet = await source("src/components/promptbeats/LibraryItemActionSheet.tsx");
    const library = await source("src/routes/library.tsx");

    expect(sheet).toContain("550");
    expect(sheet).toContain("Math.hypot");
    expect(sheet).toContain("> 8");
    expect(sheet).toContain("LibraryItemActionSheet");
    expect(sheet).toContain('role="menu"');
    expect(sheet).toContain("Move to folder");
    expect(sheet).toContain("Duplicate");
    expect(library).toContain("LibraryLongPressButton");
    expect(library).toContain("setActionSheetItem");
  });

  test("desktop drag/drop moves Folder, Project or standalone Prompt to Folder or Root", async () => {
    const library = await source("src/routes/library.tsx");

    expect(library).toContain("application/x-promptbeats-library-item");
    expect(library).toContain("startDrag");
    expect(library).toContain("dropIntoFolder");
    expect(library).toContain('kind: "folder"');
    expect(library).toContain('kind: "project"');
    expect(library).toContain('kind: "prompt"');
    expect(library).toContain('dragOverFolderId === "root"');
    expect(library).toContain("onDrop");
  });

  test("Projects view exposes folders, long-press Move/Duplicate and drag/drop instead of a flat Projects list", async () => {
    const library = await source("src/routes/library.tsx");

    expect(library).toMatch(
      /view !== "analyses" && \(\s*<button\s+disabled=\{busy\}\s+onClick=\{createFolder\}/,
    );
    expect(library).toContain('(view === "all" || (view === "projects" && !openProject))');
    expect(library).toContain("folderSearchResults");
    expect(library).toContain('view === "all" || result.item_type !== "prompt"');
    expect(library).toContain("LibraryLongPressButton");
    expect(library).toContain("startDuplicateProject");
    expect(library).toContain('operation: "move"');
    expect(library).toContain("draggable={desktopDnD}");
  });

  test("switching Library tabs clears a previously open Project so the Projects folder browser is reachable", async () => {
    const library = await source("src/routes/library.tsx");

    expect(library).toMatch(/setOpenProjectId\(null\);\s*onViewChange\(item\);/);
    expect(library).toContain('(view === "all" || (view === "projects" && !openProject))');
  });

  test("Move picker blocks the current location while Duplicate may target the same folder or Root", async () => {
    const library = await source("src/routes/library.tsx");
    const picker = await source("src/components/promptbeats/LibraryFolderPicker.tsx");

    expect(library).toMatch(
      /disabledDestinationFolderId=\{\s*folderPicker\?\.operation === "move"\s*\?\s*folderPicker\.currentFolderId\s*:\s*undefined\s*\}/,
    );
    expect(picker).toContain("disabled={destinationDisabled(null)}");
    expect(picker).toContain("disabled={destinationDisabled(currentFolderId)}");
    expect(picker).not.toContain("disabled={currentFolderId === null}");
  });

  test("folder cards indicate when a folder contains subfolders", async () => {
    const library = await source("src/routes/library.tsx");

    expect(library).toContain("folder.has_subfolders");
    expect(library).toContain("Contains subfolders");
    expect(library).toContain("Περιέχει υποφακέλους");
  });

  test("folder icon grid stays compact, branded and uses context menus instead of bottom sheets", async () => {
    const library = await source("src/routes/library.tsx");
    const icon = await source("src/components/promptbeats/PromptBeatsFolderIcon.tsx");
    const menu = await source("src/components/promptbeats/LibraryItemActionSheet.tsx");

    expect(library).toContain("grid-cols-[repeat(auto-fill,minmax(84px,104px))]");
    expect(library).toContain("PromptBeatsFolderIcon");
    expect(library).toContain("line-clamp-2");
    expect(library).toContain("Folder options for");
    expect(library).toContain("Project options for");
    expect(library).toContain("MoreHorizontal");
    expect(icon).toContain("pb-folder-shell");
    expect(icon).toContain("pb-folder-fill");
    expect(menu).toContain('role="menu"');
    expect(menu).toContain('role="menuitem"');
    expect(menu).not.toContain("items-end bg-black/70");
  });

  test("touch drag shares the same Move operation and does not steal the stationary long-press gesture", async () => {
    const library = await source("src/routes/library.tsx");

    expect(library).toContain("touchDragHandlers");
    expect(library).toMatch(/document\s*\.\s*elementFromPoint/);
    expect(library).toContain("data-library-folder-drop-id");
    expect(library).toContain("data-library-folder-drop-path");
    expect(library).toContain('event.pointerType === "mouse"');
    expect(library).toContain("Math.hypot");
    expect(library).toContain("state.dragging = true");
    expect(library).toContain("event.currentTarget.setPointerCapture?.(event.pointerId)");
    expect(library).toContain("hasPointerCapture");
    expect(library).toMatch(/performMove\(\s*state\.item\.kind/);
    expect(library).toContain("setTouchDraggingKey");
    expect(library).toContain("scale-[1.03]");
    expect(library).toContain("md:cursor-grab");
  });

  test("Generator can save a standalone Prompt or new Project directly into a chosen Folder", async () => {
    const generator = await source("src/routes/generate.tsx");
    const ai = await source("src/lib/ai.functions.ts");

    expect(generator).toContain("LibraryFolderPicker");
    expect(generator).toContain("saveFolderId");
    expect(generator).toContain("saveFolderPath");
    expect(generator).toContain("folderId: saveFolderId");
    expect(generator).toContain("folder_id: projectId ? null : saveFolderId");
    expect(ai).toContain("folder_id: z.string().uuid().nullable().optional()");
    expect(ai).toContain("Project versions inherit the Project folder");
  });

  test("duplicate provenance columns exist without creating a branch graph", async () => {
    const sql = await source("supabase/migrations/20260922184000_library_folders_foundation.sql");

    expect(sql).toContain("duplicated_from_project_id");
    expect(sql).toContain("duplicated_from_prompt_id");
  });

  test("Library tabs persist in the URL and mobile tab navigation exposes overflow affordances", async () => {
    const library = await source("src/routes/library.tsx");

    expect(library).toContain("validateSearch");
    expect(library).toContain('parseLibraryTab(search["tab"])');
    expect(library).toContain("Route.useSearch()");
    expect(library).toContain("search: { tab: item }");
    expect(library).toContain("snap-x snap-mandatory");
    expect(library).toContain("snap-center");
    expect(library).toContain("showTabFade");
    expect(library).toContain("bg-gradient-to-l from-background");
    expect(library).toContain("scrollIntoView");
    expect(library).toContain('inline: "center"');
  });

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
  });

  test("empty Library guides first-time users to Generator and open Smart Presets", async () => {
    const library = await source("src/routes/library.tsx");
    const emptyState = await source("src/components/promptbeats/LibraryTracksEmptyState.tsx");
    const generator = await source("src/routes/generate.tsx");
    const presets = await source("src/components/promptbeats/SmartPresetsPanel.tsx");

    expect(library).toContain("myTracks.length === 0");
    expect(library).toContain("LibraryTracksEmptyState");
    expect(emptyState).toContain('search={{ presets: "open" }}');
    expect(emptyState).toContain("Χρειάζεσαι έμπνευση;");
    expect(generator).toContain('presets: z.enum(["open"]).optional()');
    expect(generator).toContain('search.presets === "open"');
    expect(generator).toContain('initiallyOpen={search.presets === "open"}');
    expect(presets).toContain("scrollIntoView");
  });

  test("standalone prompts support full edit, compact mobile actions and safe revision choice", async () => {
    const library = await source("src/routes/library.tsx");
    const ai = await source("src/lib/ai.functions.ts");
    const dialogs = await source("src/components/promptbeats/PromptStandaloneDialogs.tsx");
    const jobs = await source("src/lib/generation-jobs.server.ts");
    expect(library).toContain("EditStandalonePromptDialog");
    expect(library).toContain("StandalonePromptRevisionDialog");
    expect(dialogs).toContain("Συνέχεια και αντικατάσταση");
    expect(dialogs).toContain("Προσθήκη σε Project");
    expect(ai).toContain("patch.folder_id = null");
    expect(ai).toContain("patch.lyrics = data.lyrics");
    expect(jobs).toContain("standalone revision replace failed");
    expect(jobs).toContain('.is("project_id", null)');
  });
});
