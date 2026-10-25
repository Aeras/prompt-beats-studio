BEGIN;
DO $$
DECLARE
  v_owner uuid := '00000000-0000-0000-0000-000000000076';
  v_key text;
  v_i integer;
  v_blocked boolean;
BEGIN
  -- Invalid requests consume only the separate admission abuse allowance.
  -- No file/receipt has been finalized in this phase.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  FOR v_i IN 1..100 LOOP
    IF NOT public.admit_track_upload() THEN
      RAISE EXCEPTION 'admission attempt % rejected before abuse limit', v_i;
    END IF;
  END LOOP;
  IF public.admit_track_upload() THEN
    RAISE EXCEPTION '101st abuse admission unexpectedly allowed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.track_upload_success_quota WHERE user_id=v_owner) THEN
    RAISE EXCEPTION 'unfinalized/invalid attempts consumed success quota';
  END IF;
  FOR v_i IN 1..21 LOOP
    v_key := 'tracks/' || v_owner::text || '/pb-aud-008-' || v_i || '.mp3';
    INSERT INTO public.audio_upload_receipts(key, owner_id, size, mime, sha256, canonical_url)
    VALUES (v_key, v_owner, 4, 'audio/mpeg', repeat('a',64),
            'https://example.com/' || v_key);
    IF v_i <= 20 THEN
      UPDATE public.audio_upload_receipts
      SET status='finalized', finalized_at=now(), etag='test-etag'
      WHERE key=v_key;
    ELSE
      v_blocked := false;
      BEGIN
        UPDATE public.audio_upload_receipts
        SET status='finalized', finalized_at=now(), etag='test-etag'
        WHERE key=v_key;
      EXCEPTION WHEN raise_exception THEN
        v_blocked := true;
      END;
      IF NOT v_blocked OR EXISTS(SELECT 1 FROM public.audio_upload_receipts
                                WHERE key=v_key AND status='finalized') THEN
        RAISE EXCEPTION '21st success was finalized';
      END IF;
    END IF;
  END LOOP;
  IF (SELECT success_count FROM public.track_upload_success_quota WHERE user_id=v_owner) <> 20
    THEN RAISE EXCEPTION 'successful quota mismatch'; END IF;
  IF has_table_privilege('anon','public.track_upload_success_quota','SELECT')
    OR has_table_privilege('authenticated','public.track_upload_success_quota','INSERT')
    THEN RAISE EXCEPTION 'quota exposed to client'; END IF;
END;
$$;
ROLLBACK;
