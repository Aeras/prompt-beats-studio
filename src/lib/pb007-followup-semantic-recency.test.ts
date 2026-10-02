import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const MIGRATION =
  "supabase/migrations/20261002054500_pb007_followup_semantic_recency.sql";

async function migrationSource() {
  return readFile(MIGRATION, "utf8");
}

describe("PB-007 follow-up semantic recency", () => {
  test("adds exactly the three approved semantic-recency columns and candidate indexes", async () => {
    const sql = await migrationSource();
    for (const table of ["song_universes", "story_maps", "inspiration_walls"]) {
      expect(sql).toContain(`ALTER TABLE public.${table}`);
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS creative_updated_at timestamptz");
    }
    expect(sql).toContain("song_universes_owner_creative_recency_idx");
    expect(sql).toContain("story_maps_user_creative_recency_idx");
    expect(sql).toContain("inspiration_walls_owner_creative_recency_idx");
    expect(sql).not.toContain("prompt_projects\n  ADD COLUMN");
  });

  test("historical initialization is deterministic and excludes relationship-only track links", async () => {
    const sql = await migrationSource();
    expect(sql).toContain("max(p.updated_at)");
    expect(sql).toContain("max(b.updated_at)");
    expect(sql).toContain("max(c.updated_at)");
    expect(sql).not.toMatch(/SET creative_updated_at = now\(\)\s*WHERE .*creative_updated_at IS NULL/s);
    expect(sql).not.toContain("inspiration_wall_track_links_semantic");
    expect(sql).toContain(
      "Pre-migration semantic recency is best-effort. Qualifying post-migration writes are exact.",
    );
  });

  test("parent triggers use explicit approved creative fields instead of generic update bumps", async () => {
    const sql = await migrationSource();
    expect(sql).toContain("OLD.description");
    expect(sql).toContain("OLD.universe_type");
    expect(sql).toContain("OLD.creative_bible");
    expect(sql).toContain("OLD.planned_track_count");
    expect(sql).toContain("OLD.story_bible");
    expect(sql).toContain("OLD.planner_contrast");

    expect(sql).toContain("OLD.concept");
    expect(sql).toContain("OLD.emotional_direction");
    expect(sql).toContain("OLD.desired_ending");
    expect(sql).toContain("OLD.central_change");
    expect(sql).toContain("OLD.turning_point");
    expect(sql).toContain("OLD.resolution");

    expect(sql).toContain("OLD.selected_theme");
    expect(sql).toContain("OLD.creative_direction");
    expect(sql).toContain("IS DISTINCT FROM ROW(");
    expect(sql).not.toContain("BEFORE UPDATE SET creative_updated_at");
  });

  test("child propagation is statement-level and compares only semantic fields", async () => {
    const sql = await migrationSource();
    for (const table of [
      "song_universe_projects",
      "story_map_beats",
      "inspiration_wall_cards",
    ]) {
      expect(sql).toContain(`AFTER INSERT ON public.${table}`);
      expect(sql).toContain(`AFTER DELETE ON public.${table}`);
      expect(sql).toContain(`AFTER UPDATE ON public.${table}`);
    }
    expect(sql.match(/FOR EACH STATEMENT/g)?.length).toBe(9);
    expect(sql).toContain("old_row.position");
    expect(sql).toContain("old_row.context_snapshot");
    expect(sql).toContain("old_row.what_happens");
    expect(sql).toContain("old_row.suggested_sections");
    expect(sql).toContain("old_row.image_object_key");
    expect(sql).toContain("old_row.artistic_layout");
  });

  test("noncreative columns are not part of parent semantic comparisons", async () => {
    const sql = await migrationSource();
    const universeFn = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.song_universe_set_creative_updated_at"),
      sql.indexOf("DROP TRIGGER IF EXISTS song_universes_set_creative_updated_at"),
    );
    expect(universeFn).not.toContain("OLD.title");
    expect(universeFn).not.toContain("OLD.status");
    expect(universeFn).not.toContain("OLD.cover_object_key");

    const storyFn = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.story_map_set_creative_updated_at"),
      sql.indexOf("DROP TRIGGER IF EXISTS story_maps_set_creative_updated_at"),
    );
    expect(storyFn).not.toContain("OLD.title");
    expect(storyFn).not.toContain("OLD.project_id");
    expect(storyFn).not.toContain("OLD.source_project_version_id");

    const wallFn = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.inspiration_wall_set_creative_updated_at"),
      sql.indexOf("DROP TRIGGER IF EXISTS inspiration_walls_set_creative_updated_at"),
    );
    expect(wallFn).not.toContain("OLD.title");
    expect(wallFn).not.toContain("OLD.connected_project_id");
    expect(wallFn).not.toContain("OLD.universe_id");
  });
});
