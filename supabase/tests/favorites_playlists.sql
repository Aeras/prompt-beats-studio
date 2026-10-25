-- Disposable local database only. Everything, including ACL fixtures, rolls back.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a,
      LATERAL aclexplode(COALESCE(a.attacl, '{}'::aclitem[])) x
    WHERE a.attrelid='public.tracks'::regclass AND a.attname='moderation_status'
      AND x.grantee='authenticated'::regrole AND x.privilege_type='SELECT'
  ) THEN RAISE EXCEPTION 'Migration must grant the moderation column explicitly'; END IF;
  IF has_function_privilege('anon','public.create_playlist_with_track(text,uuid,text)','EXECUTE')
    OR has_function_privilege('anon','public.add_playlist_track_atomic(uuid,uuid)','EXECUTE')
    OR EXISTS (SELECT 1 FROM pg_proc WHERE oid IN (
      'public.create_playlist_with_track(text,uuid,text)'::regprocedure,
      'public.add_playlist_track_atomic(uuid,uuid)'::regprocedure) AND prosecdef)
  THEN RAISE EXCEPTION 'Unexpected public RPC access or RLS bypass'; END IF;
END $$;

-- Fresh Supabase grants broader table privileges than this production project.
-- Mirror its verified column-only ACL so default privileges cannot hide defects.
REVOKE INSERT ON public.favorites,public.playlists,public.playlist_tracks FROM authenticated;
REVOKE UPDATE ON public.playlists FROM authenticated;
REVOKE SELECT ON public.tracks FROM authenticated;
GRANT INSERT(user_id,track_id) ON public.favorites TO authenticated;
GRANT INSERT(user_id,name,is_public,cover_url) ON public.playlists TO authenticated;
GRANT UPDATE(name,cover_url) ON public.playlists TO authenticated;
GRANT INSERT(playlist_id,track_id,position) ON public.playlist_tracks TO authenticated;
GRANT SELECT(id,user_id,is_published,source_type,duration_seconds,cover_url,art_url)
  ON public.tracks TO authenticated;

CREATE FUNCTION pg_temp.denied(sql text, expected text DEFAULT '42501') RETURNS void
LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Expected SQLSTATE %, got %',expected,actual;
  END IF;
END $$;

INSERT INTO auth.users(id,email) VALUES
 ('a7000000-0000-4000-8000-000000000001','library-owner@example.invalid'),
 ('a7000000-0000-4000-8000-000000000002','library-other@example.invalid'),
 ('a7000000-0000-4000-8000-000000000003','library-banned@example.invalid');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000076',true);
SELECT public.admin_set_user_banned('a7000000-0000-4000-8000-000000000003',true,'security_concern');
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.feature_access_policies SET access_mode='everyone'
  WHERE feature_key IN ('favorites','playlists');
DO $$
DECLARE i integer; owner_id uuid; v_key text;
BEGIN
  FOR i IN 1..5 LOOP
    owner_id := CASE WHEN i IN (1,5) THEN 'a7000000-0000-4000-8000-000000000001'::uuid
      ELSE 'a7000000-0000-4000-8000-000000000002'::uuid END;
    v_key := 'tracks/'||owner_id||'/library-fixture-'||i||'.mp3';
    INSERT INTO public.audio_upload_receipts(key,owner_id,size,mime,sha256,canonical_url)
      VALUES(v_key,owner_id,4,'audio/mpeg',repeat(i::text,64),'https://example.invalid/'||v_key);
    UPDATE public.audio_upload_receipts SET status='finalized',finalized_at=now(),etag='offline'
      WHERE audio_upload_receipts.key=v_key;
    INSERT INTO public.tracks(id,user_id,title,audio_key,audio_url,audio_type,source_type,is_published,
      moderation_status,moderation_reason_code,moderation_locked_at,moderation_locked_by)
      VALUES(('a8000000-0000-4000-8000-00000000000'||i)::uuid,owner_id,'Offline fixture',
        v_key,'https://example.invalid/audio','upload','upload',i IN (2,4),
        CASE WHEN i IN (4,5) THEN 'locked' ELSE 'active' END,
        CASE WHEN i IN (4,5) THEN 'policy_violation' END,
        CASE WHEN i IN (4,5) THEN now() END,
        CASE WHEN i IN (4,5) THEN '00000000-0000-0000-0000-000000000076'::uuid END);
  END LOOP;
END $$;
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);

-- Reproduce the OLD failure before exercising the patched ACL. No broad grant.
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied('SELECT id,user_id,is_published,moderation_status FROM public.tracks');
-- Direct inserts already work even though table-level INSERT is false.
INSERT INTO public.favorites(user_id,track_id)
  VALUES(auth.uid(),'a8000000-0000-4000-8000-000000000002');
DELETE FROM public.favorites WHERE user_id=auth.uid();
INSERT INTO public.playlists(user_id,name,is_public,cover_url) VALUES(auth.uid(),'Direct insert',false,NULL);
RESET ROLE;
GRANT SELECT(moderation_status) ON public.tracks TO authenticated;

