-- Local replay only. All changes to users, roles and runs roll back.
BEGIN;

CREATE FUNCTION pg_temp.assert(ok boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF; END $$;

SELECT pg_temp.assert(
  NOT has_table_privilege('anon','public.private_football_research_runs','SELECT')
  AND NOT has_table_privilege('authenticated','public.private_football_research_runs','INSERT')
  AND NOT has_function_privilege(
    'authenticated',
    'public.claim_private_football_research_run(uuid,uuid,bigint,text,text,text,timestamptz,text)',
    'EXECUTE'
  ),
  'Browser roles must not access private football runs or claim RPC'
);

INSERT INTO auth.users(id,email) VALUES
('fea70000-0000-4000-8000-000000000001','football-admin@example.invalid'),
('fea70000-0000-4000-8000-000000000002','football-user@example.invalid');
INSERT INTO public.user_roles(user_id,role,moderation_status) VALUES
('fea70000-0000-4000-8000-000000000001','super_admin','active'),
('fea70000-0000-4000-8000-000000000002','user','active')
ON CONFLICT (user_id) DO UPDATE SET role=excluded.role, moderation_status=excluded.moderation_status;

DO $$
DECLARE
  v uuid := 'fea70000-0000-4000-8000-000000000001';
  k uuid := 'fea70000-0000-4000-8000-000000000099';
  claimed jsonb;
  duplicate jsonb;
  rejected boolean := false;
  v_run_id uuid;
BEGIN
  claimed := public.claim_private_football_research_run(
    v,k,222,'GR-SL','Home','Away',now()+interval '2 days','openai/test'
  );
  PERFORM pg_temp.assert(claimed->>'status'='claimed','First research must claim once');
  v_run_id := (claimed->>'id')::uuid;
  duplicate := public.claim_private_football_research_run(
    v,k,222,'GR-SL','Home','Away',now()+interval '2 days','openai/test'
  );
  PERFORM pg_temp.assert(duplicate->>'id'=v_run_id::text AND duplicate->>'status'='processing',
    'Duplicate key must not dispatch again');


  rejected := false;
  BEGIN
    PERFORM public.claim_private_football_research_run(
      v,k,223,'GR-SL','Home','Away',now()+interval '2 days','openai/test'
    );
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  PERFORM pg_temp.assert(rejected,'Same request key with altered fixture must fail');

  BEGIN
    PERFORM public.claim_private_football_research_run(
      'fea70000-0000-4000-8000-000000000002',
      gen_random_uuid(),333,'GR-SL','Home','Away',now()+interval '2 days','openai/test'
    );
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  PERFORM pg_temp.assert(rejected,'Non-super-admin claim must fail');

  UPDATE public.private_football_research_runs
  SET provider_started_at=now(), evidence_cutoff_at=now(),
      analysis='{"summary":"validated"}'::jsonb,
      sources='[]'::jsonb,
      completed_at=now(),status='completed'
  WHERE public.private_football_research_runs.id=v_run_id;
  PERFORM pg_temp.assert(
    (SELECT status='completed' FROM public.private_football_research_runs r WHERE r.id=v_run_id),
    'Completed snapshot must persist'
  );

  -- New provider-specific admission uses the exact same immutable identity key.
  DECLARE
    other_key uuid := gen_random_uuid();
    claimed_new jsonb;
  BEGIN
    claimed_new := public.claim_private_football_research_run_v2(
      v,other_key,998,'EN-PL','Alpha','Beta',now()+interval '2 days','openai/test','football-data'
    );
    PERFORM pg_temp.assert(claimed_new->>'status'='claimed','New provider must be claimable');
    rejected := false;
    BEGIN
      PERFORM public.claim_private_football_research_run_v2(
        v,other_key,998,'EN-PL','Alpha','Beta',now()+interval '2 days','openai/test','api-football'
      );
    EXCEPTION WHEN OTHERS THEN rejected := true; END;
    PERFORM pg_temp.assert(rejected,'A request key cannot change providers');
    rejected := false;
    BEGIN
      UPDATE public.private_football_research_runs SET source='api-football'
      WHERE id=(claimed_new->>'id')::uuid;
    EXCEPTION WHEN OTHERS THEN rejected := true; END;
    PERFORM pg_temp.assert(rejected,'Source must be immutable');
  END;


  rejected := false;
  BEGIN
    UPDATE public.private_football_research_runs SET analysis='{}'::jsonb WHERE public.private_football_research_runs.id=v_run_id;
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  PERFORM pg_temp.assert(rejected,'Completed prediction must be immutable');

  rejected := false;
  BEGIN
    INSERT INTO public.private_football_research_runs(
      user_id,request_key,fixture_id,league_id,home_team,away_team,kickoff_utc,
      model_id,status,analysis,provider_started_at,evidence_cutoff_at,completed_at
    ) VALUES (
      v,gen_random_uuid(),999,'GR-SL','Home','Away',now()-interval '1 hour',
      'openai/test','completed','{}'::jsonb,now()-interval '2 hours',now()-interval '2 hours',now()
    );
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  PERFORM pg_temp.assert(rejected,'Post-kickoff completed snapshot must not be admitted through claims');

  rejected := false;
  BEGIN
    PERFORM public.claim_private_football_research_run(
      v, gen_random_uuid(),333,'GR-SL','Home','Away',now()-interval '1 hour','openai/test'
    );
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  PERFORM pg_temp.assert(rejected,'Post-kickoff claim must fail');
END;
$$;

-- Explicitly exceed the removed hourly cap on both legacy/provider-specific paths.
DO $$
DECLARE v uuid := 'fea70000-0000-4000-8000-000000000003'; r jsonb; i integer; kind integer; blocked boolean;
BEGIN
 INSERT INTO auth.users(id,email) VALUES(v,'football-unlimited@example.invalid');
 INSERT INTO public.user_roles(user_id,role,moderation_status) VALUES(v,'super_admin','active') ON CONFLICT (user_id) DO UPDATE SET role=excluded.role,moderation_status=excluded.moderation_status;
 FOR kind IN 1..2 LOOP
  FOR i IN 1..8 LOOP
   IF kind=1 THEN
    r := public.claim_private_football_research_run(v,gen_random_uuid(),700+i,'IT-SA','Home','Away',now()+interval '2 days','offline/test');
   ELSE
    r := public.claim_private_football_research_run_v2(v,gen_random_uuid(),800+i,'IT-SA','Home','Away',now()+interval '2 days','offline/test','espn');
   END IF;
   PERFORM pg_temp.assert(r->>'status'='claimed','More than five completed/failed attempts per hour must be permitted');
   blocked := false;
   BEGIN
    PERFORM public.claim_private_football_research_run_v2(v,gen_random_uuid(),900+i,'IT-SA','Home','Away',now()+interval '2 days','offline/test','espn');
   EXCEPTION WHEN OTHERS THEN blocked := SQLERRM='football research already processing'; END;
   PERFORM pg_temp.assert(blocked,'In-flight concurrency exclusion must remain');
   UPDATE public.private_football_research_runs SET status='failed',completed_at=now(),error_code='offline_test'
    WHERE id=(r->>'id')::uuid;
  END LOOP;
 END LOOP;
 PERFORM pg_temp.assert((SELECT count(*)=16 FROM public.private_football_research_runs WHERE user_id=v),'All 16 serial attempts must be recorded');
END $$;

ROLLBACK;
