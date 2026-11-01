-- Football Research Studio — third fixture source "AI Search BETA".
-- Forward-only, additive. Replaces the never-applied 20261101233000 draft
-- (which used `$` instead of `$$`). Existing api-football / football-data
-- research runs are untouched: CHECK constraints are only widened.
-- Access model: every table/RPC is service_role-only. Browser roles get no
-- privileges and there are deliberately no RLS policies; all reads go through
-- Super-Admin-checked server functions. AI output never writes the database:
-- only the server, after independent HTTP corroboration, calls these RPCs.
BEGIN;

CREATE TABLE public.private_football_ai_fixtures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- bigint bridge to the existing research-run identity model (fixture_id > 0)
  fixture_id bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league_id text NOT NULL CHECK (league_id IN (
    'IT-SA','EN-PL','ES-LL','FR-L1','DE-BL','GR-SL',
    'NL-ED','PT-PL','BE-PL','CH-SL','UEFA-CL','UEFA-EL')),
  normalized_key text NOT NULL CHECK (length(normalized_key) BETWEEN 6 AND 600),
  home_team text NOT NULL CHECK (length(home_team) BETWEEN 2 AND 200),
  away_team text NOT NULL CHECK (length(away_team) BETWEEN 2 AND 200),
  kickoff_utc timestamptz NOT NULL,
  kickoff_verified boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'candidate'
    CHECK (verification_status IN ('candidate','verified')),
  verified_sources_count integer NOT NULL DEFAULT 0 CHECK (verified_sources_count BETWEEN 0 AND 8),
  verified_at timestamptz,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_evidence) = 'array'),
  discovered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_fixture_distinct_teams CHECK (home_team <> away_team),
  CONSTRAINT ai_fixture_verified_shape CHECK (
    verification_status <> 'verified' OR (
      kickoff_verified AND verified_sources_count >= 2 AND verified_at IS NOT NULL)),
  UNIQUE (user_id, league_id, normalized_key)
);
CREATE INDEX private_football_ai_fixtures_week_idx
  ON public.private_football_ai_fixtures(user_id, league_id, kickoff_utc);
GRANT SELECT, INSERT, UPDATE ON public.private_football_ai_fixtures TO service_role;
ALTER TABLE public.private_football_ai_fixtures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_football_ai_fixtures FROM PUBLIC, anon, authenticated;

-- Verified fixtures are immutable in identity and can never be downgraded.
CREATE FUNCTION public.protect_private_football_ai_fixture()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (OLD.id, OLD.fixture_id, OLD.user_id, OLD.league_id, OLD.normalized_key, OLD.discovered_at)
     IS DISTINCT FROM
     (NEW.id, NEW.fixture_id, NEW.user_id, NEW.league_id, NEW.normalized_key, NEW.discovered_at) THEN
    RAISE EXCEPTION 'AI fixture identity is immutable';
  END IF;
  IF OLD.verification_status = 'verified' THEN
    IF NEW.verification_status <> 'verified'
       OR (OLD.home_team, OLD.away_team, OLD.kickoff_utc, OLD.kickoff_verified, OLD.verified_at,
           OLD.source_evidence, OLD.verified_sources_count)
          IS DISTINCT FROM
          (NEW.home_team, NEW.away_team, NEW.kickoff_utc, NEW.kickoff_verified, NEW.verified_at,
           NEW.source_evidence, NEW.verified_sources_count) THEN
      RAISE EXCEPTION 'verified AI fixtures are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_private_football_ai_fixture
  BEFORE UPDATE ON public.private_football_ai_fixtures
  FOR EACH ROW EXECUTE FUNCTION public.protect_private_football_ai_fixture();

