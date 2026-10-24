-- PB-AUD-008: only finalized R2 uploads consume the hourly successful-upload allowance.
-- Retain a separate pre-body abuse throttle for invalid requests.
BEGIN;

CREATE TABLE public.track_upload_success_quota (
  user_id uuid PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  success_count integer NOT NULL DEFAULT 0 CHECK (success_count BETWEEN 0 AND 20)
);
ALTER TABLE public.track_upload_success_quota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.track_upload_success_quota FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.track_upload_success_quota TO service_role;

CREATE FUNCTION public.count_finalized_audio_upload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.status = 'finalized' OR NEW.status <> 'finalized' THEN RETURN NEW; END IF;
  -- A single keyed UPSERT serializes concurrent finalize transactions.
  INSERT INTO public.track_upload_success_quota AS q
    (user_id, window_started_at, success_count)
  VALUES (NEW.owner_id, now(), 1)
  ON CONFLICT (user_id) DO UPDATE
    SET window_started_at = CASE WHEN q.window_started_at <= now() - interval '1 hour'
                                 THEN now() ELSE q.window_started_at END,
        success_count = CASE WHEN q.window_started_at <= now() - interval '1 hour'
                             THEN 1 ELSE q.success_count + 1 END
  WHERE q.window_started_at <= now() - interval '1 hour' OR q.success_count < 20;
  IF NOT FOUND THEN RAISE EXCEPTION 'successful upload limit reached' USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.count_finalized_audio_upload() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER count_finalized_audio_upload
  BEFORE UPDATE OF status ON public.audio_upload_receipts
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'finalized')
  EXECUTE FUNCTION public.count_finalized_audio_upload();

-- Keep abuse requests separate: a rejected/invalid upload consumes only an
-- attempt, never a successful upload. No change to existing auth/feature checks.
CREATE OR REPLACE FUNCTION public.admit_track_upload()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_started timestamptz;
  v_count integer;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_valid_account_state(v_user_id)
    OR NOT public.can_use_feature(v_user_id, 'track_uploads') THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.track_upload_success_quota q
    WHERE q.user_id = v_user_id AND q.window_started_at > v_now - interval '1 hour'
      AND q.success_count >= 20
  ) THEN RETURN false; END IF;
  INSERT INTO public.track_upload_admission(user_id,window_started_at,request_count)
  VALUES (v_user_id,v_now,1)
  ON CONFLICT(user_id) DO UPDATE
  SET window_started_at = CASE
        WHEN public.track_upload_admission.window_started_at <= v_now-interval '1 hour' THEN v_now
        ELSE public.track_upload_admission.window_started_at END,
      request_count = CASE
        WHEN public.track_upload_admission.window_started_at <= v_now-interval '1 hour' THEN 1
        ELSE public.track_upload_admission.request_count+1 END
  RETURNING window_started_at, request_count INTO v_started,v_count;
  RETURN v_started > v_now - interval '1 hour' AND v_count <= 100;
END;
$$;

COMMIT;
