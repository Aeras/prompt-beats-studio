-- PB-AUD-014: disposable local-only privilege and rejected-write checks.
BEGIN;
DO $$
DECLARE
  v_blocked boolean := false;
  v_job uuid := '11111111-1111-4111-8111-111111111111';
  v_user uuid := '22222222-2222-4222-8222-222222222222';
  v_before bigint;
BEGIN
  IF has_function_privilege(
    'anon',
    'public.finalize_generation_revision_atomic(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,text,text,text,text,text,text,text,text,text,jsonb,integer)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.finalize_generation_revision_atomic(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,text,text,text,text,text,text,text,text,text,jsonb,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Atomic revision RPC exposed to client roles';
  END IF;
  IF NOT has_function_privilege(
    'service_role',
    'public.finalize_generation_revision_atomic(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,text,text,text,text,text,text,text,text,text,jsonb,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Atomic revision RPC missing service role access';
  END IF;

  SELECT count(*) INTO v_before FROM public.saved_prompts;
  BEGIN
    PERFORM public.finalize_generation_revision_atomic(
      v_job, v_user, NULL, v_job, 'test revision', '{}'::jsonb, '{}'::jsonb,
      'title', 'tags', 'lyrics', 'note', 'theme', 'genre', 'mood', 'Greek',
      'openai', 'test-model', '{}'::jsonb, 1
    );
  EXCEPTION WHEN OTHERS THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Missing/cancelled job accepted for revision'; END IF;
  IF (SELECT count(*) FROM public.saved_prompts) <> v_before THEN
    RAISE EXCEPTION 'Rejected revision changed saved prompt row count';
  END IF;
END;
$$;
-- Exercise a real project revision as well as the standalone race harness.
DO $$
<<fixture>>
DECLARE
  owner_id uuid := gen_random_uuid();
  project_id uuid := gen_random_uuid();
  parent_id uuid := gen_random_uuid();
  job_id uuid := gen_random_uuid();
  cancelled_job uuid := gen_random_uuid();
  result jsonb;
  blocked boolean := false;
BEGIN
  INSERT INTO auth.users(id,email) VALUES(owner_id,owner_id::text||'@example.invalid');
  INSERT INTO public.prompt_projects(id,user_id,name) VALUES(project_id,owner_id,'Atomic project fixture');
  INSERT INTO public.saved_prompts(id,user_id,project_id,version_number,title,tags,lyrics,note,custom_name)
  VALUES(parent_id,owner_id,project_id,1,'Parent','Pop','Original lyrics','Original note','Keep custom name');
  INSERT INTO public.ai_generation_jobs(id,user_id,idempotency_key,status,input_payload,cancel_requested_at)
  VALUES(job_id,owner_id,gen_random_uuid(),'processing','{}',NULL),
        (cancelled_job,owner_id,gen_random_uuid(),'processing','{}',now());
  result := public.finalize_generation_revision_atomic(
    job_id,owner_id,project_id,parent_id,'Revise lyrics','{}','{}',
    'Revision','Pop','Revised lyrics','Note','Theme','Pop','Warm','Greek',
    'openai','offline-fixture','{"title":"Revision"}',1);
  IF NOT EXISTS(SELECT 1 FROM public.saved_prompts p
    WHERE id=(result->'revisionMeta'->>'savedPromptId')::uuid
      AND p.project_id=fixture.project_id AND parent_prompt_id=parent_id AND version_number=2
      AND source_generation_job_id=job_id AND lyrics='Revised lyrics') THEN
    RAISE EXCEPTION 'Project revision history/identity not preserved';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.saved_prompts WHERE id=parent_id
      AND title='Parent' AND lyrics='Original lyrics' AND custom_name='Keep custom name') THEN
    RAISE EXCEPTION 'Project revision mutated the parent';
  END IF;
  BEGIN
    PERFORM public.finalize_generation_revision_atomic(
      cancelled_job,owner_id,project_id,parent_id,'Must not save','{}','{}',
      'Cancelled','Pop','Cancelled lyrics','Note','Theme','Pop','Warm','Greek',
      'openai','offline-fixture','{}',1);
  EXCEPTION WHEN raise_exception THEN blocked := true;
  END;
  IF NOT blocked OR (SELECT count(*) FROM public.saved_prompts p WHERE p.project_id=fixture.project_id)<>2 THEN
    RAISE EXCEPTION 'Cancelled project revision changed version history';
  END IF;
END;
$$;
ROLLBACK;
