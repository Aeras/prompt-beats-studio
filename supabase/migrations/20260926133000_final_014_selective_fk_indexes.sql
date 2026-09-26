-- FINAL-014 — selective foreign-key indexes for high-growth operational paths.
-- This intentionally does not index every advisor finding. The selected keys
-- cover audit/moderation history, Library folder traversal, Project/Prompt
-- organization, and Private Review comment/thread growth.

create index if not exists admin_audit_log_admin_user_id_idx
  on public.admin_audit_log (admin_user_id);
create index if not exists admin_audit_log_target_user_id_idx
  on public.admin_audit_log (target_user_id);

create index if not exists content_reports_reviewed_by_idx
  on public.content_reports (reviewed_by);

create index if not exists library_folders_parent_folder_id_idx
  on public.library_folders (parent_folder_id);
create index if not exists prompt_projects_folder_id_idx
  on public.prompt_projects (folder_id);
create index if not exists saved_prompts_folder_id_idx
  on public.saved_prompts (folder_id);

create index if not exists private_review_comments_author_reviewer_id_idx
  on public.private_review_comments (author_reviewer_id);
create index if not exists private_review_comments_parent_comment_id_idx
  on public.private_review_comments (parent_comment_id);
create index if not exists private_review_comments_thread_reviewer_id_idx
  on public.private_review_comments (thread_reviewer_id);

create index if not exists moderation_cases_assigned_by_idx
  on public.moderation_cases (assigned_by);
create index if not exists moderation_cases_initial_proposed_by_idx
  on public.moderation_cases (initial_proposed_by);
create index if not exists moderation_cases_initial_approved_by_idx
  on public.moderation_cases (initial_approved_by);

create index if not exists moderation_case_appeals_admin_proposed_by_idx
  on public.moderation_case_appeals (admin_proposed_by);
create index if not exists moderation_case_appeals_super_admin_by_idx
  on public.moderation_case_appeals (super_admin_by);
