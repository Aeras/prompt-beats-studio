-- Local replay only (AI Search BETA). Everything rolls back.
BEGIN;

CREATE FUNCTION pg_temp.assert(ok boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF; END $$;

SELECT pg_temp.assert(
  NOT has_table_privilege('anon','public.private_football_ai_fixtures','SELECT')
  AND NOT has_table_privilege('authenticated','public.private_football_ai_fixtures','SELECT')
  AND NOT has_table_privilege('authenticated','public.private_football_ai_refresh_admissions','INSERT')
  AND NOT has_function_privilege('authenticated',
    'public.upsert_private_football_ai_fixture(uuid,text,text,text,text,timestamptz,boolean,jsonb)','EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'public.claim_private_football_ai_fixture_refresh(uuid,text,date,text,numeric)','EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.claim_private_football_ai_research_run(uuid,uuid,bigint,text)','EXECUTE'),
  'Browser roles must have no access to AI fixture tables or RPCs');

INSERT INTO auth.users(id,email) VALUES
('fea70000-0000-4000-8000-0000000000a1','football-ai-admin@example.invalid'),
('fea70000-0000-4000-8000-0000000000a2','football-ai-user@example.invalid');
INSERT INTO public.user_roles(user_id,role,moderation_status) VALUES
('fea70000-0000-4000-8000-0000000000a1','super_admin','active'),
('fea70000-0000-4000-8000-0000000000a2','user','active')
ON CONFLICT (user_id) DO UPDATE SET role=excluded.role, moderation_status=excluded.moderation_status;

DO $$
DECLARE
  v uuid := 'fea70000-0000-4000-8000-0000000000a1';
  u uuid := 'fea70000-0000-4000-8000-0000000000a2';
  r jsonb;
  cand bigint;
  ver bigint;
  failed boolean;
  legacy_before text;
  i int;
  ev jsonb := '[{"url":"https://www.bbc.co.uk/a","domain":"bbc.co.uk"},{"url":"https://www.espn.com/b","domain":"espn.com"}]';
BEGIN
  -- legacy record snapshot must survive the widened constraints unchanged
  SELECT string_agg(id::text || status || source, ',' ORDER BY id) INTO legacy_before
    FROM public.private_football_research_runs;

  -- candidate then verified
  r := public.upsert_private_football_ai_fixture(v,'NL-ED','NL-ED:ajax:psv:2026-11-02','Ajax','PSV',
         now()+interval '3 days', false, '[]');
  PERFORM pg_temp.assert(r->>'status'='candidate' AND (r->>'fixture_id')::bigint > 0, 'bigint bridge id');
  cand := (r->>'fixture_id')::bigint;
  r := public.upsert_private_football_ai_fixture(v,'UEFA-CL','UEFA-CL:a:b:2026-11-02','Alpha','Beta',
         date_trunc('minute', now()+interval '4 days'), true, ev);
  PERFORM pg_temp.assert(r->>'status'='verified', 'verified with 2 sources');
  ver := (r->>'fixture_id')::bigint;

  -- verified requires >=2 evidence entries
  failed := false;
  BEGIN
    PERFORM public.upsert_private_football_ai_fixture(v,'EN-PL','EN-PL:x:y:2026-11-02','X1','Y1',
      now()+interval '2 days', true, '[{"url":"https://www.bbc.co.uk/a"}]');
  EXCEPTION WHEN others THEN failed := true; END;
  PERFORM pg_temp.assert(failed, 'single-source verification must fail');

  -- no downgrade, no edit of a verified fixture
  r := public.upsert_private_football_ai_fixture(v,'UEFA-CL','UEFA-CL:a:b:2026-11-02','Alpha','Beta',
         now()+interval '9 days', false, '[]');
  PERFORM pg_temp.assert(r->>'status'='unchanged_verified', 'upsert must not downgrade');
  failed := false;
  BEGIN
    UPDATE public.private_football_ai_fixtures SET verification_status='candidate' WHERE fixture_id=ver;
  EXCEPTION WHEN others THEN failed := true; END;
  PERFORM pg_temp.assert(failed, 'trigger blocks downgrade');
  failed := false;
  BEGIN
    UPDATE public.private_football_ai_fixtures SET kickoff_utc = kickoff_utc + interval '1 minute' WHERE fixture_id=ver;
  EXCEPTION WHEN others THEN failed := true; END;
  PERFORM pg_temp.assert(failed, 'trigger blocks kickoff edit');

  -- non super admin is refused
  failed := false;
  BEGIN
    PERFORM public.claim_private_football_ai_fixture_refresh(u,'EN-PL',current_date,'m',0.05);
  EXCEPTION WHEN others THEN failed := true; END;
  PERFORM pg_temp.assert(failed, 'refresh requires super admin');

  -- Super Admin refresh has no hourly/daily numeric cap; journal still records every request.
  FOR i IN 1..13 LOOP
    PERFORM public.finish_private_football_ai_fixture_refresh(
      public.claim_private_football_ai_fixture_refresh(v,'EN-PL',current_date,'m',0.05),
      v, true, 0, 0, NULL);
  END LOOP;
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.private_football_ai_refresh_admissions WHERE user_id=v)=13,
    'every unrestricted refresh still has a journal entry');

  -- An unfinished reservation still blocks parallel dispatch.
  PERFORM public.claim_private_football_ai_fixture_refresh(v,'EN-PL',current_date,'m',0.05);
  failed := false;
  BEGIN
    PERFORM public.claim_private_football_ai_fixture_refresh(v,'EN-PL',current_date,'m',0.05);
  EXCEPTION WHEN others THEN failed := SQLERRM LIKE '%already running%'; END;
  PERFORM pg_temp.assert(failed, 'concurrent refresh must still be rejected');

  -- analysis admission: only verified AI fixtures
  failed := false;
  BEGIN
    PERFORM public.claim_private_football_ai_research_run(v, gen_random_uuid(), cand, 'openai/test');
  EXCEPTION WHEN others THEN failed := true; END;
  PERFORM pg_temp.assert(failed, 'candidate fixtures cannot be analyzed');
  failed := false;
  BEGIN
    PERFORM public.claim_private_football_ai_research_run(u, gen_random_uuid(), ver, 'openai/test');
  EXCEPTION WHEN others THEN failed := true; END;
  PERFORM pg_temp.assert(failed, 'other users cannot analyze');
  r := public.claim_private_football_ai_research_run(v, 'fea70000-0000-4000-8000-0000000000b1', ver, 'openai/test');
  PERFORM pg_temp.assert(r->>'status'='claimed' AND r->>'home_team'='Alpha', 'verified fixture claims');
  PERFORM pg_temp.assert(EXISTS (SELECT 1 FROM public.private_football_research_runs
    WHERE id=(r->>'id')::uuid AND source='ai-search' AND league_id='UEFA-CL' AND fixture_id=ver), 'run snapshot');
  r := public.claim_private_football_ai_research_run(v, 'fea70000-0000-4000-8000-0000000000b1', ver, 'openai/test');
  PERFORM pg_temp.assert(r->>'status'='processing', 'idempotent request key');

  PERFORM pg_temp.assert(
    (SELECT string_agg(id::text || status || source, ',' ORDER BY id) FROM public.private_football_research_runs
      WHERE source <> 'ai-search') IS NOT DISTINCT FROM legacy_before,
    'existing Tavily+OpenRouter records unchanged');
END $$;

-- AI-discovered fixtures use the same uncapped analysis policy, without weakening verification.
DO $$
DECLARE v uuid := 'fea70000-0000-4000-8000-0000000000a1'; f bigint; r jsonb; i integer;
BEGIN
 SELECT fixture_id INTO f FROM public.private_football_ai_fixtures WHERE user_id=v AND verification_status='verified' AND kickoff_verified LIMIT 1;
 PERFORM pg_temp.assert(f IS NOT NULL,'Verified fixture must exist in isolated fixture');
 UPDATE public.private_football_research_runs SET status='failed',completed_at=now(),error_code='offline_test'
  WHERE user_id=v AND status='processing';
 FOR i IN 1..8 LOOP
  r := public.claim_private_football_ai_research_run(v,gen_random_uuid(),f,'offline/test');
  PERFORM pg_temp.assert(r->>'status'='claimed','AI fixture analysis must exceed five attempts/hour');
  UPDATE public.private_football_research_runs SET status='failed',completed_at=now(),error_code='offline_test' WHERE id=(r->>'id')::uuid;
 END LOOP;
END $$;

ROLLBACK;
