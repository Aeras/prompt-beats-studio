import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import { generatorInputSnapshotSchema } from "@/lib/generator-revision.shared";
import { parseLyricsSections } from "@/lib/lyrics-sections";
import { extractLyricsReviewTags } from "@/lib/lyrics-review.shared";
import {
  lyricsSectionEditJobSchema,
  lyricsSectionEditRequestSchema,
} from "@/lib/lyrics-workspace.shared";
import { buildLyricsReviewVersionMetadata } from "@/lib/project-version-history.shared";

const projectContextInput = z.object({
  projectId: z.string().uuid(),
  versionId: z.string().uuid().nullish(),
});

const projectVersionRowSchema = z.object({
  id: z.string().uuid(),
  version_number: z.number().int().positive().nullable(),
  version_label: z.string().nullable(),
  custom_name: z.string().nullable(),
  title: z.string().nullable(),
  theme: z.string().nullable(),
  genre: z.string().nullable(),
  mood: z.string().nullable(),
  language: z.string().nullable(),
  tags: z.string().nullable(),
  lyrics: z.string().nullable(),
  note: z.string().nullable(),
  generator_input_snapshot: z.unknown().nullable(),
  parent_prompt_id: z.string().uuid().nullable(),
  created_at: z.string(),
});

const saveInput = z.object({
  projectId: z.string().uuid(),
  basePromptId: z.string().uuid(),
  lyrics: z.string().min(1).max(12000),
  mode: z.enum(["new_version", "replace_latest"]),
});

const saveResultSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  version_number: z.number().int().positive(),
  parent_prompt_id: z.string().uuid().nullable(),
  version_label: z.string().nullable().optional(),
  replaced: z.boolean().optional(),
});

const reviewEditRequestSchema = lyricsSectionEditRequestSchema.extend({
  feature: z.literal("lyrics_review").default("lyrics_review"),
});

function protectedTagInstruction(selectedContent: string, userInstruction: string) {
  const protectedTags = extractLyricsReviewTags(selectedContent);
  const contract = [
    "PROMPTBEATS PROTECTED SQUARE-BRACKET TAG CONTRACT:",
    "- Anything inside square brackets [...] is metadata/instruction, never sung lyric content.",
    "- Ignore square-bracket content completely when judging or improving meter, syllables, rhyme, wording, repetition, cadence, language, or singability.",
    "- Existing square-bracket tags are READ-ONLY: do not add, remove, rename, rewrite, translate, reorder, or otherwise alter them.",
    "- Preserve every existing square-bracket tag exactly as written in the selected section.",
    protectedTags.length
      ? `- Protected tags in exact order: ${JSON.stringify(protectedTags)}`
      : "- The selected section contains no protected square-bracket tags; do not invent any.",
  ].join("\n");
  return userInstruction.trim() ? `${userInstruction.trim()}\n\n${contract}` : contract;
}

export const getLyricsReviewProjectContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => projectContextInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "lyrics_review");

    const { data: project, error: projectError } = await context.supabase
      .from("prompt_projects")
      .select("id, name")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found.");

    const { data: rawVersions, error: versionsError } = await context.supabase
      .from("saved_prompts")
      .select(
        "id, version_number, version_label, custom_name, title, theme, genre, mood, language, tags, lyrics, note, generator_input_snapshot, parent_prompt_id, created_at",
      )
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .order("version_number", { ascending: true })
      .order("created_at", { ascending: true });
    if (versionsError) throw new Error(versionsError.message);

    const versions = z.array(projectVersionRowSchema).parse(rawVersions ?? []);
    if (!versions.length) throw new Error("This project has no saved versions.");
    const selected = data.versionId
      ? versions.find((version) => version.id === data.versionId)
      : versions.at(-1);
    if (!selected) throw new Error("Selected version not found in this project.");
    const parentIds = new Set(versions.map((version) => version.parent_prompt_id).filter(Boolean));
    const parsedSnapshot = generatorInputSnapshotSchema.safeParse(
      selected.generator_input_snapshot,
    );

    return {
      project: { id: project.id, name: project.name },
      versions: versions.map((version) => ({
        id: version.id,
        versionNumber: version.version_number,
        versionLabel: version.version_label,
        title: version.title ?? "",
        createdAt: version.created_at,
      })),
      selected: {
        id: selected.id,
        versionNumber: selected.version_number,
        versionLabel: selected.version_label,
        title: selected.title ?? "",
        theme: selected.theme ?? "",
        genre: selected.genre ?? "",
        mood: selected.mood ?? "",
        language: selected.language ?? "",
        tags: selected.tags ?? "",
        lyrics: selected.lyrics ?? "",
        note: selected.note ?? "",
        generatorInputSnapshot: parsedSnapshot.success ? parsedSnapshot.data : null,
        isLatest: selected.id === versions.at(-1)!.id,
        isLeaf: !parentIds.has(selected.id),
      },
    };
  });

export const saveLyricsReviewProjectVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "lyrics_review");

    const { data: project, error: projectError } = await context.supabase
      .from("prompt_projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found.");

    const { data: base, error: baseError } = await context.supabase
      .from("saved_prompts")
      .select("id, lyrics")
      .eq("id", data.basePromptId)
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (baseError) throw new Error(baseError.message);
    if (!base) throw new Error("Base version not found.");
    if ((base.lyrics ?? "") === data.lyrics) throw new Error("There are no lyric changes to save.");

    const versionChangeMetadata = buildLyricsReviewVersionMetadata({
      beforeLyrics: base.lyrics ?? "",
      afterLyrics: data.lyrics,
      mode: data.mode,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminRpc = supabaseAdmin as any;
    if (data.mode === "replace_latest") {
      const { data: raw, error } = await adminRpc.rpc(
        "replace_latest_prompt_lyrics_review_version",
        {
          _user_id: context.userId,
          _project_id: data.projectId,
          _version_prompt_id: data.basePromptId,
          _lyrics: data.lyrics,
          _version_change_metadata: versionChangeMetadata,
        },
      );
      if (error) {
        if (error.message.includes("Only a leaf project version")) {
          throw new Error("Only the latest version of the selected branch can be replaced.");
        }
        throw new Error("The current version could not be replaced.");
      }
      const parsed = saveResultSchema.safeParse(raw);
      if (!parsed.success) throw new Error("The current version could not be replaced.");
      return {
        savedPromptId: parsed.data.id,
        projectId: parsed.data.project_id,
        versionNumber: parsed.data.version_number,
        parentPromptId: parsed.data.parent_prompt_id,
        replaced: true,
      };
    }

    const { data: raw, error } = await adminRpc.rpc("create_prompt_lyrics_review_version", {
      _user_id: context.userId,
      _project_id: data.projectId,
      _parent_prompt_id: data.basePromptId,
      _lyrics: data.lyrics,
      _version_change_metadata: versionChangeMetadata,
    });
    if (error) throw new Error("The Lyrics Review changes could not be saved as a new version.");
    const parsed = saveResultSchema.safeParse(raw);
    if (!parsed.success)
      throw new Error("The Lyrics Review changes could not be saved as a new version.");
    return {
      savedPromptId: parsed.data.id,
      projectId: parsed.data.project_id,
      versionNumber: parsed.data.version_number,
      parentPromptId: parsed.data.parent_prompt_id,
      replaced: false,
    };
  });

export const startLyricsReviewSectionEditJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewEditRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "lyrics_review");
    const supabase = context.supabase;
    const { getModelForUser } = await import("@/lib/ai-provider.server");
    await getModelForUser(context.userId, data.generationModel ?? undefined, "generator");

    let authoritative = {
      title: data.title,
      tags: data.tags,
      note: data.note,
      theme: data.theme,
      genre: data.genre,
      mood: data.mood,
      language: data.language,
      targetPlatform: data.targetPlatform,
      generatorInputSnapshot: data.generatorInputSnapshot,
    };

    if (data.projectId || data.basePromptId) {
      if (!data.projectId || !data.basePromptId) {
        throw new Error("Project and base version must be supplied together.");
      }
      const { data: project, error: projectError } = await supabase
        .from("prompt_projects")
        .select("id")
        .eq("id", data.projectId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (projectError) throw new Error(projectError.message);
      if (!project) throw new Error("Project not found.");

      const { data: basePrompt, error: baseError } = await supabase
        .from("saved_prompts")
        .select(
          "id, project_id, title, tags, note, theme, genre, mood, language, generator_input_snapshot",
        )
        .eq("id", data.basePromptId)
        .eq("project_id", data.projectId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (baseError) throw new Error(baseError.message);
      if (!basePrompt) throw new Error("Base version not found.");

      const snapshot = generatorInputSnapshotSchema.safeParse(basePrompt.generator_input_snapshot);
      authoritative = {
        title: basePrompt.title ?? "",
        tags: basePrompt.tags ?? "",
        note: basePrompt.note ?? "",
        theme: basePrompt.theme ?? "",
        genre: basePrompt.genre ?? "",
        mood: basePrompt.mood ?? "",
        language: (basePrompt.language ?? data.language).trim() || data.language,
        targetPlatform: snapshot.success ? snapshot.data.targetPlatform : data.targetPlatform,
        generatorInputSnapshot: snapshot.success ? snapshot.data : null,
      };
    }

    const sections = parseLyricsSections(data.fullLyrics);
    const selected = sections.find((section) => section.key === data.sectionKey);
    if (!selected) throw new Error("The selected lyric section no longer exists.");

    const payload = lyricsSectionEditJobSchema.parse({
      operation: "lyrics_section_edit",
      feature: data.feature,
      generationModel: data.generationModel ?? null,
      sectionEdit: {
        fullLyrics: data.fullLyrics,
        sectionKey: selected.key,
        sectionLabel: selected.label,
        sectionOccurrence: selected.occurrence,
        selectedContent: selected.content,
        action: data.action,
        customInstruction: protectedTagInstruction(selected.content, data.customInstruction),
        ...authoritative,
        projectId: data.projectId ?? null,
        basePromptId: data.basePromptId ?? null,
      },
    });

    const { data: raw, error } = await supabase.rpc("start_generation_job", {
      _idempotency_key: data.idempotencyKey,
      _input: payload,
    });
    if (error)
      throw new Error(`The Lyrics Review request could not be started (${error.message}).`);
    if (raw && (raw as { rate_limited?: boolean }).rate_limited) {
      return { rateLimited: true as const, jobId: null };
    }

    const parsedRow = z
      .object({ id: z.string().uuid(), input_payload: z.unknown() })
      .passthrough()
      .safeParse(raw);
    if (!parsedRow.success) throw new Error("The Lyrics Review request could not be started.");
    const returnedPayload = lyricsSectionEditJobSchema.safeParse(parsedRow.data.input_payload);
    if (
      !returnedPayload.success ||
      returnedPayload.data.feature !== "lyrics_review" ||
      returnedPayload.data.sectionEdit.sectionKey !== payload.sectionEdit.sectionKey ||
      returnedPayload.data.sectionEdit.fullLyrics !== payload.sectionEdit.fullLyrics
    ) {
      throw new Error("Another AI action is already in progress. Please wait for it to finish.");
    }

    return { rateLimited: false as const, jobId: parsedRow.data.id };
  });
