import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

import { validateAudioRevisionSectionSuggestions } from "./audio-revision-section-validation";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("PB-003 follow-up outcome, intent and AI contracts", () => {
  test("Outcome and Intent are private server-owned product state with exact-source invariants", async () => {
    const sql = await source(
      "supabase/migrations/20261002111500_pb003_followup_outcome_intent_schema.sql",
    );

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.project_audio_outcome_evaluations");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.project_audio_revision_intents");
    expect(sql).toContain(
      "UNIQUE (user_id, project_id, source_version_prompt_id, source_track_id)",
    );
    expect(sql).toContain("WHERE status = 'draft'");
    expect(sql).toContain("lock_version integer NOT NULL DEFAULT 0");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON TABLE public.project_audio_outcome_evaluations");
    expect(sql).toContain("REVOKE ALL ON TABLE public.project_audio_revision_intents");
  });

  test("Intent has one authoritative unique relation from canonical feedback", async () => {
    const sql = await source(
      "supabase/migrations/20261002111500_pb003_followup_outcome_intent_schema.sql",
    );

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS revision_intent_id uuid");
    expect(sql).toContain("project_audio_revision_feedback_intent_unique_idx");
    expect(sql).toContain("WHERE revision_intent_id IS NOT NULL");
    expect(sql).not.toContain("completed_revision_feedback_id");
    expect(sql).toContain("Revision intent provenance does not match feedback provenance");
  });

  test("Outcome lookup is batched per Version and edits use CAS", async () => {
    const server = await source("src/lib/audio-outcome.functions.ts");

    expect(server).toContain("listAudioOutcomeEvaluations");
    expect(server).toContain('.eq("source_version_prompt_id", data.versionId)');
    expect(server).toContain('.eq("lock_version", data.expectedLockVersion)');
    expect(server).toContain("expectedLockVersion + 1");
    expect(server).not.toContain("for (const track");
  });

  test("Intent creation relies on DB-atomic active uniqueness and edits use CAS", async () => {
    const server = await source("src/lib/audio-revision-intent.functions.ts");
    const sql = await source(
      "supabase/migrations/20261002111500_pb003_followup_outcome_intent_schema.sql",
    );

    expect(sql).toContain("project_audio_revision_intent_one_active_idx");
    expect(server).toContain('error.code !== "23505"');
    expect(server).toContain('.eq("lock_version", data.expectedLockVersion)');
    expect(server).toContain("data.expectedLockVersion + 1");
  });

  test("audio_revision_intent durable results are the only new 24-hour cleanup target", async () => {
    const contract = await source(
      "supabase/migrations/20261002112500_pb003_followup_audio_revision_intent_ai_contract.sql",
    );
    const claim = await source(
      "supabase/migrations/20261002112600_pb003_followup_audio_revision_intent_claim.sql",
    );

    expect(contract).toContain("'audio_revision_intent'");
    expect(contract).toContain("completed_at <= now() - interval '24 hours'");
    expect(contract).toContain("SET result = NULL");
    expect(claim).toContain("cleanup_audio_revision_intent_ai_results_internal");
    expect(claim).toContain("AI proposal expired; start a new request.");
    expect(contract).not.toContain("DELETE FROM public.project_audio_revision_intents");
    expect(contract).not.toContain("DELETE FROM public.project_audio_outcome_evaluations");
    expect(contract).not.toContain("DELETE FROM public.project_audio_revision_feedback");
  });

  test("AI translator uses durable auxiliary AI and exact source structure without product auto-apply", async () => {
    const translator = await source("src/lib/audio-revision-intent-ai.functions.ts");

    expect(translator).toContain('operation: "audio_revision_intent"');
    expect(translator).toContain("executeDurableAuxiliaryAiRequest");
    expect(translator).toContain("snapshot.data.songStructure");
    expect(translator).toContain("validateAudioRevisionSectionSuggestions");
    expect(translator).not.toContain("saveSongAnalysis");
    expect(translator).not.toContain("listSongAnalyses");
    expect(translator).not.toContain("audio_url");
    expect(translator).not.toContain("accepted_keep_text:");
  });

  test("section targets resolve only with exact canonical index, label and confidence", () => {
    const structure = ["Verse", "Chorus", "Verse", "Chorus"];
    const result = validateAudioRevisionSectionSuggestions(structure, {
      keep: "",
      change: "",
      revisionBrief: "",
      sectionSuggestions: [
        { structureIndex: 1, sectionLabel: "Chorus", instruction: "Lift", confidence: 0.9 },
        { structureIndex: 2, sectionLabel: "Chorus", instruction: "Wrong label", confidence: 0.9 },
        { structureIndex: 99, sectionLabel: "Verse", instruction: "Missing", confidence: 0.9 },
        { structureIndex: 0, sectionLabel: "Verse", instruction: "Unsure", confidence: 0.2 },
        { structureIndex: null, sectionLabel: null, instruction: "Ambiguous", confidence: 0.8 },
      ],
    });

    expect(result.resolved).toEqual([
      {
        structureIndex: 1,
        sectionLabel: "Chorus",
        occurrence: 1,
        instruction: "Lift",
        confidence: 0.9,
      },
    ]);
    expect(result.unresolved.map((item) => item.reason)).toEqual([
      "label_mismatch",
      "out_of_range",
      "low_confidence",
      "missing_index",
    ]);
  });

  test("Intent-backed feedback reuses canonical feedback and child before rechecking current source", async () => {
    const server = await source("src/lib/audio-revision-feedback.functions.ts");
    const findIntent = server.indexOf("findByIntent");
    const existingChild = server.indexOf("feedback?.created_revision_prompt_id");
    const eligibility = server.indexOf("await assertCurrentAudioRevisionSource");

    expect(findIntent).toBeGreaterThan(-1);
    expect(existingChild).toBeGreaterThan(findIntent);
    expect(eligibility).toBeGreaterThan(existingChild);
    expect(server).toContain("revision_intent_id: data.revisionIntentId ?? null");
    expect(server).toContain("markIntentCompleted");
  });
});
