import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

const saveMigration = "supabase/migrations/20260923044500_lyrics_review_project_save.sql";
const admissionMigration =
  "supabase/migrations/20260923050000_lyrics_review_generation_admission.sql";

describe("Lyrics Review Phase 1 integration", () => {
  test("Project context is owner-scoped and selected version is constrained to its Project", async () => {
    const server = await source("src/lib/lyrics-review.functions.ts");
    expect(server).toContain('.eq("user_id", context.userId)');
    expect(server).toContain('.eq("project_id", data.projectId)');
    expect(server).toContain("versions.find((version) => version.id === data.versionId)");
  });

  test("Project version selector is populated only from the selected Project query", async () => {
    const server = await source("src/lib/lyrics-review.functions.ts");
    const route = await source("src/routes/lyrics-review.tsx");
    expect(server).toContain('.eq("project_id", data.projectId)');
    expect(route).toContain("projectContext.data.versions.map");
    expect(route).toContain("changeVersion(event.target.value)");
  });

  test("standalone mode works without a Project ID", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    expect(route).toContain('type SourceMode = "standalone" | "project" | "generator"');
    expect(route).toContain('return "standalone"');
    expect(route).toContain('mode === "standalone"');
  });

  test("standalone paste auto-detects language and exposes a manual override", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    expect(route).toContain("detectLyricsLanguage(lyrics)");
    expect(route).toContain("Αναγνωρίστηκε");
    expect(route).toContain("Πιθανή γλώσσα");
    expect(route).toContain("setManualLanguage(true)");
    for (const code of ["el", "en", "es", "it", "pt", "ru"]) {
      expect(await source("src/lib/lyrics-review.shared.ts")).toContain(`code: "${code}"`);
    }
  });

  test("known Project and Generator language bypass standalone detection", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    expect(route).toContain("lyricsReviewLanguageFromCanonical(data.selected.language)");
    expect(route).toContain("lyricsReviewLanguageFromCanonical(handoff.authoritativeLanguage)");
    expect(route).toContain(
      'if (mode !== "standalone" || manualLanguage || !lyrics.trim()) return',
    );
  });

  test("instant analysis is deterministic and does not require an AI request", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    const core = await source("src/lib/lyrics-review.shared.ts");
    expect(route).toContain("analyzeLyricsDeterministic");
    expect(route).toContain("χωρίς AI request ή AI credits");
    expect(core).not.toContain("getModelForUser");
    expect(core).not.toContain("fetch(");
  });

  test("Deep Review is opt-in, section-scoped, feature-gated and uses existing provider model access", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    const server = await source("src/lib/lyrics-review.functions.ts");
    expect(route).toContain("startDeepReview(section.key)");
    expect(server).toContain('requireFeatureAccess(context.supabase, "lyrics_review")');
    expect(server).toContain(
      'getModelForUser(context.userId, data.generationModel ?? undefined, "generator")',
    );
    expect(server).toContain("sectionKey: selected.key");
  });

  test("durable AI admission recognizes Lyrics Review independently from Lyrics Workspace", async () => {
    const sql = await source(admissionMigration);
    const server = await source("src/lib/lyrics-review.functions.ts");
    expect(server).toContain("feature: data.feature");
    expect(server).toContain('returnedPayload.data.feature !== "lyrics_review"');
    expect(sql).toContain("_input->>'feature'");
    expect(sql).toContain("THEN 'lyrics_review'");
    expect(sql).toContain("THEN 'lyrics_workspace'");
  });

  test("AI failure does not clear deterministic metrics or current edits", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    expect(route).toContain("setAiError");
    expect(route).toContain("Keep deterministic analysis and current lyric edits intact");
    expect(route).not.toContain('setLyrics("")');
  });

  test("AI proposal is previewed before Apply and supports one-step Undo", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    expect(route).toContain("Πρόταση πριν την εφαρμογή");
    expect(route).toContain("proposalOptions");
    expect(route).toContain("applyProposal");
    expect(route).toContain("lastApplied");
    expect(route).toContain("undoLast");
  });

  test("Project new-version save is the visually primary action and never mutates the source version", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    const sql = await source(saveMigration);
    expect(route).toContain('saveProject("new_version")');
    expect(route).toContain("bg-gradient-neon");
    expect(sql).toContain("INSERT INTO public.saved_prompts");
    expect(sql).toContain("_parent_prompt_id");
  });

  test("new Project versions increment under a project advisory lock", async () => {
    const sql = await source(saveMigration);
    expect(sql).toContain("pg_advisory_xact_lock(hashtext(_project_id::text))");
    expect(sql).toContain("COALESCE(MAX(version_number), 0) + 1");
  });

  test("Replace Current Version is UI-restricted and server-enforced to a branch leaf", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    const sql = await source("supabase/migrations/20260923150000_branching_versions_phase1.sql");
    expect(route).toContain("!selectedProject.isLeaf");
    expect(route).toContain("Η V${selectedProject.versionNumber");
    expect(sql).toContain("Only a leaf project version can be replaced");
    expect(sql).toContain("child.parent_prompt_id = _version_prompt_id");
  });

  test("Replace latest updates the same row and does not insert an accidental version", async () => {
    const sql = await source(saveMigration);
    const start = sql.indexOf("replace_latest_prompt_lyrics_review_version");
    const block = sql.slice(start);
    expect(block).toContain("UPDATE public.saved_prompts");
    expect(block).not.toContain("INSERT INTO public.saved_prompts");
  });

  test("Lyrics Review writes canonical Version History metadata", async () => {
    const history = await source("src/lib/project-version-history.shared.ts");
    const ui = await source("src/components/promptbeats/ProjectVersionHistory.tsx");
    expect(history).toContain('source: "lyrics_review"');
    expect(history).toContain("buildLyricsReviewVersionMetadata");
    expect(ui).toContain('source === "lyrics_review"');
  });

  test("Project-level entry point avoids a Lyrics Review button on every version card", async () => {
    const history = await source("src/components/promptbeats/ProjectVersionHistory.tsx");
    expect(history).toContain('search={{ source: "project", project: projectId }}');
    expect(history.match(/>\s*Lyrics Review\s*</g)?.length ?? 0).toBe(1);
  });

  test("Generator handoff contract keeps actual lyrics out of route query parameters", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    const handoff = await source("src/lib/lyrics-review-handoff.shared.ts");
    expect(route).toContain("handoff: z.string().guid().optional()");
    expect(route).not.toContain("lyrics: z.string().optional()");
    expect(handoff).toContain("window.sessionStorage.setItem");
    expect(handoff).toContain("reviewedLyrics");
  });

  test("Generator handoff contract preserves result, snapshot, AI state and revision context", async () => {
    const handoff = await source("src/lib/lyrics-review-handoff.shared.ts");
    for (const key of [
      "snapshot",
      "result",
      "quality",
      "songContext",
      "generationId",
      "generationModel",
      "qualityCheckModel",
      "saved",
      "open",
      "applied",
      "applyErrors",
      "revisionMode",
      "revisionProjectId",
      "revisionBasePromptId",
      "revisionRequest",
      "revisionMeta",
    ]) {
      expect(handoff).toContain(key);
    }
  });

  test("Generator return actions distinguish apply from discard", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    expect(route).toContain('returnMode: apply ? "apply" : "discard"');
    expect(route).toContain("reviewedLyrics: apply ? lyrics : null");
    expect(route).toContain("Εφαρμογή & Επιστροφή");
    expect(route).toContain("Επιστροφή χωρίς αλλαγές");
  });

  test("unsaved lyrics are protected on browser unload and source-specific exits", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    expect(route).toContain('window.addEventListener("beforeunload"');
    expect(route).toContain("Έχεις μη αποθηκευμένες αλλαγές");
    expect(route).toContain("Return without the Lyrics Review changes?");
  });

  test("core smartphone rendering uses cards and rows rather than a horizontal metrics table", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    expect(route).toContain("space-y-2");
    expect(route).toContain("rounded-xl border p-3");
    expect(route).not.toContain("<table");
  });

  test("no artistic percentage or professional score is exposed", async () => {
    const core = await source("src/lib/lyrics-review.shared.ts");
    const route = await source("src/routes/lyrics-review.tsx");
    expect(core).not.toContain("artistryScore");
    expect(route).not.toContain("professional score");
    expect(route).not.toContain("% good");
  });

  test("rhyme UI explicitly labels deterministic results as clues rather than phonetic truth", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    expect(route).toContain("Possible rhyme relationships");
    expect(route).toContain("not a phonetic rhyme score");
  });

  test("Lyrics Review has a canonical Feature Access key and navigation hides when denied", async () => {
    const features = await source("src/lib/feature-access.functions.ts");
    const sidebar = await source("src/components/promptbeats/Sidebar.tsx");
    expect(features).toContain('"lyrics_review"');
    expect(sidebar).toContain('useFeatureAccess("lyrics_review")');
    expect(sidebar).toContain('item.id !== "lyricsReview" || lyricsReviewAccess.allowed');
  });

  test("privacy-sensitive Project IDs are authorization-checked server-side", async () => {
    const server = await source("src/lib/lyrics-review.functions.ts");
    expect(server).toContain('.eq("id", data.projectId)');
    expect(server).toContain('.eq("user_id", context.userId)');
    expect(server).toContain('if (!project) throw new Error("Project not found.")');
  });
});
