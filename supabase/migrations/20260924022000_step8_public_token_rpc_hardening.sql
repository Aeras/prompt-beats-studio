-- Step 8 / Batch 3: public token flows are served through PromptBeats server functions.
-- Keep the underlying SECURITY DEFINER RPCs private to the service role so tokens,
-- reviewer keys, and share lookups cannot bypass application-level request controls.
BEGIN;

REVOKE ALL ON FUNCTION public.private_review_link_info(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.join_private_review_session(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_private_review_session(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_private_review_comment(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_track_share_by_token(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.private_review_link_info(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.join_private_review_session(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_private_review_session(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_private_review_comment(text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_track_share_by_token(text) TO service_role;

COMMIT;
