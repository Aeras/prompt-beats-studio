-- Disposable replay database only. No provider call or production mutation.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', message; END IF;
END;
$$;

SELECT pg_temp.assert(
  NOT has_table_privilege('anon','public.generator_creative_direction_history','SELECT')
  AND NOT has_table_privilege('authenticated','public.generator_creative_direction_history','SELECT'),
  'history rows are not directly readable by clients'
);
SELECT pg_temp.assert(
  NOT has_function_privilege('authenticated','public.read_generator_creative_direction_history(uuid,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.read_generator_creative_direction_history(uuid,jsonb)','EXECUTE'),
  'history reader is service-role only'
);
SELECT pg_temp.assert(
  NOT has_function_privilege('authenticated','public.complete_generation_with_creative_direction_history(uuid,uuid,jsonb,jsonb,text,text,integer)','EXECUTE')
  AND has_function_privilege('service_role','public.complete_generation_with_creative_direction_history(uuid,uuid,jsonb,jsonb,text,text,integer)','EXECUTE'),
  'atomic completion is service-role only'
);
SELECT pg_temp.assert(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.generator_creative_direction_history'::regclass),
  'history table has RLS enabled'
);

DO $$
DECLARE
  v_owner uuid := 'cd510000-0000-4000-8000-000000000001';
  v_other uuid := 'cd510000-0000-4000-8000-000000000002';
  v_project uuid := 'cd520000-0000-4000-8000-000000000001';
  v_project_two uuid := 'cd520000-0000-4000-8000-000000000002';
  v_universe uuid := 'cd530000-0000-4000-8000-000000000001';
  v_universe_two uuid := 'cd530000-0000-4000-8000-000000000002';
  v_session uuid := 'cd540000-0000-4000-8000-000000000001';
  v_session_two uuid := 'cd540000-0000-4000-8000-000000000002';
  v_job uuid := 'cd550000-0000-4000-8000-000000000001';
  v_cancelled uuid := 'cd550000-0000-4000-8000-000000000002';
  v_session_job uuid := 'cd550000-0000-4000-8000-000000000003';
  v_failed uuid := 'cd550000-0000-4000-8000-000000000004';
  v_linked_project_only uuid := 'cd550000-0000-4000-8000-000000000005';
  v_project_two_job uuid := 'cd550000-0000-4000-8000-000000000006';
  v_session_two_job uuid := 'cd550000-0000-4000-8000-000000000007';
  v_job_id uuid;
  v_result jsonb := '{"title":"Song","tags":"Indie","lyrics":"Full lyrics stay in the job result only","note":"Production note"}'::jsonb;
  v_direction jsonb := '{"coreIdea":"A traveler learning to leave a familiar city","narrator":"First person, reflective","emotionalApproach":"Hope held beside grief","hookIdentity":"A rising phrase about the open road","sonicIdentity":"Warm folk guitar with restrained percussion"}'::jsonb;
  v_history jsonb;
  v_blocked boolean;
  i integer;
