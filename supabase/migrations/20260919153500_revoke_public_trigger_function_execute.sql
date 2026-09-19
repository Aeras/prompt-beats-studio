-- Harden internal SECURITY DEFINER trigger helpers.
-- These functions are invoked by existing database triggers and are not intended
-- to be directly executable by API client roles.

BEGIN;

REVOKE EXECUTE ON FUNCTION public._backfill_ai_usage_when_pricing_verified()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public._price_ai_usage_log_before_insert()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.prune_private_track_library_refs()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.touch_playlist_from_items()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._backfill_ai_usage_when_pricing_verified()
TO service_role;

GRANT EXECUTE ON FUNCTION public._price_ai_usage_log_before_insert()
TO service_role;

GRANT EXECUTE ON FUNCTION public.prune_private_track_library_refs()
TO service_role;

GRANT EXECUTE ON FUNCTION public.touch_playlist_from_items()
TO service_role;

COMMIT;
