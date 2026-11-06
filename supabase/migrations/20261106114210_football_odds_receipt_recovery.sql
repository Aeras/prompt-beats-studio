-- Read-only recovery/status. Existing claims, quotas and 15-minute attempt floor retained.
BEGIN;
CREATE FUNCTION public.read_private_football_odds_feed(_file text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.private_football_odds_feed; started timestamptz; state text;
BEGIN
 IF _file IS NULL OR _file NOT IN ('site_pregame_stoiximan_soccer_leagues.json','site_pregame_stoiximan_soccer.json') THEN RAISE EXCEPTION 'invalid feed'; END IF;
 SELECT * INTO f FROM public.private_football_odds_feed WHERE file=_file;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','unavailable'); END IF;
 -- Never reserve, clear a token, change quota, shorten Retry-After or expose stale payload.
 IF f.payload IS NOT NULL AND f.retrieved_at > now()-interval '15 minutes' AND f.retrieved_at <= now() THEN
  RETURN jsonb_build_object('status','cached','payload',f.payload,'retrievedAtUtc',
   to_char(f.retrieved_at AT TIME ZONE 'UTC','YYYY-MM-DD') || 'T' || to_char(f.retrieved_at AT TIME ZONE 'UTC','HH24:MI:SS.MS') || 'Z');
 END IF;
 IF f.blocked_until > now() THEN RETURN jsonb_build_object('status','rate_limited'); END IF;
 IF f.token IS NOT NULL AND f.lease_until > now() THEN
  SELECT created_at INTO started FROM public.private_football_odds_attempts WHERE token=f.token;
  state := CASE WHEN started IS NOT NULL AND started > now()-interval '30 seconds' THEN 'busy' ELSE 'recovery_pending' END;
  RETURN jsonb_build_object('status',state);
 END IF;
 IF coalesce((SELECT requests FROM public.private_football_odds_budget WHERE month=date_trunc('month',now() AT TIME ZONE 'UTC')::date),0)>=200
 OR (SELECT count(*) FROM public.private_football_odds_attempts WHERE created_at>now()-interval '31 days')>=200 THEN
  RETURN jsonb_build_object('status','quota_exhausted');
 END IF;
 RETURN jsonb_build_object('status', CASE WHEN f.payload IS NOT NULL THEN 'stale' ELSE 'unavailable' END);
END $$;
REVOKE ALL ON FUNCTION public.read_private_football_odds_feed(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_private_football_odds_feed(text) TO service_role;
-- Existing claim/finish definitions, grants, data and migration history remain unchanged.
COMMIT;