BEGIN
  INSERT INTO auth.users(id,email) VALUES
    (v_owner,v_owner::text||'@example.invalid'),
    (v_other,v_other::text||'@example.invalid');
  INSERT INTO public.user_roles(user_id,role,moderation_status)
    VALUES(v_owner,'super_admin','active');
  INSERT INTO public.profile_private(user_id,is_banned)
    VALUES(v_owner,false),(v_other,false) ON CONFLICT(user_id) DO UPDATE SET is_banned=false;
  INSERT INTO public.prompt_projects(id,user_id,name) VALUES
    (v_project,v_owner,'Direction history project'),
    (v_project_two,v_owner,'Separate direction history project');
  INSERT INTO public.song_universes(id,owner_id,title) VALUES
    (v_universe,v_owner,'Direction history universe'),
    (v_universe_two,v_owner,'Separate direction history universe');
  INSERT INTO public.song_universe_projects(universe_id,project_id) VALUES
    (v_universe,v_project),
    (v_universe_two,v_project_two);

  v_blocked := false;
  BEGIN
    INSERT INTO public.ai_generation_jobs(id,user_id,idempotency_key,status,input_payload)
    VALUES(v_linked_project_only,v_owner,gen_random_uuid(),'processing',jsonb_build_object(
      'operation','generate','inputSnapshot',jsonb_build_object('generatorMode','advanced'),
      'creativeDirectionHistory',jsonb_build_object('version',1,'scopes',jsonb_build_array(
        jsonb_build_object('type','project','id',v_project::text)))));
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'linked Project scope bypassed the required Song Universe scope';
  END IF;

  v_blocked := false;
  BEGIN
    INSERT INTO public.ai_generation_jobs(user_id,idempotency_key,status,input_payload)
    VALUES(v_other,gen_random_uuid(),'processing',jsonb_build_object(
      'operation','generate','inputSnapshot',jsonb_build_object('generatorMode','advanced'),
      'creativeDirectionHistory',jsonb_build_object('version',1,'scopes',jsonb_build_array(
        jsonb_build_object('type','session','id',v_session::text)))));
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'ordinary account bypassed Super Admin history guard'; END IF;

  INSERT INTO public.ai_generation_jobs(id,user_id,idempotency_key,status,input_payload)
  VALUES(v_job,v_owner,gen_random_uuid(),'processing',jsonb_build_object(
    'operation','generate','inputSnapshot',jsonb_build_object('generatorMode','advanced'),
    'creativeDirectionHistory',jsonb_build_object('version',1,'scopes',jsonb_build_array(
      jsonb_build_object('type','project','id',v_project::text),
      jsonb_build_object('type','song_universe','id',v_universe::text)))));

  v_history := public.read_generator_creative_direction_history(v_owner,
    jsonb_build_array(jsonb_build_object('type','project','id',v_project::text),
      jsonb_build_object('type','song_universe','id',v_universe::text)));
  IF v_history <> '[]'::jsonb THEN RAISE EXCEPTION 'new scope should have empty history'; END IF;

  IF public.complete_generation_with_creative_direction_history(
    v_job,v_owner,v_result,v_direction,'openai','offline-test',1) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'successful job did not atomically complete';
  END IF;
  IF (SELECT result FROM public.ai_generation_jobs WHERE id=v_job) <> v_result THEN
    RAISE EXCEPTION 'internal metadata leaked into the four-field result';
  END IF;
  IF (SELECT count(*) FROM public.generator_creative_direction_history WHERE job_id=v_job) <> 2 THEN
    RAISE EXCEPTION 'project and universe scopes were not both retained';
  END IF;
  IF jsonb_array_length(public.read_generator_creative_direction_history(v_owner,
       jsonb_build_array(jsonb_build_object('type','project','id',v_project::text)))) <> 1
     OR jsonb_array_length(public.read_generator_creative_direction_history(v_owner,
       jsonb_build_array(jsonb_build_object('type','song_universe','id',v_universe::text)))) <> 1 THEN
    RAISE EXCEPTION 'the linked Project and Song Universe did not receive their shared direction';
  END IF;

  INSERT INTO public.ai_generation_jobs(id,user_id,idempotency_key,status,input_payload)
  VALUES(v_project_two_job,v_owner,gen_random_uuid(),'processing',jsonb_build_object(
    'operation','generate','inputSnapshot',jsonb_build_object('generatorMode','advanced'),
    'creativeDirectionHistory',jsonb_build_object('version',1,'scopes',jsonb_build_array(
      jsonb_build_object('type','project','id',v_project_two::text),
      jsonb_build_object('type','song_universe','id',v_universe_two::text)))));
  PERFORM public.complete_generation_with_creative_direction_history(
    v_project_two_job,v_owner,v_result,
    jsonb_set(v_direction,'{coreIdea}',to_jsonb('A separate universe begins at sea'::text),true),
    'openai','offline-test',1);
  IF jsonb_array_length(public.read_generator_creative_direction_history(v_owner,
       jsonb_build_array(jsonb_build_object('type','project','id',v_project_two::text)))) <> 1
     OR jsonb_array_length(public.read_generator_creative_direction_history(v_owner,
       jsonb_build_array(jsonb_build_object('type','song_universe','id',v_universe_two::text)))) <> 1
     OR jsonb_array_length(public.read_generator_creative_direction_history(v_owner,
       jsonb_build_array(jsonb_build_object('type','project','id',v_project::text)))) <> 1
     OR jsonb_array_length(public.read_generator_creative_direction_history(v_owner,
       jsonb_build_array(jsonb_build_object('type','song_universe','id',v_universe::text)))) <> 1 THEN
    RAISE EXCEPTION 'separate Project or Song Universe histories crossed scopes';
  END IF;
  IF public.complete_generation_with_creative_direction_history(
    v_job,v_owner,v_result,v_direction,'openai','offline-test',1) IS DISTINCT FROM true
     OR (SELECT count(*) FROM public.generator_creative_direction_history WHERE job_id=v_job) <> 2 THEN
    RAISE EXCEPTION 'retry duplicated history rows';
  END IF;

  INSERT INTO public.ai_generation_jobs(id,user_id,idempotency_key,status,cancel_requested_at,input_payload)
  VALUES(v_cancelled,v_owner,gen_random_uuid(),'processing',now(),jsonb_build_object(
    'operation','generate','inputSnapshot',jsonb_build_object('generatorMode','advanced'),
    'creativeDirectionHistory',jsonb_build_object('version',1,'scopes',jsonb_build_array(
      jsonb_build_object('type','project','id',v_project::text),
      jsonb_build_object('type','song_universe','id',v_universe::text)))));
  v_blocked := false;
  BEGIN
    PERFORM public.complete_generation_with_creative_direction_history(
      v_cancelled,v_owner,v_result,v_direction,'openai','offline-test',1);
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked OR EXISTS(SELECT 1 FROM public.generator_creative_direction_history WHERE job_id=v_cancelled) THEN
    RAISE EXCEPTION 'cancelled generation wrote history';
  END IF;

  INSERT INTO public.ai_generation_jobs(id,user_id,idempotency_key,status,input_payload)
  VALUES(v_failed,v_owner,gen_random_uuid(),'failed',jsonb_build_object(
    'operation','generate','inputSnapshot',jsonb_build_object('generatorMode','advanced'),
    'creativeDirectionHistory',jsonb_build_object('version',1,'scopes',jsonb_build_array(
      jsonb_build_object('type','project','id',v_project::text),
      jsonb_build_object('type','song_universe','id',v_universe::text)))));
  v_blocked := false;
  BEGIN
    PERFORM public.complete_generation_with_creative_direction_history(
      v_failed,v_owner,v_result,v_direction,'openai','offline-test',1);
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked OR EXISTS(SELECT 1 FROM public.generator_creative_direction_history WHERE job_id=v_failed) THEN
    RAISE EXCEPTION 'failed generation wrote history';
  END IF;

  INSERT INTO public.ai_generation_jobs(id,user_id,idempotency_key,status,input_payload)
  VALUES(v_session_job,v_owner,gen_random_uuid(),'processing',jsonb_build_object(
    'operation','generate','inputSnapshot',jsonb_build_object('generatorMode','advanced'),
    'creativeDirectionHistory',jsonb_build_object('version',1,'scopes',jsonb_build_array(
      jsonb_build_object('type','session','id',v_session::text)))));
  PERFORM public.complete_generation_with_creative_direction_history(
    v_session_job,v_owner,v_result,v_direction,'openai','offline-test',1);
  INSERT INTO public.ai_generation_jobs(id,user_id,idempotency_key,status,input_payload)
  VALUES(v_session_two_job,v_owner,gen_random_uuid(),'processing',jsonb_build_object(
    'operation','generate','inputSnapshot',jsonb_build_object('generatorMode','advanced'),
    'creativeDirectionHistory',jsonb_build_object('version',1,'scopes',jsonb_build_array(
      jsonb_build_object('type','session','id',v_session_two::text)))));
  PERFORM public.complete_generation_with_creative_direction_history(
    v_session_two_job,v_owner,v_result,
    jsonb_set(v_direction,'{coreIdea}',to_jsonb('A different independent session'::text),true),
    'openai','offline-test',1);
  IF jsonb_array_length(public.read_generator_creative_direction_history(v_owner,
       jsonb_build_array(jsonb_build_object('type','session','id',v_session::text)))) <> 1
     OR jsonb_array_length(public.read_generator_creative_direction_history(v_owner,
       jsonb_build_array(jsonb_build_object('type','session','id',v_session_two::text)))) <> 1
     OR jsonb_array_length(public.read_generator_creative_direction_history(v_owner,
       jsonb_build_array(jsonb_build_object('type','project','id',v_project::text)))) <> 1 THEN
    RAISE EXCEPTION 'independent sessions or Project history crossed scopes';
  END IF;

  FOR i IN 1..16 LOOP
    v_job_id := gen_random_uuid();
    INSERT INTO public.ai_generation_jobs(id,user_id,idempotency_key,status,input_payload)
    VALUES(v_job_id,v_owner,gen_random_uuid(),'processing',jsonb_build_object(
      'operation','generate','inputSnapshot',jsonb_build_object('generatorMode','advanced'),
      'creativeDirectionHistory',jsonb_build_object('version',1,'scopes',jsonb_build_array(
        jsonb_build_object('type','project','id',v_project::text),
        jsonb_build_object('type','song_universe','id',v_universe::text)))));
    PERFORM public.complete_generation_with_creative_direction_history(
      v_job_id,v_owner,v_result,
      jsonb_set(v_direction,'{coreIdea}',to_jsonb('Project direction '||i),true),
      'openai','offline-test',1);
  END LOOP;
  IF (SELECT count(*) FROM public.generator_creative_direction_history
      WHERE user_id=v_owner AND scope_type='project' AND scope_id=v_project) <> 15 THEN
    RAISE EXCEPTION 'project history retention is not exactly bounded at 15';
  END IF;
  IF jsonb_array_length(public.read_generator_creative_direction_history(v_owner,
       jsonb_build_array(jsonb_build_object('type','project','id',v_project::text)))) <> 15 THEN
    RAISE EXCEPTION 'history reader did not return at most 15 entries';
  END IF;
  IF public.complete_generation_with_creative_direction_history(
       v_job,v_owner,v_result,v_direction,'openai','offline-test',1) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'an aged-out duplicate completion was not an idempotent success';
  END IF;

  DELETE FROM public.prompt_projects WHERE id = v_project;
  IF EXISTS(SELECT 1 FROM public.generator_creative_direction_history
      WHERE user_id=v_owner AND scope_type='project' AND scope_id=v_project) THEN
    RAISE EXCEPTION 'deleting a project retained its private direction history';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.generator_creative_direction_history
      WHERE user_id=v_owner AND scope_type='song_universe' AND scope_id=v_universe) THEN
    RAISE EXCEPTION 'deleting the linked project erased independent universe history';
  END IF;
END;
$$;

SELECT 'PASS: Super Admin guard, linked Project+Universe canonicality, RLS, Project/Universe/Session isolation, four-field result, cancellation, idempotency and 15-entry retention' AS verification;
ROLLBACK;
