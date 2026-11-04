-- Expand private football research admission for ESPN. No user-facing table privileges.
BEGIN;
ALTER TABLE public.private_football_research_runs DROP CONSTRAINT private_football_research_runs_source_check;
ALTER TABLE public.private_football_research_runs ADD CONSTRAINT private_football_research_runs_source_check
  CHECK (source IN ('api-football','football-data','ai-search','espn'));
ALTER TABLE public.private_football_research_runs DROP CONSTRAINT private_football_research_runs_league_id_check;
ALTER TABLE public.private_football_research_runs ADD CONSTRAINT private_football_research_runs_league_id_check
  CHECK (league_id IN ('GR-SL','EN-PL','ES-LL','IT-SA','DE-BL','FR-L1','NL-ED','PT-PL','BE-PL','CH-SL','UEFA-CL','UEFA-EL'));
CREATE OR REPLACE FUNCTION public.claim_private_football_research_run_v2(
  _user_id uuid,
  _request_key uuid,
  _fixture_id bigint,
  _league_id text,
  _home_team text,
  _away_team text,
  _kickoff_utc timestamptz,
  _model_id text,
  _source text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE
  existing public.private_football_research_runs;
  created public.private_football_research_runs;
  recent_count integer;
  active_count integer;
BEGIN
  IF NOT public._has_role_internal(_user_id, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;
  IF _source NOT IN ('api-football','football-data','espn') THEN
    RAISE EXCEPTION 'unsupported football provider';
  END IF;
  IF _kickoff_utc <= now() OR _fixture_id <= 0
     OR _league_id NOT IN ('GR-SL','EN-PL','ES-LL','IT-SA','DE-BL','FR-L1','NL-ED','PT-PL','BE-PL','UEFA-CL','UEFA-EL')
     OR length(_model_id) NOT BETWEEN 1 AND 240
     OR length(_home_team) NOT BETWEEN 1 AND 200
     OR length(_away_team) NOT BETWEEN 1 AND 200
  THEN
    RAISE EXCEPTION 'invalid football research input';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('football-research:' || _user_id::text, 0));

  SELECT * INTO existing FROM public.private_football_research_runs
    WHERE user_id = _user_id AND request_key = _request_key;
  IF FOUND THEN
    IF existing.source IS DISTINCT FROM _source OR
       (existing.fixture_id, existing.league_id, existing.home_team, existing.away_team,
        existing.kickoff_utc, existing.model_id) IS DISTINCT FROM
       (_fixture_id, _league_id, _home_team, _away_team, _kickoff_utc, _model_id) THEN
      RAISE EXCEPTION 'research request key reused with different payload';
    END IF;
    RETURN jsonb_build_object('status', existing.status, 'id', existing.id);
  END IF;

  SELECT count(*)::integer INTO recent_count FROM public.private_football_research_runs
    WHERE user_id = _user_id AND created_at > now() - interval '1 hour';
  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'football research hourly limit reached';
  END IF;

  SELECT count(*)::integer INTO active_count FROM public.private_football_research_runs
    WHERE user_id = _user_id AND status = 'processing'
      AND created_at > now() - interval '15 minutes';
  IF active_count > 0 THEN
    RAISE EXCEPTION 'football research already processing';
  END IF;

  INSERT INTO public.private_football_research_runs (
    user_id, request_key, fixture_id, league_id, home_team, away_team,
    kickoff_utc, model_id, source
  ) VALUES (
    _user_id, _request_key, _fixture_id, _league_id, _home_team, _away_team,
    _kickoff_utc, _model_id, _source
  ) RETURNING * INTO created;
  RETURN jsonb_build_object('status', 'claimed', 'id', created.id);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_private_football_research_run_v2(uuid,uuid,bigint,text,text,text,timestamptz,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_private_football_research_run_v2(uuid,uuid,bigint,text,text,text,timestamptz,text,text) TO service_role;
COMMIT;
