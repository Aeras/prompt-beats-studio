import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const folderIdSchema = z.string().uuid();
const nullableFolderIdSchema = folderIdSchema.nullable().optional();
const folderNameSchema = z.string().trim().min(1).max(120);

const createFolderInput = z.object({
  name: folderNameSchema,
  parentFolderId: nullableFolderIdSchema,
});

const renameFolderInput = z.object({
  folderId: folderIdSchema,
  name: folderNameSchema,
});

const moveFolderInput = z.object({
  folderId: folderIdSchema,
  destinationFolderId: nullableFolderIdSchema,
});

const moveProjectInput = z.object({
  projectId: z.string().uuid(),
  destinationFolderId: nullableFolderIdSchema,
});

const movePromptInput = z.object({
  promptId: z.string().uuid(),
  destinationFolderId: nullableFolderIdSchema,
});

const listFolderInput = z.object({
  folderId: nullableFolderIdSchema,
});

const searchFolderInput = z.object({
  query: z.string().trim().max(120).default(""),
});
const searchScopeInput = z.object({
  folderId: nullableFolderIdSchema,
  query: z.string().trim().min(1).max(200),
});
const duplicateProjectInput = z.object({
  projectId: z.string().uuid(),
  destinationFolderId: nullableFolderIdSchema,
  newName: z.string().trim().min(1).max(120),
});

const duplicatePromptInput = z.object({
  promptId: z.string().uuid(),
  destinationFolderId: nullableFolderIdSchema,
  newName: z.string().trim().min(1).max(200),
});

async function requireOwnedFolder(
  supabase: any,
  userId: string,
  folderId: string | null | undefined,
) {
  if (!folderId) return null;
  const { data, error } = await supabase
    .from("library_folders")
    .select("id, user_id, parent_folder_id, name, created_at, updated_at")
    .eq("id", folderId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Folder not found.");
  return data;
}

function applyNullableFolderFilter(query: any, folderId: string | null | undefined) {
  return folderId ? query.eq("folder_id", folderId) : query.is("folder_id", null);
}

function friendlyFolderWriteError(error: { code?: string | null; message: string }) {
  if (error.code === "23505") return new Error("A folder with this name already exists here.");
  if (error.message.includes("5 levels")) return new Error("Folders can be nested up to 5 levels.");
  if (error.message.includes("descendants")) return new Error("A folder cannot be moved into one of its subfolders.");
  if (error.message.includes("itself")) return new Error("A folder cannot be moved into itself.");
  if (error.message.includes("does not belong")) return new Error("The destination folder is unavailable.");
  return new Error(error.message);
}

export const listLibraryFolderContents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listFolderInput.parse(input))
  .handler(async ({ data, context }) => {
    const folderId = data.folderId ?? null;
    await requireOwnedFolder(context.supabase, context.userId, folderId);

    let foldersQuery = context.supabase
      .from("library_folders")
      .select("id, parent_folder_id, name, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("name", { ascending: true });

    foldersQuery = folderId
      ? foldersQuery.eq("parent_folder_id", folderId)
      : foldersQuery.is("parent_folder_id", null);

    let projectsQuery = context.supabase
      .from("prompt_projects")
      .select("id, name, creation_notes, preferred_prompt_id, folder_id, duplicated_from_project_id, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });

    projectsQuery = applyNullableFolderFilter(projectsQuery, folderId);

    let promptsQuery = context.supabase
      .from("saved_prompts")
      .select("id, title, custom_name, project_id, folder_id, duplicated_from_prompt_id, version_number, version_label, generator_input_snapshot, parent_prompt_id, revision_request, source_generation_job_id, version_change_metadata, version_user_note, theme, genre, mood, language, tags, lyrics, note, created_at, updated_at")
      .eq("user_id", context.userId)
      .is("project_id", null)
      .order("updated_at", { ascending: false });

    promptsQuery = applyNullableFolderFilter(promptsQuery, folderId);

    const [foldersResult, projectsResult, promptsResult] = await Promise.all([
      foldersQuery,
      projectsQuery,
      promptsQuery,
    ]);

    if (foldersResult.error) throw new Error(foldersResult.error.message);
    if (projectsResult.error) throw new Error(projectsResult.error.message);
    if (promptsResult.error) throw new Error(promptsResult.error.message);

    const folders = foldersResult.data ?? [];
    const folderIds = folders.map((folder: { id: string }) => folder.id);
    const subfolderParents = new Set<string>();
    if (folderIds.length > 0) {
      const { data: childFolders, error: childFoldersError } = await context.supabase
        .from("library_folders")
        .select("parent_folder_id")
        .eq("user_id", context.userId)
        .in("parent_folder_id", folderIds);
      if (childFoldersError) throw new Error(childFoldersError.message);
      for (const child of childFolders ?? []) {
        if (child.parent_folder_id) subfolderParents.add(child.parent_folder_id);
      }
    }

    return {
      folderId,
      folders: folders.map((folder: any) => ({
        ...folder,
        has_subfolders: subfolderParents.has(folder.id),
      })),
      projects: projectsResult.data ?? [],
      prompts: promptsResult.data ?? [],
    };
  });

export const createLibraryFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createFolderInput.parse(input))
  .handler(async ({ data, context }) => {
    const parentFolderId = data.parentFolderId ?? null;
    await requireOwnedFolder(context.supabase, context.userId, parentFolderId);

    const { data: folder, error } = await context.supabase
      .from("library_folders")
      .insert({
        user_id: context.userId,
        parent_folder_id: parentFolderId,
        name: data.name,
      })
      .select("id, parent_folder_id, name, created_at, updated_at")
      .single();

    if (error) throw friendlyFolderWriteError(error);
    return { folder };
  });

export const renameLibraryFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => renameFolderInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireOwnedFolder(context.supabase, context.userId, data.folderId);

    const { data: folder, error } = await context.supabase
      .from("library_folders")
      .update({ name: data.name })
      .eq("id", data.folderId)
      .eq("user_id", context.userId)
      .select("id, parent_folder_id, name, created_at, updated_at")
      .single();

    if (error) throw friendlyFolderWriteError(error);
    return { folder };
  });

