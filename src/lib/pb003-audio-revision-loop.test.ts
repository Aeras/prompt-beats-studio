import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("PB-003 Prompt to Audio to Revision loop", () => {
  test("audio feedback stores references to the canonical Project Version and Track without copying audio", async () => {
    const sql = await source(
      "supabase/migrations/20261001154500_project_audio_revision_feedback.sql",
    );

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.project_audio_revision_feedback");
    expect(sql).toContain(
      "project_id uuid NOT NULL REFERENCES public.prompt_projects(id) ON DELETE CASCADE",
    );
    expect(sql).toContain(
      "source_version_prompt_id uuid NOT NULL REFERENCES public.saved_prompts(id) ON DELETE CASCADE",
    );
    expect(sql).toContain("source_track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE");
    expect(sql).not.toContain("audio_url text");
    expect(sql).not.toContain("audio_key text");
  });

  test("feedback is idempotent and one created revision cannot belong to multiple feedback rows", async () => {
    const sql = await source(
      "supabase/migrations/20261001154500_project_audio_revision_feedback.sql",
    );

    expect(sql).toContain("idempotency_key uuid NOT NULL");
    expect(sql).toContain("UNIQUE (user_id, idempotency_key)");
    expect(sql).toContain("uq_project_audio_revision_feedback_created_revision");
    expect(sql).toContain("WHERE created_revision_prompt_id IS NOT NULL");
  });

  test("database trigger rejects feedback for audio that is not linked to the selected Version", async () => {
    const sql = await source(
      "supabase/migrations/20261001154500_project_audio_revision_feedback.sql",
    );

    expect(sql).toContain("FROM public.project_version_tracks pvt");
    expect(sql).toContain("pvt.version_prompt_id = NEW.source_version_prompt_id");
    expect(sql).toContain("pvt.track_id = NEW.source_track_id");
    expect(sql).toContain("t.user_id = NEW.user_id");
    expect(sql).toContain("t.source_type = 'upload'");
    expect(sql).toContain("t.moderation_status = 'active'");
  });

  test("created revision must remain a canonical child of the selected source Version", async () => {
    const sql = await source(
      "supabase/migrations/20261001154500_project_audio_revision_feedback.sql",
    );

    expect(sql).toContain("revision.parent_prompt_id = NEW.source_version_prompt_id");
    expect(sql).toContain("revision.project_id = NEW.project_id");
    expect(sql).toContain("revision.user_id = NEW.user_id");
  });

  test("browser roles cannot mutate or enumerate the feedback table directly", async () => {
    const sql = await source(
      "supabase/migrations/20261001154500_project_audio_revision_feedback.sql",
    );

    expect(sql).toContain("ALTER TABLE public.project_audio_revision_feedback ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain(
      "REVOKE ALL ON TABLE public.project_audio_revision_feedback FROM PUBLIC, anon, authenticated",
    );
    expect(sql).toContain("GRANT ALL ON TABLE public.project_audio_revision_feedback TO service_role");
  });

  test("server creation revalidates linked audio and handles a concurrent idempotency retry", async () => {
    const server = await source("src/lib/audio-revision-feedback.functions.ts");

    expect(server).toContain('.from("project_version_tracks")');
    expect(server).toContain('.eq("user_id", context.userId)');
    expect(server).toContain('.eq("version_prompt_id", data.versionId)');
    expect(server).toContain('.eq("track_id", data.trackId)');
    expect(server).toContain('track.source_type !== "upload"');
    expect(server).toContain('track.moderation_status !== "active"');
    expect(server).toContain('insertError.code !== "23505"');
    expect(server).toContain("findExisting");
  });

  test("completion verifies owner, Project and parent lineage before binding feedback to a new Version", async () => {
    const server = await source("src/lib/audio-revision-feedback.functions.ts");

    expect(server).toContain("completeAudioRevisionFeedback");
    expect(server).toContain('.from("saved_prompts")');
    expect(server).toContain('.eq("user_id", context.userId)');
    expect(server).toContain("revision.project_id !== feedback.project_id");
    expect(server).toContain("revision.parent_prompt_id !== feedback.source_version_prompt_id");
    expect(server).toContain("created_revision_prompt_id: data.revisionPromptId");
  });

  test("Audio Revision runs through the existing durable revision engine instead of inventing another version writer", async () => {
    const route = await source("src/routes/audio-revision.tsx");
    const server = await source("src/lib/audio-revision-feedback.functions.ts");

    expect(route).toContain("startGenerationJob");
    expect(route).toContain('operation: "revision"');
    expect(route).toContain("basePromptId: versionId");
    expect(route).toContain("desiredSnapshot");
    expect(route).toContain("getGenerationJob");
    expect(route).toContain("completeAudioRevisionFeedback");
    expect(server).not.toContain("create_prompt_revision_version");
  });

  test("revision input preserves the canonical saved snapshot and only changes Generator mode/model provenance", async () => {
    const route = await source("src/routes/audio-revision.tsx");

    expect(route).toContain("generatorInputSnapshotSchema.safeParse");
    expect(route).toContain('generatorMode: "revision" as const');
    expect(route).toContain("generationModel: defaultModel");
    expect(route).toContain("inputSnapshot: desiredSnapshot");
    expect(route).toContain("snapshot.songBlueprint");
    expect(route).toContain("snapshot.productionStyle");
  });

  test("legacy Versions without a full snapshot fail safely instead of inventing historical settings", async () => {
    const route = await source("src/routes/audio-revision.tsx");

    expect(route).toContain("!hasCanonicalSnapshot");
    expect(route).toContain("Historical settings will not be invented");
    expect(route).toContain("selected version does not contain enough canonical Generator context");
  });

  test("AI Analyzer findings are never imported automatically without exact source binding", async () => {
    const route = await source("src/routes/audio-revision.tsx");
    const migration = await source(
      "supabase/migrations/20261001154500_project_audio_revision_feedback.sql",
    );

    expect(route).toContain("AI findings are never imported automatically");
    expect(route).not.toContain("saveSongAnalysis");
    expect(route).not.toContain("listSongAnalyses");
    expect(migration).toContain("imported_evidence jsonb NOT NULL DEFAULT '[]'::jsonb");
  });

  test("selected linked audio can be listened to before Keep/Change is submitted", async () => {
    const route = await source("src/routes/audio-revision.tsx");

    expect(route).toContain("selectedTrack.audio_url");
    expect(route).toContain("<audio");
    expect(route).toContain('preload="metadata"');
    expect(route).toContain("controls");
  });

  test("Create exposes Audio Revision as part of the creator journey", async () => {
    const create = await source("src/routes/create.tsx");

    expect(create).toContain('key: "audio-revision"');
    expect(create).toContain('to: "/audio-revision" as const');
    expect(create).toContain("Version + Audio + Keep/Change → Revision");
  });
});
