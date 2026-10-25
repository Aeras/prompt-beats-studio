-- Disposable local database only. Every fixture is rolled back.
BEGIN;
DO $$
DECLARE
  v_owner uuid := 'e0000000-0000-4000-8000-000000000021';
  v_track uuid := 'e1000000-0000-4000-8000-000000000021';
  v_session uuid := 'e2000000-0000-4000-8000-000000000021';
  v_other uuid := 'e3000000-0000-4000-8000-000000000021';
  v_token text := repeat('c',64);
  v_other_token text := repeat('d',64);
  v_result jsonb;
  v_key text;
  v_i integer;
  v_n integer;
  v_role text;
  v_signature text;
BEGIN
  FOR v_role IN SELECT unnest(ARRAY['anon','authenticated']) LOOP
    FOREACH v_signature IN ARRAY ARRAY[
      'public.admit_contact_request_v2(text,text,uuid)',
      'public.admit_contact_request(text,text)',
      'public.join_private_review_session(text,text,text)',
      'public.admit_private_review_join(text,text)',
      'public.record_private_review_pin_failure(text,text)'
    ] LOOP
      IF has_function_privilege(v_role,v_signature,'EXECUTE') THEN RAISE EXCEPTION 'client RPC exposure: % %',v_role,v_signature; END IF;
      IF NOT has_function_privilege('service_role',v_signature,'EXECUTE') THEN RAISE EXCEPTION 'missing service RPC %',v_signature; END IF;
    END LOOP;
    IF has_table_privilege(v_role,'public.contact_admission_receipts','SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege(v_role,'public.private_review_session_admissions','SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'admission table exposed to client role';
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('public.contact_admission_receipts'::regclass,'public.private_review_session_admissions'::regclass) AND NOT relrowsecurity) THEN
    RAISE EXCEPTION 'admission RLS disabled';
  END IF;
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(v_owner,'pb021@example.invalid',now());
  UPDATE public.profile_private SET is_banned=false WHERE user_id=v_owner;

  -- Same normalized email remains three/30m even across different actors/pools.
  FOR v_i IN 1..3 LOOP
    IF NOT public.admit_contact_request_v2(repeat('a',64),lpad(v_i::text,64,'0'),NULL) THEN RAISE EXCEPTION 'normal contact blocked'; END IF;
  END LOOP;
  IF public.admit_contact_request_v2(repeat('a',64),repeat('b',64),v_owner) THEN RAISE EXCEPTION 'email rotation through account pool bypassed email limit'; END IF;
  IF public.admit_contact_request_v2(repeat('b',64),lpad('1',64,'0'),NULL) THEN RAISE EXCEPTION 'receipt replay accepted'; END IF;
  IF public.admit_contact_request_v2(NULL,repeat('b',64),NULL) THEN RAISE EXCEPTION 'null fingerprint accepted'; END IF;
  IF public.admit_contact_request(repeat('a',64),repeat('f',64)) THEN RAISE EXCEPTION 'legacy Contact bypass'; END IF;
  -- Rotating email / new challenge still has a finite guest admission budget.
  FOR v_i IN 4..120 LOOP
    IF NOT public.admit_contact_request_v2(encode(extensions.digest('email'||v_i,'sha256'),'hex'),encode(extensions.digest('nonce'||v_i,'sha256'),'hex'),NULL) THEN
      RAISE EXCEPTION 'guest pool exhausted prematurely at %',v_i;
    END IF;
  END LOOP;
  IF public.admit_contact_request_v2(repeat('e',64),repeat('f',64),NULL) THEN RAISE EXCEPTION 'email rotation bypassed guest pool'; END IF;
  -- Independent confirmed-account capacity remains available despite guest flood.
  IF NOT public.admit_contact_request_v2(repeat('e',64),repeat('f',64),v_owner) THEN RAISE EXCEPTION 'guest flood consumed account capacity'; END IF;
  FOR v_i IN 2..10 LOOP
    IF NOT public.admit_contact_request_v2(encode(extensions.digest('account-email'||v_i,'sha256'),'hex'),encode(extensions.digest('account-nonce'||v_i,'sha256'),'hex'),v_owner) THEN RAISE EXCEPTION 'normal account admission failed'; END IF;
  END LOOP;
  IF public.admit_contact_request_v2(repeat('9',64),repeat('8',64),v_owner) THEN RAISE EXCEPTION 'account email rotation bypass'; END IF;
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('e7000000-0000-4000-8000-000000000021','other-pb021@example.invalid',now());
  UPDATE public.profile_private SET is_banned=false WHERE user_id='e7000000-0000-4000-8000-000000000021';
  IF NOT public.admit_contact_request_v2(repeat('9',64),repeat('8',64),'e7000000-0000-4000-8000-000000000021') THEN RAISE EXCEPTION 'one account denied another account'; END IF;
  INSERT INTO auth.users(id,email) VALUES('e8000000-0000-4000-8000-000000000021','unconfirmed-pb021@example.invalid');
  IF public.admit_contact_request_v2(repeat('9',64),repeat('4',64),'e8000000-0000-4000-8000-000000000021') THEN RAISE EXCEPTION 'unconfirmed account got protected capacity'; END IF;
  UPDATE auth.users SET email_confirmed_at=now(),is_anonymous=true WHERE id='e8000000-0000-4000-8000-000000000021';
  IF public.admit_contact_request_v2(repeat('9',64),repeat('4',64),'e8000000-0000-4000-8000-000000000021') THEN RAISE EXCEPTION 'anonymous auth got protected capacity'; END IF;
  UPDATE auth.users SET is_anonymous=false WHERE id='e8000000-0000-4000-8000-000000000021';
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000076',true);
  PERFORM public.admin_set_user_banned('e8000000-0000-4000-8000-000000000021',true,'security_concern',NULL);
  PERFORM set_config('request.jwt.claim.sub','',true);
  IF public.admit_contact_request_v2(repeat('9',64),repeat('4',64),'e8000000-0000-4000-8000-000000000021') THEN RAISE EXCEPTION 'banned account got protected capacity'; END IF;
  UPDATE public.contact_admission_receipts SET created_at=now()-interval '31 minutes';
  IF NOT public.admit_contact_request_v2(repeat('a',64),repeat('7',64),NULL) THEN RAISE EXCEPTION 'contact window did not recover'; END IF;

  INSERT INTO public.tracks(id,user_id,title,audio_url,audio_type,source_type,source_id,source_url)
    VALUES(v_track,v_owner,'Offline only','https://suno.com/song/pb021fixture','link','suno','pb021fixture','https://suno.com/song/pb021fixture');
  INSERT INTO public.private_review_sessions(id,owner_id,source_type,source_track_id,project_name,token_hash,snapshot,comment_visibility,pin_hash,expires_at)
    VALUES(v_session,v_owner,'track',v_track,'Offline review',encode(extensions.digest(v_token,'sha256'),'hex'),'{"title":"legacy snapshot","lyrics":"private marker"}', 'shared',extensions.crypt('1234',extensions.gen_salt('bf',4)),now()+interval '1 day'),
          (v_other,v_owner,'track',v_track,'Other review',encode(extensions.digest(v_other_token,'sha256'),'hex'),'{"title":"other snapshot"}', 'private',NULL,now()+interval '1 day');
  v_result := public.join_private_review_session(v_token,'Legacy guest','1234');
  IF v_result->>'state' <> 'joined' THEN RAISE EXCEPTION 'old token rejected'; END IF;
  v_key := v_result->>'reviewer_key';
  IF (public.get_private_review_session(v_token,v_key))->>'state' <> 'active' THEN RAISE EXCEPTION 'existing reviewer credential broken'; END IF;
  IF (public.get_private_review_session(v_token,v_key))->'snapshot'->>'title' <> 'legacy snapshot' THEN RAISE EXCEPTION 'legacy content changed'; END IF;
  FOR v_i IN 1..12 LOOP
    v_result := public.join_private_review_session(v_token,'Wrong PIN','9999');
    IF v_result->>'state' <> 'invalid_pin' THEN RAISE EXCEPTION 'unexpected PIN outcome % at %',v_result,v_i; END IF;
  END LOOP;
  IF (public.join_private_review_session(v_token,'New caller','9999'))->>'state' <> 'rate_limited' THEN RAISE EXCEPTION 'PIN lockout bypassed'; END IF;
  SELECT sum(pin_failure_count) INTO v_n FROM public.private_review_session_admissions WHERE session_id=v_session;
  IF v_n <> 12 THEN RAISE EXCEPTION 'failed PIN accounting rolled back or overcounted %',v_n; END IF;
  -- Existing admitted reviewers and other sessions are NOT locked out by this failure flood.
  IF (public.get_private_review_session(v_token,v_key))->>'state' <> 'active' THEN RAISE EXCEPTION 'existing reviewer denied'; END IF;
  FOR v_i IN 1..20 LOOP
    IF (public.join_private_review_session(v_other_token,'Shared NAT guest '||v_i,NULL))->>'state' <> 'joined' THEN RAISE EXCEPTION 'unrelated legitimate reviewer blocked'; END IF;
  END LOOP;
  FOR v_i IN 21..60 LOOP
    IF (public.join_private_review_session(v_other_token,'Another guest '||v_i,NULL))->>'state' <> 'joined' THEN RAISE EXCEPTION 'valid session capacity blocked prematurely'; END IF;
  END LOOP;
  IF (public.join_private_review_session(v_other_token,'New caller',NULL))->>'state' <> 'rate_limited' THEN RAISE EXCEPTION 'short attempt window bypass'; END IF;
  -- Hourly bound cannot be bypassed by changing short-window buckets.
  UPDATE public.private_review_session_admissions SET pin_failure_count=0 WHERE session_id=v_session;
  INSERT INTO public.private_review_join_admissions(session_id,network_hash,bucket_start,attempt_count,pin_failure_count)
    VALUES(v_session,repeat('0',64),date_trunc('hour',now()),80,80);
  IF (public.join_private_review_session(v_token,'New header','1234'))->>'state' <> 'rate_limited' THEN RAISE EXCEPTION 'legacy hour failures lost'; END IF;
  DELETE FROM public.private_review_join_admissions WHERE session_id=v_session;
  UPDATE public.private_review_session_admissions SET attempt_count=300 WHERE session_id=v_session;
  IF (public.join_private_review_session(v_token,'New caller','1234'))->>'state' <> 'rate_limited' THEN RAISE EXCEPTION 'session attempts unbounded'; END IF;
  -- Legacy pre-admission/record RPCs cannot create a separate unbounded join path.
  PERFORM public.admit_private_review_join(v_token,repeat('1',64));
  PERFORM public.record_private_review_pin_failure(v_token,repeat('2',64));
  IF (public.join_private_review_session(v_token,'Legacy caller','1234'))->>'state' <> 'rate_limited' THEN RAISE EXCEPTION 'legacy path bypass'; END IF;
  UPDATE public.private_review_sessions SET closed_at=now() WHERE id=v_other;
  IF (public.join_private_review_session(v_other_token,'Guest',NULL))->>'state' <> 'closed' THEN RAISE EXCEPTION 'closed review admitted'; END IF;
  UPDATE public.private_review_sessions SET closed_at=NULL,created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=v_other;
  IF (public.join_private_review_session(v_other_token,'Guest',NULL))->>'state' <> 'closed' THEN RAISE EXCEPTION 'expired review admitted'; END IF;
  IF (public.join_private_review_session(repeat('z',64),'Guest',NULL))->>'state' <> 'unavailable' THEN RAISE EXCEPTION 'invalid token exposed'; END IF;
END;
$$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.admit_contact_request_v2(repeat('a',64),repeat('b',64),NULL);
    RAISE EXCEPTION 'anonymous admission executed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF (public.join_private_review_session(repeat('z',64),'Guest',NULL))->>'state' <> 'unavailable' THEN RAISE EXCEPTION 'service RPC failed'; END IF;
  IF public.admit_contact_request_v2(NULL,NULL,NULL) THEN RAISE EXCEPTION 'malformed service admission accepted'; END IF;
  IF NOT public.admit_contact_request_v2(repeat('6',64),repeat('5',64),NULL) THEN RAISE EXCEPTION 'valid service admission failed'; END IF;
END; $$;
RESET ROLE;
ROLLBACK;
