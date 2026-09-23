import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const source = (path: string) => readFile(join(root, path), "utf8");

describe("Branching Versions Phase 1", () => {
  test("stores an optional branch label and preserves parent/child indexing", async () => {
    const sql = await source("supabase/migrations/20260923150000_branching_versions_phase1.sql");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS branch_label text");
    expect(sql).toContain("saved_prompts_project_parent_idx");
    expect(sql).toContain("parent_prompt_id = _version_prompt_id");
    expect(sql).toContain("Only a leaf project version can be replaced");
  });

  test("history exposes branching without changing canonical V numbers", async () => {
    const history = await source("src/components/promptbeats/ProjectVersionHistory.tsx");
    const server = await source("src/lib/ai.functions.ts");
    expect(server).toContain("branch_label");
    expect(server).toContain("updateVersionBranchLabel");
    expect(history).toContain("Continue from this Version");
    expect(history).toContain("Alternate direction");
    expect(history).toContain("branchShape.childCount");
    expect(history).toContain(
      'search={{ mode: "revision", project: projectId, base: version.id }}',
    );
    expect(history).toContain("`V${version.version_number ?? index + 1}`");
  });

  test("Lyrics Review replacement follows the selected branch leaf", async () => {
    const server = await source("src/lib/lyrics-review.functions.ts");
    const route = await source("src/routes/lyrics-review.tsx");
    expect(server).toContain("isLeaf: !parentIds.has(selected.id)");
    expect(route).toContain("!selectedProject.isLeaf");
  });
});
