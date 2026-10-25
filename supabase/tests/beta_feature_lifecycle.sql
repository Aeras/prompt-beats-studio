-- Disposable replay database only; every fixture and policy edit rolls back.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
CREATE FUNCTION pg_temp.denied(sql text, expected text DEFAULT 'P0001') RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, received % for %',expected,actual,sql; END IF;
END $$;
CREATE TEMP TABLE old_policies AS SELECT * FROM public.feature_access_policies WHERE feature_key IN (
 'ai_generator','quality_check','song_analyzer','lyrics_workspace','lyrics_review','smart_presets',
 'song_setup_assistant','inspiration_wall','story_map','song_universe','export_center','track_uploads',
 'sharing_public_links','private_review_links','playlists','favorites','likes','follow_creators','notifications');
SELECT pg_temp.assert((SELECT count(*)=19 FROM old_policies),'Expected 19 existing policies');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.beta_features JOIN old_policies USING(feature_key)),'No legacy backfill');
INSERT INTO auth.users(id,email)
 SELECT ('bb000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'beta-'||n||'@example.invalid'
 FROM generate_series(1,8) n;
INSERT INTO public.user_roles(user_id,role,moderation_status)
 SELECT id,'user','active' FROM auth.users WHERE id::text LIKE 'bb000000%'
 ON CONFLICT (user_id) DO NOTHING;
UPDATE public.user_roles SET role=CASE user_id::text
 WHEN 'bb000000-0000-4000-8000-000000000003' THEN 'moderator'::public.app_role
 WHEN 'bb000000-0000-4000-8000-000000000004' THEN 'senior_moderator'::public.app_role
 WHEN 'bb000000-0000-4000-8000-000000000005' THEN 'admin'::public.app_role
 WHEN 'bb000000-0000-4000-8000-000000000006' THEN 'super_admin'::public.app_role
 ELSE role END WHERE user_id::text LIKE 'bb000000%';
SELECT public.register_beta_feature('beta_test_fixture','Fixture','Local only');
SELECT public.register_beta_feature('beta_test_fixture','Fixture','Local only');
SELECT pg_temp.denied($q$SELECT public.register_beta_feature('favorites','No','No')$q$);
SELECT pg_temp.denied($q$SELECT public.register_beta_feature('beta_test_fixture','Different','Local only')$q$);
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.beta_feature_events WHERE feature_key='beta_test_fixture'),'Idempotent registration');
DO $$ DECLARE role_name text; fn text; tab text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  FOREACH tab IN ARRAY ARRAY['beta_features','beta_testers','beta_feature_events'] LOOP
   IF has_table_privilege(role_name,'public.'||tab,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Direct table grant % %',role_name,tab; END IF;
  END LOOP;
  FOREACH fn IN ARRAY ARRAY['register_beta_feature(text,text,text)','beta_account_eligible(uuid)','beta_can_test(uuid)','assert_beta_super_admin()'] LOOP
   IF has_function_privilege(role_name,'public.'||fn,'EXECUTE') THEN RAISE EXCEPTION 'Private RPC grant % %',role_name,fn; END IF;
  END LOOP;
 END LOOP;
 FOREACH fn IN ARRAY ARRAY['beta_features_list()','beta_feature_transition(text,text,bigint,boolean)','beta_tester_detail(uuid)','beta_tester_set(uuid,boolean,boolean)','beta_feature_access_mutate(text,text,text,uuid)'] LOOP
  IF has_function_privilege('anon','public.'||fn,'EXECUTE') OR has_function_privilege('service_role','public.'||fn,'EXECUTE') OR NOT has_function_privilege('authenticated','public.'||fn,'EXECUTE') THEN RAISE EXCEPTION 'Wrong management ACL %',fn; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('public.beta_features'::regclass,'public.beta_testers'::regclass,'public.beta_feature_events'::regclass) AND NOT relrowsecurity) THEN RAISE EXCEPTION 'Missing RLS'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert(NOT public.current_user_can_use_feature('beta_test_fixture'),'Ordinary Beta denied');
