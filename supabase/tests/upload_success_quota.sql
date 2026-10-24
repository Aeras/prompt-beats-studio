BEGIN;
DO $$
DECLARE
  v_owner uuid := '00000000-0000-0000-0000-000000000076';
  v_key text;
  v_i integer;
BEGIN
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
      BEGIN
        UPDATE public.audio_upload_receipts
        SET status='finalized', finalized_at=now(), etag='test-etag'
        WHERE key=v_key;
        RAISE EXCEPTION '21st success unexpectedly allowed';
      EXCEPTION WHEN raise_exception THEN
        IF EXISTS(SELECT 1 FROM public.audio_upload_receipts
                  WHERE key=v_key AND status='finalized') THEN
          RAISE EXCEPTION '21st success was finalized';
        END IF;
      END;
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
