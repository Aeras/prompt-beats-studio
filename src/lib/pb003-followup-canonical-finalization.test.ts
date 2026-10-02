import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

const HARDENING_MIGRATION =
  "supabase/migrations/20261002110500_pb003_followup_canonical_finalization_hardening.sql";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("PB-003 follow-up canonical finalization hardening", () => {
  test("forward migration separates current source eligibility from historical child binding", async () => {
    const sql = await source(HARDENING_MIGRATION);

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.validate_project_audio_revision_feedback()");
    expect(sql).toContain("requires_current_source_eligibility boolean := false");
    expect(sql).toContain("IF TG_OP = 'INSERT' THEN");
    expect(sql).toContain("requires_current_source_eligibility := true");
    expect(sql).toContain("NEW.source_track_id IS DISTINCT FROM OLD.source_track_id");
    expect(sql).toContain("NEW.keep_text IS DISTINCT FROM OLD.keep_text");
    expect(sql).toContain("NEW.change_text IS DISTINCT FROM OLD.change_text");
    expect(sql).toContain("NEW.revision_brief IS DISTINCT FROM OLD.revision_brief");
    expect(sql).toContain("IF requires_current_source_eligibility AND NOT EXISTS");
  });

  test("historical child binding still requires immutable owner, Project and parent lineage", async () => {
    const sql = await source(HARDENING_MIGRATION);

    expect(sql).toContain("revision.id = NEW.created_revision_prompt_id");
    expect(sql).toContain("revision.user_id = NEW.user_id");
    expect(sql).toContain("revision.project_id = NEW.project_id");
    expect(sql).toContain("revision.parent_prompt_id = NEW.source_version_prompt_id");
  });

  test("created_revision_prompt_id is not itself a reason to re-require current Track eligibility", async () => {
    const sql = await source(HARDENING_MIGRATION);
    const eligibilityAssignment = sql.slice(
      sql.indexOf("requires_current_source_eligibility :=\n      NEW.user_id"),
      sql.indexOf("IF requires_current_source_eligibility AND NOT EXISTS"),
    );

    expect(eligibilityAssignment).not.toContain("created_revision_prompt_id");
  });

  test("server finalization remains idempotent for the same child and rejects conflicting lineage", async () => {
    const server = await source("src/lib/audio-revision-feedback.functions.ts");

    expect(server).toContain("if (feedback.created_revision_prompt_id)");
    expect(server).toContain("feedback.created_revision_prompt_id !== data.revisionPromptId");
    expect(server).toContain("revision.project_id !== feedback.project_id");
    expect(server).toContain("revision.parent_prompt_id !== feedback.source_version_prompt_id");
    expect(server).toContain('.is("created_revision_prompt_id", null)');
  });

  test("manual Audio Revision still uses the canonical revision engine and completion API", async () => {
    const route = await source("src/routes/audio-revision.tsx");

    expect(route).toContain("startGenerationJob");
    expect(route).toContain('operation: "revision"');
    expect(route).toContain("completeAudioRevisionFeedback");
  });
});
