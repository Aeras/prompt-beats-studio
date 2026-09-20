import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  EXPORT_SCHEMA_VERSION,
  type ExportPromptRecord,
  type ProjectExportSource,
  type PromptExportSource,
} from "@/lib/export-center.shared";

const promptExportInput = z.object({ promptId: z.string().uuid() });
const projectExportInput = z.object({ projectId: z.string().uuid() });

type PromptRow = {
  title: string | null;
  custom_name: string | null;
  project_id: string | null;
  version_number: number | null;
  version_label: string | null;
  theme: string | null;
  genre: string | null;
  mood: string | null;
  language: string | null;
  tags: string | null;
  lyrics: string | null;
  note: string | null;
  revision_request: string | null;
  created_at: string;
  updated_at: string;
};

function present(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function promptName(row: PromptRow, inProject: boolean) {
  const customName = present(row.custom_name);
  if (customName) return customName;

  if (inProject) {
    const versionLabel = present(row.version_label);
    if (versionLabel) return versionLabel;
    if (row.version_number != null) return `Version ${row.version_number}`;
  }

  return present(row.title) ?? present(row.theme) ?? (row.version_number != null ? `Version ${row.version_number}` : "Untitled Prompt");
}

function toPromptRecord(row: PromptRow, inProject: boolean): ExportPromptRecord {
  return {
    name: promptName(row, inProject),
    title: present(row.title),
    versionNumber: row.version_number ?? null,
    versionLabel: present(row.version_label),
    theme: present(row.theme),
    musicStyle: present(row.genre),
    mood: present(row.mood),
    language: present(row.language),
    stylePrompt: present(row.tags),
    lyrics: present(row.lyrics),
    producerNote: present(row.note),
    revisionRequest: present(row.revision_request),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const promptSelect = "title, custom_name, project_id, version_number, version_label, theme, genre, mood, language, tags, lyrics, note, revision_request, created_at, updated_at";

export const getPromptExportSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => promptExportInput.parse(input))
  .handler(async ({ data, context }): Promise<PromptExportSource> => {
    const { data: prompt, error } = await context.supabase
      .from("saved_prompts")
      .select(promptSelect)
      .eq("id", data.promptId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!prompt) throw new Error("Prompt not found.");

    let project: { name: string } | null = null;
    if (prompt.project_id) {
      const { data: projectRow, error: projectError } = await context.supabase
        .from("prompt_projects")
        .select("name")
        .eq("id", prompt.project_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (projectError) throw new Error(projectError.message);
      if (projectRow) project = { name: projectRow.name };
    }

    return {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportType: "prompt",
      exportedAt: new Date().toISOString(),
      project,
      prompt: toPromptRecord(prompt as PromptRow, Boolean(project)),
    };
  });

export const getProjectExportSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => projectExportInput.parse(input))
  .handler(async ({ data, context }): Promise<ProjectExportSource> => {
    const { data: project, error: projectError } = await context.supabase
      .from("prompt_projects")
      .select("name, creation_notes, created_at, updated_at")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found.");

    const { data: prompts, error: promptsError } = await context.supabase
      .from("saved_prompts")
      .select(promptSelect)
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .order("version_number", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (promptsError) throw new Error(promptsError.message);

    return {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportType: "project",
      exportedAt: new Date().toISOString(),
      project: {
        name: project.name,
        creationNotes: present(project.creation_notes),
        createdAt: project.created_at,
        updatedAt: project.updated_at,
      },
      prompts: (prompts ?? []).map((prompt) => toPromptRecord(prompt as PromptRow, true)),
    };
  });
