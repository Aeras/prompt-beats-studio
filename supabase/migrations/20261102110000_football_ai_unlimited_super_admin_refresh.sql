-- Forward-only: Super Admin fixture discovery has no hourly/daily count cap.
-- Keep admission journal, advisory lock, active reservation guard and paid consent.
BEGIN;
CREATE OR REPLACE FUNCTION public.claim_private_football_ai_fixture_refresh(
  _user_id uuid, _league_id text, _week_date date, _model_id text, _max_cost_usd numeric
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE created uuid;
BEGIN
  IF NOT public._has_role_internal(_user_id, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;
  IF _league_id NOT IN ('IT-SA','EN-PL','ES-LL','FR-L1','DE-BL','GR-SL',
                        'NL-ED','PT-PL','BE-PL','CH-SL','UEFA-CL','UEFA-EL') THEN
    RAISE EXCEPTION 'unsupported competition';
  END IF;
  IF _max_cost_usd <= 0 OR _max_cost_usd > 1 OR _model_id IS NULL OR length(_model_id) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'invalid AI fixture request';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('football-ai-refresh:' || _user_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.private_football_ai_refresh_admissions
             WHERE user_id = _user_id AND status = 'reserved'
               AND admitted_at > now() - interval '10 minutes') THEN
    RAISE EXCEPTION 'AI fixture refresh already running';
  END IF;
  INSERT INTO public.private_football_ai_refresh_admissions(
    user_id, league_id, week_date, model_id, max_cost_usd)
  VALUES (_user_id, _league_id, _week_date, _model_id, _max_cost_usd)
  RETURNING id INTO created;
  RETURN created;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_private_football_ai_fixture_refresh(uuid,text,date,text,numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_private_football_ai_fixture_refresh(uuid,text,date,text,numeric)
  TO service_role;
COMMIT;
