-- Private Super-Admin football research: isolated, idempotent, immutable snapshots.
-- Forward-only schema. Must not be applied to production before explicit release approval.
BEGIN;

CREATE TABLE public.private_football_research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  source text NOT NULL DEFAULT 'api-football' CHECK (source = 'api-football'),
  fixture_id bigint NOT NULL CHECK (fixture_id > 0),
  league_id text NOT NULL CHECK (league_id IN ('GR-SL','EN-PL','ES-LL','IT-SA','DE-BL','FR-L1')),
  home_team text NOT NULL CHECK (length(home_team) BETWEEN 1 AND 200),
  away_team text NOT NULL CHECK (length(away_team) BETWEEN 1 AND 200),
  kickoff_utc timestamptz NOT NULL,
  model_id text NOT NULL CHECK (length(model_id) BETWEEN 1 AND 240),
  created_at timestamptz NOT NULL DEFAULT now(),
  provider_started_at timestamptz,
  evidence_cutoff_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  analysis jsonb,
  sources jsonb,
  usage jsonb,
  error_code text,
  UNIQUE (user_id, request_key)
);

CREATE INDEX private_football_research_runs_user_time
  ON public.private_football_research_runs(user_id, created_at DESC);

ALTER TABLE public.private_football_research_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_football_research_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.private_football_research_runs TO service_role;

-- Server-only claim, serializes admission per user to prevent concurrent charges.
CREATE FUNCTION public.claim_private_football_research_run(
  _user_id uuid,
  _request_key uuid,
  _fixture_id bigint,
  _league_id text,
  _home_team text,
  _away_team text,
  _kickoff_utc timestamptz,
  _model_id text
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
  IF _kickoff_utc <= now() OR _fixture_id <= 0
     OR _league_id NOT IN ('GR-SL','EN-PL','ES-LL','IT-SA','DE-BL','FR-L1')
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
    kickoff_utc, model_id
  ) VALUES (
    _user_id, _request_key, _fixture_id, _league_id, _home_team, _away_team,
    _kickoff_utc, _model_id
  ) RETURNING * INTO created;
  RETURN jsonb_build_object('status', 'claimed', 'id', created.id);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_private_football_research_run(
  uuid,uuid,bigint,text,text,text,timestamptz,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_private_football_research_run(
  uuid,uuid,bigint,text,text,text,timestamptz,text
) TO service_role;

CREATE FUNCTION public.protect_private_football_research_snapshots()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.status IN ('completed','failed') THEN
    RAISE EXCEPTION 'terminal football research snapshots are immutable';
  END IF;
  IF (OLD.user_id,OLD.request_key,OLD.fixture_id,OLD.league_id,OLD.home_team,OLD.away_team,OLD.kickoff_utc,OLD.model_id,OLD.created_at)
     IS DISTINCT FROM
     (NEW.user_id,NEW.request_key,NEW.fixture_id,NEW.league_id,NEW.home_team,NEW.away_team,NEW.kickoff_utc,NEW.model_id,NEW.created_at)
  THEN
    RAISE EXCEPTION 'football research identity is immutable';
  END IF;
  IF NEW.status = 'completed' AND (NEW.analysis IS NULL OR NEW.completed_at IS NULL OR NEW.provider_started_at IS NULL) THEN
    RAISE EXCEPTION 'incomplete football research snapshot';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_private_football_research_snapshots_trigger
  BEFORE UPDATE ON public.private_football_research_runs
  FOR EACH ROW EXECUTE FUNCTION public.protect_private_football_research_snapshots();

COMMIT;
