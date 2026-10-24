-- Disposable database ONLY: all fixtures and receipt/track effects roll back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('14141414-1414-4414-8414-141414141414','upload-owner@example.invalid'),
 ('15151515-1515-4515-8515-151515151515','upload-other@example.invalid');
DO $$
DECLARE k text := 'tracks/14141414-1414-4414-8414-141414141414/fixture.mp3';
 t uuid := '16161616-1616-4616-8616-161616161616'; blocked boolean; n integer;
BEGIN
 IF has_table_privilege('authenticated','public.audio_upload_receipts','INSERT')
 OR has_table_privilege('anon','public.audio_upload_receipts','SELECT')
 OR has_function_privilege('authenticated','public.enforce_finalized_audio_receipt()','EXECUTE')
 THEN RAISE EXCEPTION 'receipt authorization boundary open'; END IF;
 -- Service/server callers cannot attach arbitrary owner-looking keys either.
 blocked:=false;
 BEGIN INSERT INTO public.tracks(id,user_id,title,genre,audio_url,audio_key,audio_type,source_type)
 VALUES(t,'14141414-1414-4414-8414-141414141414','fixture','Pop','https://untrusted.invalid',k,'upload','upload');
 EXCEPTION WHEN OTHERS THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'missing receipt accepted'; END IF;
 INSERT INTO public.audio_upload_receipts(key,owner_id,size,mime,sha256,canonical_url)
 VALUES(k,'14141414-1414-4414-8414-141414141414',15,'audio/mpeg',repeat('a',64),'https://storage.invalid/bucket/'||k);
 FOR n IN 1..3 LOOP
  IF n=2 THEN UPDATE public.audio_upload_receipts SET status='finalized',finalized_at=now(),etag='fixture',expires_at=now()-interval '1 second' WHERE key=k; END IF;
  IF n=3 THEN UPDATE public.audio_upload_receipts SET expires_at=now()+interval '1 hour' WHERE key=k; END IF;
  blocked:=false;
  BEGIN INSERT INTO public.tracks(id,user_id,title,genre,audio_url,audio_key,audio_type,source_type)
  VALUES(t,CASE WHEN n=3 THEN '15151515-1515-4515-8515-151515151515'::uuid ELSE '14141414-1414-4414-8414-141414141414'::uuid END,'fixture','Pop','https://untrusted.invalid',k,'upload','upload');
  EXCEPTION WHEN OTHERS THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'pending/expired/cross-user receipt accepted'; END IF;
 END LOOP;
 blocked:=false;
 BEGIN INSERT INTO public.tracks(id,user_id,title,genre,audio_url,audio_key,audio_type,source_type)
 VALUES(t,'14141414-1414-4414-8414-141414141414',NULL,'Pop','https://untrusted.invalid',k,'upload','upload');
 EXCEPTION WHEN OTHERS THEN blocked:=true; END;
 IF NOT blocked OR (SELECT consumed_at FROM public.audio_upload_receipts WHERE key=k) IS NOT NULL
 THEN RAISE EXCEPTION 'failed track insert consumed receipt'; END IF;
 INSERT INTO public.tracks(id,user_id,title,genre,audio_url,audio_key,audio_type,source_type)
 VALUES(t,'14141414-1414-4414-8414-141414141414','fixture','Pop','https://untrusted.invalid',k,'upload','upload');
 IF (SELECT audio_url FROM public.tracks WHERE id=t)<>'https://storage.invalid/bucket/'||k
 OR (SELECT consumed_track_id FROM public.audio_upload_receipts WHERE key=k)<>t
 THEN RAISE EXCEPTION 'canonical URL/atomic consumption failed'; END IF;
 blocked:=false;
 BEGIN INSERT INTO public.tracks(user_id,title,genre,audio_url,audio_key,audio_type,source_type)
 VALUES('14141414-1414-4414-8414-141414141414','replay','Pop','https://untrusted.invalid',k,'upload','upload');
 EXCEPTION WHEN OTHERS THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'receipt replay accepted'; END IF;
 -- Simulate a pre-migration track lacking any receipt; metadata still editable.
 DELETE FROM public.audio_upload_receipts WHERE key=k;
 UPDATE public.tracks SET title='legacy edit',audio_url='https://untrusted.invalid' WHERE id=t;
 IF (SELECT audio_url FROM public.tracks WHERE id=t)<>'https://storage.invalid/bucket/'||k
 THEN RAISE EXCEPTION 'legacy metadata edit changed authoritative URL'; END IF;
 INSERT INTO public.tracks(user_id,title,genre,audio_url,audio_type,source_type,source_url,source_id)
 VALUES('14141414-1414-4414-8414-141414141414','external','Pop','https://suno.com/song/fixture-song','link','suno','https://suno.com/song/fixture-song','fixture-song');
 k:='tracks/14141414-1414-4414-8414-141414141414/replacement.mp3';
 INSERT INTO public.audio_upload_receipts(key,owner_id,size,mime,sha256,canonical_url,status,finalized_at,etag)
 VALUES(k,'14141414-1414-4414-8414-141414141414',15,'audio/mpeg',repeat('b',64),'https://storage.invalid/bucket/'||k,'finalized',now(),'replacement');
 UPDATE public.tracks SET audio_key=k,audio_url='https://untrusted.invalid' WHERE id=t;
 IF NOT EXISTS (SELECT 1 FROM public.tracks WHERE id=t AND audio_content_hash=repeat('b',64) AND audio_url='https://storage.invalid/bucket/'||k)
 THEN RAISE EXCEPTION 'audio replacement did not use finalized metadata'; END IF;
 k:='tracks/14141414-1414-4414-8414-141414141414/discard.mp3';
 INSERT INTO public.audio_upload_receipts(key,owner_id,size,mime,sha256,canonical_url,status,finalized_at,etag)
 VALUES(k,'14141414-1414-4414-8414-141414141414',15,'audio/mpeg',repeat('a',64),'https://storage.invalid/bucket/'||k,'finalized',now(),'fixture');
 INSERT INTO public.track_storage_cleanup(owner_id,audio_key,created_by,cleanup_type)
 VALUES('14141414-1414-4414-8414-141414141414',k,'14141414-1414-4414-8414-141414141414','abandoned_upload');
 IF (SELECT status FROM public.audio_upload_receipts WHERE key=k)<>'discarded'
 THEN RAISE EXCEPTION 'cleanup did not invalidate receipt'; END IF;
 blocked:=false;
 BEGIN INSERT INTO public.tracks(user_id,title,genre,audio_url,audio_key,audio_type,source_type)
 VALUES('14141414-1414-4414-8414-141414141414','discarded','Pop','https://untrusted.invalid',k,'upload','upload');
 EXCEPTION WHEN OTHERS THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'cleanup/reference race accepted'; END IF;
END $$;
ROLLBACK;
