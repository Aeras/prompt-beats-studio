-- Moderation case read helpers call has_moderation_capability(),
-- which acquires a row lock through _lock_user_security_state().
-- They must not run as STABLE/read-only functions.
ALTER FUNCTION public._moderation_case_can_read(uuid, uuid) VOLATILE;
ALTER FUNCTION public.get_moderation_case_unread_count() VOLATILE;
ALTER FUNCTION public.get_moderation_case(uuid) VOLATILE;