-- Server-only upsert. A verified row is returned unchanged (no downgrade, no edit).
CREATE FUNCTION public.upsert_private_football_ai_fixture(
  _user_id uuid, _league_id text, _normalized_key text, _home_team text, _away_team text,
  _kickoff_utc timestamptz, _verified boolean, _source_evidence jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE
  row_ public.private_football_ai_fixtures;
  n integer := coalesce(jsonb_array_length(_source_evidence), 0);
BEGIN
  IF NOT public._has_role_internal(_user_id, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;
  IF jsonb_typeof(_source_evidence) <> 'array' OR n > 8 OR (_verified AND n < 2) THEN
    RAISE EXCEPTION 'invalid AI fixture evidence';
  END IF;
  SELECT * INTO row_ FROM public.private_football_ai_fixtures
    WHERE user_id = _user_id AND league_id = _league_id AND normalized_key = _normalized_key
    FOR UPDATE;
  IF FOUND AND row_.verification_status = 'verified' THEN
    RETURN jsonb_build_object('status','unchanged_verified','fixture_id',row_.fixture_id);
  END IF;
  IF FOUND THEN
    UPDATE public.private_football_ai_fixtures SET
      home_team = _home_team, away_team = _away_team, kickoff_utc = _kickoff_utc,
      kickoff_verified = _verified,
      verification_status = CASE WHEN _verified THEN 'verified' ELSE 'candidate' END,
      verified_sources_count = CASE WHEN _verified THEN n ELSE 0 END,
      verified_at = CASE WHEN _verified THEN now() ELSE NULL END,
      source_evidence = _source_evidence, updated_at = now()
    WHERE id = row_.id RETURNING * INTO row_;
  ELSE
    INSERT INTO public.private_football_ai_fixtures(
      user_id, league_id, normalized_key, home_team, away_team, kickoff_utc,
      kickoff_verified, verification_status, verified_sources_count, verified_at, source_evidence)
    VALUES (_user_id, _league_id, _normalized_key, _home_team, _away_team, _kickoff_utc,
      _verified, CASE WHEN _verified THEN 'verified' ELSE 'candidate' END,
      CASE WHEN _verified THEN n ELSE 0 END, CASE WHEN _verified THEN now() END, _source_evidence)
    RETURNING * INTO row_;
  END IF;
  RETURN jsonb_build_object('status', row_.verification_status, 'fixture_id', row_.fixture_id);
END;
$$;

-- Paid refresh journal: reserve before dispatch, then complete/fail exactly once.
CREATE TABLE public.private_football_ai_refresh_admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league_id text NOT NULL,
  week_date date NOT NULL,
  model_id text NOT NULL CHECK (length(model_id) BETWEEN 1 AND 240),
  max_cost_usd numeric(10,6) NOT NULL CHECK (max_cost_usd > 0 AND max_cost_usd <= 1),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','completed','failed')),
  candidates_count integer,
  verified_count integer,
  error_code text CHECK (error_code IS NULL OR length(error_code) <= 80),
  admitted_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX private_football_ai_refresh_admissions_user_time_idx
  ON public.private_football_ai_refresh_admissions (user_id, admitted_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.private_football_ai_refresh_admissions TO service_role;
ALTER TABLE public.private_football_ai_refresh_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_football_ai_refresh_admissions FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.private_football_ai_refresh_quota(_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'hourUsed', count(*) FILTER (WHERE admitted_at > now() - interval '1 hour'),
    'dayUsed', count(*),
    'hourLimit', 3, 'dayLimit', 10)
  FROM public.private_football_ai_refresh_admissions
  WHERE user_id = _user_id AND admitted_at > now() - interval '1 day';
$$;

CREATE FUNCTION public.claim_private_football_ai_fixture_refresh(
  _user_id uuid, _league_id text, _week_date date, _model_id text, _max_cost_usd numeric
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE
  q jsonb;
  created uuid;
BEGIN
  IF NOT public._has_role_internal(_user_id, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;
  IF _league_id NOT IN ('IT-SA','EN-PL','ES-LL','FR-L1','DE-BL','GR-SL',
                        'NL-ED','PT-PL','BE-PL','CH-SL','UEFA-CL','UEFA-EL') THEN
    RAISE EXCEPTION 'unsupported competition';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('football-ai-refresh:' || _user_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.private_football_ai_refresh_admissions
             WHERE user_id = _user_id AND status = 'reserved'
               AND admitted_at > now() - interval '10 minutes') THEN
    RAISE EXCEPTION 'AI fixture refresh already running';
  END IF;
  q := public.private_football_ai_refresh_quota(_user_id);
  IF (q->>'hourUsed')::int >= 3 THEN
    RAISE EXCEPTION 'AI fixture hourly refresh quota exceeded';
  END IF;
  IF (q->>'dayUsed')::int >= 10 THEN
    RAISE EXCEPTION 'AI fixture daily refresh quota exceeded';
  END IF;
  INSERT INTO public.private_football_ai_refresh_admissions(
    user_id, league_id, week_date, model_id, max_cost_usd)
  VALUES (_user_id, _league_id, _week_date, _model_id, _max_cost_usd)
  RETURNING id INTO created;
  RETURN created;
END;
$$;

CREATE FUNCTION public.finish_private_football_ai_fixture_refresh(
  _admission_id uuid, _user_id uuid, _ok boolean,
  _candidates integer, _verified integer, _error_code text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.private_football_ai_refresh_admissions SET
    status = CASE WHEN _ok THEN 'completed' ELSE 'failed' END,
    candidates_count = _candidates, verified_count = _verified,
    error_code = left(_error_code, 80), finished_at = now()
  WHERE id = _admission_id AND user_id = _user_id AND status = 'reserved';
  IF NOT FOUND THEN RAISE EXCEPTION 'AI fixture refresh is not reserved'; END IF;
END;
$$;

-- Widen (never narrow) the research-run constraints for the third source.
ALTER TABLE public.private_football_research_runs
  DROP CONSTRAINT private_football_research_runs_source_check;
ALTER TABLE public.private_football_research_runs
  ADD CONSTRAINT private_football_research_runs_source_check
  CHECK (source IN ('api-football','football-data','ai-search'));
ALTER TABLE public.private_football_research_runs
  DROP CONSTRAINT private_football_research_runs_league_id_check;
ALTER TABLE public.private_football_research_runs
  ADD CONSTRAINT private_football_research_runs_league_id_check
  CHECK (league_id IN ('IT-SA','EN-PL','ES-LL','FR-L1','DE-BL','GR-SL',
                       'NL-ED','PT-PL','BE-PL','CH-SL','UEFA-CL','UEFA-EL'));

-- AI-search analysis admission: fixture must be a verified AI fixture of the
-- same user with identical teams, league and kickoff. Then reuse v2 limits.
CREATE FUNCTION public.claim_private_football_ai_research_run(
  _user_id uuid, _request_key uuid, _fixture_id bigint, _model_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE
  f public.private_football_ai_fixtures;
  existing public.private_football_research_runs;
  created public.private_football_research_runs;
BEGIN
  IF NOT public._has_role_internal(_user_id, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;
  SELECT * INTO f FROM public.private_football_ai_fixtures
    WHERE fixture_id = _fixture_id AND user_id = _user_id;
  IF NOT FOUND OR f.verification_status <> 'verified' OR NOT f.kickoff_verified THEN
    RAISE EXCEPTION 'only verified AI fixtures can be analyzed';
  END IF;
  IF f.kickoff_utc <= now() OR length(_model_id) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'invalid football research input';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('football-research:' || _user_id::text, 0));
  SELECT * INTO existing FROM public.private_football_research_runs
    WHERE user_id = _user_id AND request_key = _request_key;
  IF FOUND THEN
    IF (existing.source, existing.fixture_id, existing.model_id)
       IS DISTINCT FROM ('ai-search', _fixture_id, _model_id) THEN
      RAISE EXCEPTION 'research request key reused with different payload';
    END IF;
    RETURN jsonb_build_object('status', existing.status, 'id', existing.id);
  END IF;
  IF (SELECT count(*) FROM public.private_football_research_runs
      WHERE user_id = _user_id AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'football research hourly limit reached';
  END IF;
  IF EXISTS (SELECT 1 FROM public.private_football_research_runs
             WHERE user_id = _user_id AND status = 'processing'
               AND created_at > now() - interval '15 minutes') THEN
    RAISE EXCEPTION 'football research already processing';
  END IF;
  INSERT INTO public.private_football_research_runs(
    user_id, request_key, fixture_id, league_id, home_team, away_team, kickoff_utc, model_id, source)
  VALUES (_user_id, _request_key, f.fixture_id, f.league_id, f.home_team, f.away_team,
          f.kickoff_utc, _model_id, 'ai-search')
  RETURNING * INTO created;
  RETURN jsonb_build_object('status','claimed','id',created.id,
    'league_id',f.league_id,'home_team',f.home_team,'away_team',f.away_team,
    'kickoff_utc',f.kickoff_utc);
END;
$$;

REVOKE ALL ON FUNCTION public.protect_private_football_ai_fixture() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_private_football_ai_fixture(uuid,text,text,text,text,timestamptz,boolean,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.private_football_ai_refresh_quota(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_private_football_ai_fixture_refresh(uuid,text,date,text,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_private_football_ai_fixture_refresh(uuid,uuid,boolean,integer,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_private_football_ai_research_run(uuid,uuid,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_private_football_ai_fixture(uuid,text,text,text,text,timestamptz,boolean,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.private_football_ai_refresh_quota(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_private_football_ai_fixture_refresh(uuid,text,date,text,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_private_football_ai_fixture_refresh(uuid,uuid,boolean,integer,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_private_football_ai_research_run(uuid,uuid,bigint,text) TO service_role;
COMMIT;