SET LOCAL ROLE authenticated;
DO $$
DECLARE p uuid; before_count integer; result jsonb;
BEGIN
  IF has_table_privilege('authenticated','public.tracks','SELECT')
     OR has_table_privilege('authenticated','public.favorites','INSERT')
     OR has_column_privilege('authenticated','public.tracks','prompt','SELECT')
     OR has_column_privilege('authenticated','public.tracks','lyrics','SELECT')
     OR has_column_privilege('authenticated','public.tracks','audio_key','SELECT')
  THEN RAISE EXCEPTION 'Unexpected broad/private grant'; END IF;
  IF (SELECT count(*) FROM public.tracks) <> 2 THEN
    RAISE EXCEPTION 'Track RLS must expose only public active and own active rows'; END IF;
  PERFORM id,user_id,is_published,moderation_status FROM public.tracks;
  PERFORM pg_temp.denied('SELECT prompt FROM public.tracks');
  PERFORM pg_temp.denied('INSERT INTO public.favorites(user_id,track_id) VALUES(''a7000000-0000-4000-8000-000000000002'',''a8000000-0000-4000-8000-000000000002'')');
  PERFORM pg_temp.denied('INSERT INTO public.favorites(user_id,track_id) VALUES(auth.uid(),''a8000000-0000-4000-8000-000000000003'')');
  PERFORM pg_temp.denied('INSERT INTO public.favorites(user_id,track_id) VALUES(auth.uid(),''a8000000-0000-4000-8000-000000000004'')');
  INSERT INTO public.favorites(user_id,track_id) VALUES(auth.uid(),'a8000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.denied('INSERT INTO public.favorites(user_id,track_id) VALUES(auth.uid(),''a8000000-0000-4000-8000-000000000001'')','23505');
  result := public.create_playlist_with_track('Atomic playlist','a8000000-0000-4000-8000-000000000002');
  p := (result->>'id')::uuid;
  PERFORM set_config('test.library_playlist',p::text,true);
  IF (SELECT count(*) FROM public.playlist_tracks WHERE playlist_id=p) <> 1 THEN
    RAISE EXCEPTION 'Initial track missing'; END IF;
  IF public.add_playlist_track_atomic(p,'a8000000-0000-4000-8000-000000000002') <> 'exists'
    OR public.add_playlist_track_atomic(p,'a8000000-0000-4000-8000-000000000001') <> 'added'
  THEN RAISE EXCEPTION 'Idempotent add contract mismatch'; END IF;
  IF (SELECT max(position) FROM public.playlist_tracks WHERE playlist_id=p) <> 1 THEN
    RAISE EXCEPTION 'Append order mismatch'; END IF;
  PERFORM pg_temp.denied(format('SELECT public.add_playlist_track_atomic(%L,''a8000000-0000-4000-8000-000000000003'')',p),'P0001');
  PERFORM pg_temp.denied(format('SELECT public.add_playlist_track_atomic(%L,''a8000000-0000-4000-8000-000000000004'')',p),'P0001');
  SELECT count(*) INTO before_count FROM public.playlists;
  PERFORM pg_temp.denied('SELECT public.create_playlist_with_track(''Must roll back'',''a8000000-0000-4000-8000-000000000003'')','P0001');
  PERFORM pg_temp.denied('SELECT public.create_playlist_with_track('''',''a8000000-0000-4000-8000-000000000002'')','23514');
  IF (SELECT count(*) FROM public.playlists) <> before_count THEN
    RAISE EXCEPTION 'Failed create left orphan playlist'; END IF;
  PERFORM public.create_playlist_with_track('Empty playlist');
END $$;

-- Other account cannot inspect or mutate the first account's playlist.
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.playlists) OR EXISTS(SELECT 1 FROM public.favorites)
    OR EXISTS(SELECT 1 FROM public.playlist_tracks) THEN RAISE EXCEPTION 'Cross-user library leak'; END IF;
END $$;
SELECT pg_temp.denied(format('SELECT public.add_playlist_track_atomic(%L,''a8000000-0000-4000-8000-000000000002'')',current_setting('test.library_playlist')),'P0001');

SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.denied('SELECT public.create_playlist_with_track(''Banned'')','P0001');
SELECT pg_temp.denied('INSERT INTO public.favorites(user_id,track_id) VALUES(auth.uid(),''a8000000-0000-4000-8000-000000000002'')');
RESET ROLE;
UPDATE public.feature_access_policies SET access_mode='disabled' WHERE feature_key IN ('favorites','playlists');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.denied('SELECT public.create_playlist_with_track(''Disabled'')','P0001');
SELECT pg_temp.denied('INSERT INTO public.favorites(user_id,track_id) VALUES(auth.uid(),''a8000000-0000-4000-8000-000000000002'')');
RESET ROLE;
UPDATE public.feature_access_policies SET access_mode='everyone' WHERE feature_key IN ('favorites','playlists');
-- Removal stays possible after moderation; current server projections hide content.
UPDATE public.tracks SET moderation_status='locked',moderation_reason_code='policy_violation',
  moderation_locked_at=now(),moderation_locked_by='00000000-0000-0000-0000-000000000076'
  WHERE id='a8000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DELETE FROM public.favorites WHERE user_id=auth.uid();
DELETE FROM public.playlist_tracks WHERE track_id='a8000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.favorites) THEN RAISE EXCEPTION 'Removal broken'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.denied('SELECT public.create_playlist_with_track(''Anonymous'')');
SELECT pg_temp.denied('SELECT public.add_playlist_track_atomic(gen_random_uuid(),gen_random_uuid())');
ROLLBACK;