export const deleteLibraryFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ folderId: folderIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireOwnedFolder(context.supabase, context.userId, data.folderId);

    const [childFolders, projects, prompts] = await Promise.all([
      context.supabase
        .from("library_folders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .eq("parent_folder_id", data.folderId),
      context.supabase
        .from("prompt_projects")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .eq("folder_id", data.folderId),
      context.supabase
        .from("saved_prompts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .is("project_id", null)
        .eq("folder_id", data.folderId),
    ]);

    for (const result of [childFolders, projects, prompts]) {
      if (result.error) throw new Error(result.error.message);
    }

    if ((childFolders.count ?? 0) > 0 || (projects.count ?? 0) > 0 || (prompts.count ?? 0) > 0) {
      throw new Error("Folder must be empty before deletion.");
    }

    const { error } = await context.supabase
      .from("library_folders")
      .delete()
      .eq("id", data.folderId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const moveLibraryFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => moveFolderInput.parse(input))
  .handler(async ({ data, context }) => {
    const folder = await requireOwnedFolder(context.supabase, context.userId, data.folderId);
    const destinationFolderId = data.destinationFolderId ?? null;
    await requireOwnedFolder(context.supabase, context.userId, destinationFolderId);

    if ((folder?.parent_folder_id ?? null) === destinationFolderId) {
      throw new Error("Folder is already in that location.");
    }

    const { data: moved, error } = await context.supabase
      .from("library_folders")
      .update({ parent_folder_id: destinationFolderId })
      .eq("id", data.folderId)
      .eq("user_id", context.userId)
      .select("id, parent_folder_id, name, created_at, updated_at")
      .single();

    if (error) throw friendlyFolderWriteError(error);
    return { folder: moved };
  });

export const movePromptProjectToFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => moveProjectInput.parse(input))
  .handler(async ({ data, context }) => {
    const destinationFolderId = data.destinationFolderId ?? null;
    await requireOwnedFolder(context.supabase, context.userId, destinationFolderId);

    const { data: project, error: projectError } = await context.supabase
      .from("prompt_projects")
      .select("id, folder_id")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found.");
    if ((project.folder_id ?? null) === destinationFolderId) {
      throw new Error("Project is already in that location.");
    }

    const { error } = await context.supabase
      .from("prompt_projects")
      .update({ folder_id: destinationFolderId, updated_at: new Date().toISOString() })
      .eq("id", data.projectId)
      .eq("user_id", context.userId);
    if (error) throw friendlyFolderWriteError(error);

    return { ok: true };
  });

export const moveStandalonePromptToFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => movePromptInput.parse(input))
  .handler(async ({ data, context }) => {
    const destinationFolderId = data.destinationFolderId ?? null;
    await requireOwnedFolder(context.supabase, context.userId, destinationFolderId);

    const { data: prompt, error: promptError } = await context.supabase
      .from("saved_prompts")
      .select("id, project_id, folder_id")
      .eq("id", data.promptId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (promptError) throw new Error(promptError.message);
    if (!prompt) throw new Error("Prompt not found.");
    if (prompt.project_id) {
      throw new Error("This prompt is part of a Project. Move the Project instead.");
    }
    if ((prompt.folder_id ?? null) === destinationFolderId) {
      throw new Error("Prompt is already in that location.");
    }

    const { error } = await context.supabase
      .from("saved_prompts")
      .update({ folder_id: destinationFolderId, updated_at: new Date().toISOString() })
      .eq("id", data.promptId)
      .eq("user_id", context.userId)
      .is("project_id", null);
    if (error) throw friendlyFolderWriteError(error);

    return { ok: true };
  });

export const getLibraryFolderBreadcrumbs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ folderId: folderIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const breadcrumbs: Array<{ id: string; name: string }> = [];
    let currentId: string | null = data.folderId;

    for (let level = 0; level < 5 && currentId; level += 1) {
      const folder = await requireOwnedFolder(context.supabase, context.userId, currentId);
      if (!folder) break;
      breadcrumbs.unshift({ id: folder.id, name: folder.name });
      currentId = folder.parent_folder_id;
    }

    if (currentId) throw new Error("Folder hierarchy exceeds the supported depth.");
    return { breadcrumbs };
  });

