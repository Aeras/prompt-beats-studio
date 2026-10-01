BEGIN;

-- Trigger-only SECURITY DEFINER helper. Browsers must never invoke it as RPC.
REVOKE ALL ON FUNCTION public.song_universe_validate_planner_brief_owner()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.song_universe_validate_planner_brief_owner()
  TO service_role;

COMMIT;