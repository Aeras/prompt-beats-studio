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
ROLLBACK;
