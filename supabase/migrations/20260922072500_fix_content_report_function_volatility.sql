-- list_content_reports/get_content_report call has_moderation_capability(),
-- which acquires a row lock via _lock_user_security_state().
-- They therefore must not be marked STABLE/read-only.
ALTER FUNCTION public.list_content_reports(text) VOLATILE;
ALTER FUNCTION public.get_content_report(uuid) VOLATILE;