export const searchLibraryFolders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchFolderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: folders, error } = await context.supabase.rpc("search_library_folders", {
      _query: data.query,
    });
    if (error) throw new Error(error.message);
    return { folders: folders ?? [] };
  });


export const searchLibraryScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchScopeInput.parse(input))
  .handler(async ({ data, context }) => {
    const folderId = data.folderId ?? null;
    await requireOwnedFolder(context.supabase, context.userId, folderId);

    const { data: results, error } = await (context.supabase as any).rpc("search_library_scope", {
      _folder_id: folderId,
      _query: data.query,
    });
    if (error) throw new Error(error.message);
    return {
      results: (results ?? []) as Array<{
        item_type: "folder" | "project" | "prompt";
        item_id: string;
        folder_id: string | null;
        name: string;
        path: string;
      }>,
    };
  });


export const duplicatePromptProjectToFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => duplicateProjectInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireOwnedFolder(context.supabase, context.userId, data.destinationFolderId ?? null);

    const { data: source, error: sourceError } = await context.supabase
      .from("prompt_projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (sourceError) throw new Error(sourceError.message);
    if (!source) throw new Error("Project not found.");

    const { data: duplicated, error } = await (context.supabase as any).rpc("duplicate_prompt_project_to_folder", {
      _project_id: data.projectId,
      _destination_folder_id: data.destinationFolderId ?? null,
      _new_name: data.newName,
    });
    if (error) throw new Error(error.message);
    return { duplicated };
  });

export const duplicateStandalonePromptToFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => duplicatePromptInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireOwnedFolder(context.supabase, context.userId, data.destinationFolderId ?? null);

    const { data: source, error: sourceError } = await context.supabase
      .from("saved_prompts")
      .select("id, project_id")
      .eq("id", data.promptId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (sourceError) throw new Error(sourceError.message);
    if (!source || source.project_id) throw new Error("Standalone prompt not found.");

    const { data: duplicated, error } = await (context.supabase as any).rpc("duplicate_standalone_prompt_to_folder", {
      _prompt_id: data.promptId,
      _destination_folder_id: data.destinationFolderId ?? null,
      _new_name: data.newName,
    });
    if (error) throw new Error(error.message);
    return { duplicated };
  });