SELECT pg_temp.assert(NOT public.current_user_can_use_feature('unregistered_feature'),'Unknown denied');
SELECT pg_temp.denied('SELECT public.beta_features_list()');
SELECT pg_temp.denied($q$SELECT public.beta_feature_transition('beta_test_fixture','stable',0)$q$);
SELECT pg_temp.denied($q$SELECT public.beta_tester_set(auth.uid(),true,false)$q$);
SELECT pg_temp.denied('SELECT * FROM public.beta_features','42501');
SELECT pg_temp.denied($q$SELECT public.register_beta_feature('malicious','M','M')$q$,'42501');
RESET ROLE;
DO $$ DECLARE n integer; BEGIN
 FOR n IN 3..6 LOOP
  PERFORM set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-'||lpad(n::text,12,'0'),true);
  PERFORM pg_temp.assert(public.current_user_can_use_feature('beta_test_fixture'),'Active staff Beta');
  IF n<6 THEN PERFORM pg_temp.denied('SELECT public.beta_features_list()'); END IF;
 END LOOP;
END $$;
SELECT set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000006',true);
SET LOCAL ROLE authenticated;
SELECT public.beta_tester_set('bb000000-0000-4000-8000-000000000001',true,false);
SELECT public.beta_tester_set('bb000000-0000-4000-8000-000000000001',true,false);
SELECT pg_temp.assert((public.beta_tester_detail('bb000000-0000-4000-8000-000000000001')->>'enabled')::boolean,'Independent entitlement visible');
RESET ROLE;
SELECT pg_temp.assert((SELECT role='user' FROM public.user_roles WHERE user_id='bb000000-0000-4000-8000-000000000001'),'No role escalation');
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.beta_feature_events WHERE action='tester_grant'),'Grant retry no double audit');
SELECT set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert(public.current_user_can_use_feature('beta_test_fixture'),'Selected ordinary access');
SELECT pg_temp.denied('SELECT public.beta_features_list()');
RESET ROLE;
-- Bans and suspensions override both explicit entitlement and staff status.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000076',true);
SELECT public.admin_set_user_banned('bb000000-0000-4000-8000-000000000001',true,'security_concern');
SELECT set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert(NOT public.current_user_can_use_feature('beta_test_fixture'),'Ban beats entitlement');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000076',true);
SELECT public.admin_set_user_banned('bb000000-0000-4000-8000-000000000001',false,'security_concern');
UPDATE public.user_roles SET moderation_status='suspended' WHERE user_id='bb000000-0000-4000-8000-000000000003';
SELECT set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert(NOT public.current_user_can_use_feature('beta_test_fixture'),'Suspended staff denied');
UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='bb000000-0000-4000-8000-000000000005';
SELECT set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000005',true);
SELECT pg_temp.assert(NOT public.current_user_can_use_feature('beta_test_fixture'),'Auth ban denied');
UPDATE auth.users SET deleted_at=now() WHERE id='bb000000-0000-4000-8000-000000000004';
SELECT set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000004',true);
SELECT pg_temp.assert(NOT public.current_user_can_use_feature('beta_test_fixture'),'Deleted staff denied');
SELECT set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000006',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT public.beta_tester_set('bb000000-0000-4000-8000-000000000003',true,false)$q$);
SELECT public.beta_tester_set('bb000000-0000-4000-8000-000000000001',false,true);
SELECT pg_temp.denied($q$SELECT public.beta_feature_transition('beta_test_fixture','archive',0)$q$);
SELECT pg_temp.denied($q$SELECT public.beta_feature_transition('beta_test_fixture','promote',0,true)$q$);
SELECT public.beta_feature_transition('beta_test_fixture','stable',0);
SELECT public.beta_feature_transition('beta_test_fixture','stable',0);
SELECT pg_temp.denied($q$SELECT public.beta_feature_transition('beta_test_fixture','beta',0)$q$,'PT409');
SELECT public.beta_feature_transition('beta_test_fixture','archive',1);
SELECT pg_temp.denied($q$SELECT public.beta_feature_transition('beta_test_fixture','beta',2)$q$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert(public.current_user_can_use_feature('beta_test_fixture'),'Archive preserves Stable availability');
DELETE FROM public.profile_private WHERE user_id='bb000000-0000-4000-8000-000000000008';
SELECT set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000008',true);
SELECT pg_temp.assert(NOT public.current_user_can_use_feature('beta_test_fixture'),'Missing profile denied even for Stable archive');
SELECT set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000006',true);
SET LOCAL ROLE authenticated;
SELECT public.beta_feature_transition('beta_test_fixture','restore',2);
SELECT public.beta_feature_transition('beta_test_fixture','beta',3);
SELECT public.beta_feature_transition('beta_test_fixture','stable',4);
SELECT pg_temp.denied($q$SELECT public.beta_feature_transition('beta_test_fixture','promote',5,false)$q$);
SELECT public.beta_feature_transition('beta_test_fixture','promote',5,true);
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.beta_features_list()->'features') f WHERE f->>'feature_key'='beta_test_fixture'),'Promoted feature not duplicated');
SELECT public.feature_access_set_policy('beta_test_fixture','disabled');
SELECT public.beta_feature_transition('beta_test_fixture','promote',5,true);
SELECT public.feature_access_set_policy('beta_test_fixture','selected_users');
SELECT pg_temp.assert(public.feature_access_add_user('beta_test_fixture','bb000000-0000-4000-8000-000000000002'),'Promoted feature target-specific grant');
SELECT pg_temp.assert(NOT public.feature_access_add_user('beta_test_fixture','bb000000-0000-4000-8000-000000000002'),'Duplicate selected user no-op');
SELECT pg_temp.denied($q$SELECT public.beta_feature_transition('beta_test_fixture','beta',6)$q$);
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.feature_access_policies WHERE feature_key='beta_test_fixture'),'One promoted policy');
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.beta_feature_events WHERE action='promote'),'One promotion event');
SELECT set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert(public.current_user_can_use_feature('beta_test_fixture'),'Promoted selected policy effective');
SELECT set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert(NOT public.current_user_can_use_feature('beta_test_fixture'),'Promoted nonselected denied');
SELECT set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000006',true);
SELECT public.feature_access_remove_user('beta_test_fixture','bb000000-0000-4000-8000-000000000002');
SELECT public.feature_access_set_policy('beta_test_fixture','everyone');
-- Lost-ACK promotion retry must never undo a later policy restriction.
SELECT public.feature_access_set_policy('beta_test_fixture','disabled');
SELECT public.beta_feature_transition('beta_test_fixture','promote',5,true);
SELECT pg_temp.assert((SELECT access_mode='disabled' FROM public.feature_access_policies WHERE feature_key='beta_test_fixture'),'Retry cannot reset policy');
SELECT pg_temp.assert(NOT EXISTS((SELECT * FROM old_policies EXCEPT SELECT * FROM public.feature_access_policies)),'All legacy metadata/policies byte-equivalent');
-- Exhaustive legacy algorithm comparison: no lifecycle semantics for old keys.
DO $$ DECLARE mode text; k text; n integer; uid uuid; expected boolean; BEGIN
 FOREACH mode IN ARRAY ARRAY['everyone','disabled','admins_only','selected_users'] LOOP
  UPDATE public.feature_access_policies SET access_mode=mode WHERE feature_key IN (SELECT feature_key FROM old_policies);
  INSERT INTO public.feature_access_users(feature_key,user_id,created_by)
   SELECT feature_key,'bb000000-0000-4000-8000-000000000002'::uuid,'bb000000-0000-4000-8000-000000000006'::uuid FROM old_policies ON CONFLICT DO NOTHING;
  FOR n IN 1..8 LOOP
   uid:=('bb000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
   PERFORM set_config('request.jwt.claim.sub',uid::text,true);
   expected:=public.has_valid_account_state(uid) AND CASE mode
    WHEN 'everyone' THEN true WHEN 'disabled' THEN false WHEN 'admins_only' THEN public._is_admin_level_internal(uid)
    ELSE n=2 END;
   FOR k IN SELECT feature_key FROM old_policies LOOP
    PERFORM pg_temp.assert(public.current_user_can_use_feature(k)=expected,'Legacy policy algorithm changed: '||k||' '||mode||' '||n);
   END LOOP;
  END LOOP;
 END LOOP;
END $$;
SELECT set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000006',true);
-- New management rejects a banned Super Admin even with an old JWT.
UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id='bb000000-0000-4000-8000-000000000006';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied('SELECT public.beta_features_list()');
SELECT pg_temp.denied($q$SELECT public.feature_access_set_policy('beta_test_fixture','everyone')$q$);
RESET ROLE;
ROLLBACK;
