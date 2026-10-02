import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { selectHomeRecentProject } from "./home-recent-project.shared";

const projectA = { id: "project-a", name: "Project A" };
const projectB = { id: "project-b", name: "Project B" };

function version(
  id: string,
  projectId: string | null,
  versionNumber: number | null,
  createdAt: string,
  label: string | null = null,
) {
  return {
    id,
    project_id: projectId,
    version_number: versionNumber,
    version_label: label,
    created_at: createdAt,
  };
}

describe("PB-007 Home recent Project", () => {
  test("returns null when no eligible Project exists", () => {
    expect(selectHomeRecentProject([], [])).toBeNull();
    expect(
      selectHomeRecentProject([version("detached", null, 1, "2026-10-01T12:00:00Z")], [projectA]),
    ).toBeNull();
  });

  test("selects the Project whose canonical Version was created most recently", () => {
    const selected = selectHomeRecentProject(
      [
        version("a-1", projectA.id, 1, "2026-09-30T12:00:00Z"),
        version("b-2", projectB.id, 2, "2026-10-01T12:00:00Z", "Revision 2"),
      ],
      [projectA, projectB],
    );

    expect(selected).toEqual({
      projectId: projectB.id,
      projectName: projectB.name,
      versionId: "b-2",
      versionNumber: 2,
      versionLabel: "Revision 2",
      versionCreatedAt: "2026-10-01T12:00:00Z",
    });
  });

  test("many newest Versions from one Project still resolve to that Project", () => {
    const selected = selectHomeRecentProject(
      [
        version("a-3", projectA.id, 3, "2026-10-03T12:00:00Z"),
        version("a-2", projectA.id, 2, "2026-10-02T12:00:00Z"),
        version("b-1", projectB.id, 1, "2026-10-01T12:00:00Z"),
      ],
      [projectA, projectB],
    );

    expect(selected?.projectId).toBe(projectA.id);
    expect(selected?.versionId).toBe("a-3");
  });

  test("falls through an inaccessible or deleted Project candidate", () => {
    const selected = selectHomeRecentProject(
      [
        version("missing-2", "deleted-project", 2, "2026-10-03T12:00:00Z"),
        version("a-1", projectA.id, 1, "2026-10-02T12:00:00Z"),
      ],
      [projectA],
    );

    expect(selected?.projectId).toBe(projectA.id);
  });

  test("v1 recency uses Version created_at and has no last-edit input", () => {
    const selected = selectHomeRecentProject(
      [
        version("a-1", projectA.id, 1, "2026-09-01T12:00:00Z"),
        version("b-1", projectB.id, 1, "2026-09-02T12:00:00Z"),
      ],
      [projectA, projectB],
    );

    expect(selected?.projectId).toBe(projectB.id);
  });

  test("server read is authenticated, caller-bound, bounded, and does not use admin access", async () => {
    const source = await readFile("src/lib/home.functions.ts", "utf8");

    expect(source).toContain("requireSupabaseAuth");
    expect(source).toContain("resolveRecentProject(context.supabase, context.userId)");
    expect(source).toContain('.eq("user_id", userId)');
    expect(source).toContain('.order("created_at", { ascending: false })');
    expect(source).toContain("HOME_RECENT_VERSION_CANDIDATE_LIMIT = 24");
    expect(source).toContain(".limit(HOME_RECENT_VERSION_CANDIDATE_LIMIT)");
    expect(source).not.toContain("supabaseAdmin");
    expect(source).not.toContain("service_role");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("updated_at");
  });
});
