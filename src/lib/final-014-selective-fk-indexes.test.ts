import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const migrationPath = "../../supabase/migrations/20260926133000_final_014_selective_fk_indexes.sql";

async function migration() {
  return readFile(new URL(migrationPath, import.meta.url), "utf8");
}

describe("FINAL-014 selective FK indexing", () => {
  test("adds covering indexes only to selected high-growth FK paths", async () => {
    const sql = await migration();

    const expected = [
      "admin_audit_log (admin_user_id)",
      "admin_audit_log (target_user_id)",
      "content_reports (reviewed_by)",
      "library_folders (parent_folder_id)",
      "prompt_projects (folder_id)",
      "saved_prompts (folder_id)",
      "private_review_comments (author_reviewer_id)",
      "private_review_comments (parent_comment_id)",
      "private_review_comments (thread_reviewer_id)",
      "moderation_cases (assigned_by)",
      "moderation_cases (initial_proposed_by)",
      "moderation_cases (initial_approved_by)",
      "moderation_case_appeals (admin_proposed_by)",
      "moderation_case_appeals (super_admin_by)",
    ];

    for (const fragment of expected) expect(sql).toContain(fragment);
  });

  test("does not mechanically index every advisor finding or remove existing indexes", async () => {
    const sql = await migration();

    expect(sql).not.toContain("feature_access_policies (updated_by)");
    expect(sql).not.toContain("user_donation_settings (admin_updated_by)");
    expect(sql.toLowerCase()).not.toContain("drop index");
  });
});
