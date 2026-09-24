-- Step 8 / Batch 1: reduce unnecessary RPC attack surface and remove redundant storage policies.
BEGIN;

-- Trigger-only helpers must not be exposed as browser-callable RPCs.
REVOKE EXECUTE ON FUNCTION public.story_map_validate_project_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.song_universe_validate_project_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.song_universe_validate_analysis_owner() FROM PUBLIC, anon, authenticated;

-- Internal moderation helpers are implementation details of higher-level RPCs.
REVOKE EXECUTE ON FUNCTION public._moderation_case_actor_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._moderation_case_can_read(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Preserve service-role access for maintenance / server-side diagnostics.
GRANT EXECUTE ON FUNCTION public.story_map_validate_project_owner() TO service_role;
GRANT EXECUTE ON FUNCTION public.song_universe_validate_project_owner() TO service_role;
GRANT EXECUTE ON FUNCTION public.song_universe_validate_analysis_owner() TO service_role;
GRANT EXECUTE ON FUNCTION public._moderation_case_actor_role(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._moderation_case_can_read(uuid, uuid) TO service_role;

-- Remove policy overlap while preserving the effective storage behavior.
-- Avatar INSERT/UPDATE/DELETE are already covered by dedicated owner policies,
-- and SELECT is already covered by "Signed-in users can view avatars".
DROP POLICY IF EXISTS "Users manage their own avatar files" ON storage.objects;

-- Track covers remain public through "Track Covers Public Access" (role PUBLIC).
DROP POLICY IF EXISTS "Anyone can view track covers" ON storage.objects;

COMMIT;
