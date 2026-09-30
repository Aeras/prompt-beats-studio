import { describe, expect, test } from "bun:test";

import { projectUniverseSummarySchema } from "@/lib/song-universe-planner.shared";

describe("Song Universe Project Memory timestamps", () => {
  test("accepts Supabase/Postgres timestamptz values with explicit UTC offsets", () => {
    const parsed = projectUniverseSummarySchema.parse({
      projectId: "4289457d-10de-467c-b173-2302e6e1a32c",
      projectTitle: "Νυχτερινές Διαδρομές — Track 1",
      position: 0,
      versionUpdatedAt: "2026-09-30T08:23:56.608848+00:00",
      storyMapUpdatedAt: null,
      updatedAt: "2026-09-30T08:25:55.994682+00:00",
    });

    expect(parsed.versionUpdatedAt).toBe("2026-09-30T08:23:56.608848+00:00");
    expect(parsed.updatedAt).toBe("2026-09-30T08:25:55.994682+00:00");
  });

  test("continues to accept canonical Z timestamps", () => {
    const parsed = projectUniverseSummarySchema.parse({
      projectId: "4289457d-10de-467c-b173-2302e6e1a32c",
      projectTitle: "Νυχτερινές Διαδρομές — Track 1",
      position: 0,
      versionUpdatedAt: "2026-09-30T08:23:56.608Z",
      storyMapUpdatedAt: "2026-09-30T08:24:10.000Z",
      updatedAt: "2026-09-30T08:25:55.994Z",
    });

    expect(parsed.storyMapUpdatedAt).toBe("2026-09-30T08:24:10.000Z");
  });

  test("still rejects malformed timestamp strings", () => {
    const parsed = projectUniverseSummarySchema.safeParse({
      projectId: "4289457d-10de-467c-b173-2302e6e1a32c",
      projectTitle: "Νυχτερινές Διαδρομές — Track 1",
      position: 0,
      versionUpdatedAt: "not-a-timestamp",
      updatedAt: "2026-09-30T08:25:55.994682+00:00",
    });

    expect(parsed.success).toBe(false);
  });
});
