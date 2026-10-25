-- PB-AUD-021: admission never trusts network headers. Internal RPCs only.
BEGIN;

CREATE TABLE public.contact_admission_receipts (
  nonce_hash text PRIMARY KEY CHECK (nonce_hash ~ '^[0-9a-f]{64}$'),
  email_hash text NOT NULL CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX contact_admission_receipts_email_idx ON public.contact_admission_receipts(email_hash, created_at);
CREATE INDEX contact_admission_receipts_actor_idx ON public.contact_admission_receipts(user_id, created_at);
CREATE INDEX contact_admission_receipts_retention_idx ON public.contact_admission_receipts(created_at);
ALTER TABLE public.contact_admission_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contact_admission_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.contact_admission_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.admit_contact_request_v2(
  _email_hash text, _nonce_hash text, _user_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz;
BEGIN
  IF _email_hash IS NULL OR _email_hash !~ '^[0-9a-f]{64}$'
     OR _nonce_hash IS NULL OR _nonce_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;
  -- Only freshly verified, confirmed real accounts may use reserved capacity.
  IF _user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM auth.users u JOIN public.profile_private p ON p.user_id = u.id
    WHERE u.id = _user_id AND u.email_confirmed_at IS NOT NULL
      AND COALESCE(u.is_anonymous, false) = false AND p.is_banned = false
  ) THEN RETURN false; END IF;

  -- Anonymous ceiling plus INDEPENDENT confirmed-account budgets. There is no
  -- shared authenticated pool an attacker can exhaust for every account.
  -- Principal then email is the same lock order for every caller.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    CASE WHEN _user_id IS NULL THEN 'contact-v2:guest' ELSE 'contact-v2:actor:' || _user_id::text END, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('contact-v2:email:' || _email_hash, 0));
  v_now := clock_timestamp();
  IF EXISTS (SELECT 1 FROM public.contact_admission_receipts WHERE nonce_hash = _nonce_hash)
     OR (SELECT count(*) FROM public.contact_admission_receipts
         WHERE email_hash = _email_hash AND created_at > v_now - interval '30 minutes') >= 3
     OR (_user_id IS NOT NULL AND (SELECT count(*) FROM public.contact_admission_receipts
         WHERE user_id = _user_id AND created_at > v_now - interval '30 minutes') >= 10)
     OR (_user_id IS NULL AND (SELECT count(*) FROM public.contact_admission_receipts
         WHERE user_id IS NULL AND created_at > v_now - interval '30 minutes') >= 120) THEN
    RETURN false;
  END IF;
  INSERT INTO public.contact_admission_receipts(nonce_hash, email_hash, user_id, created_at)
  VALUES (_nonce_hash, _email_hash, _user_id, v_now)
  ON CONFLICT (nonce_hash) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  IF pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('contact-v2:cleanup', 0)) THEN
    DELETE FROM public.contact_admission_receipts WHERE created_at < v_now - interval '24 hours';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.admit_contact_request_v2(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admit_contact_request_v2(text, text, uuid) TO service_role;

-- Old browser/server builds cannot silently bypass the proof + new admission.
-- Keep the signature, but fail closed until the coordinated app publish.
CREATE OR REPLACE FUNCTION public.admit_contact_request(_email_hash text, _network_hash text)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT false; $$;
REVOKE ALL ON FUNCTION public.admit_contact_request(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admit_contact_request(text, text) TO service_role;

CREATE TABLE public.private_review_session_admissions (
  session_id uuid NOT NULL REFERENCES public.private_review_sessions(id) ON DELETE CASCADE,
  bucket_start timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  pin_failure_count integer NOT NULL DEFAULT 0 CHECK (pin_failure_count >= 0),
  PRIMARY KEY (session_id, bucket_start)
);
CREATE INDEX private_review_session_admissions_retention_idx ON public.private_review_session_admissions(bucket_start);
ALTER TABLE public.private_review_session_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.private_review_session_admissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.private_review_session_admissions TO service_role;

-- One transaction: lock the real session, reserve attempt, check PIN, record
-- failed PIN OR create reviewer. Negative outcomes return states, not exceptions
-- that would roll back failure counters. Existing token/reviewer keys unchanged.
CREATE OR REPLACE FUNCTION public.join_private_review_session(
  _token text, _display_name text, _pin text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_session public.private_review_sessions%ROWTYPE;
  v_reviewer public.private_review_reviewers%ROWTYPE;
  v_now timestamptz;
  v_bucket timestamptz;
  v_attempts integer;
  v_failures integer;
  v_short_attempts integer;
  v_short_failures integer;
  v_legacy_attempts integer;
  v_legacy_failures integer;
  v_bad_pin boolean;
  v_raw_key text;
BEGIN
  IF _token IS NULL OR char_length(_token) NOT BETWEEN 40 AND 100
     OR _display_name IS NULL OR char_length(trim(_display_name)) NOT BETWEEN 1 AND 80
     OR (_pin IS NOT NULL AND char_length(_pin) > 20) THEN
    RETURN jsonb_build_object('state', 'unavailable');
  END IF;
  SELECT * INTO v_session FROM public.private_review_sessions
  WHERE token_hash = encode(extensions.digest(_token, 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('state', 'unavailable'); END IF;
  v_now := clock_timestamp();
  IF v_session.closed_at IS NOT NULL OR v_session.expires_at <= v_now THEN
    RETURN jsonb_build_object('state', 'closed');
  END IF;
  v_bucket := date_trunc('hour', v_now) + floor(extract(minute FROM v_now) / 5) * interval '5 minutes';
  SELECT COALESCE(sum(attempt_count),0), COALESCE(sum(pin_failure_count),0),
         COALESCE(sum(attempt_count) FILTER (WHERE bucket_start = v_bucket),0),
         COALESCE(sum(pin_failure_count) FILTER (WHERE bucket_start = v_bucket),0)
  INTO v_attempts, v_failures, v_short_attempts, v_short_failures
  FROM public.private_review_session_admissions
  WHERE session_id = v_session.id AND bucket_start >= date_trunc('hour', v_now);
  -- Preserve already-counted legacy failures in the migration's current hour.
  SELECT COALESCE(sum(attempt_count),0), COALESCE(sum(pin_failure_count),0)
  INTO v_legacy_attempts, v_legacy_failures FROM public.private_review_join_admissions
  WHERE session_id = v_session.id AND bucket_start = date_trunc('hour', v_now);
  IF v_attempts + v_legacy_attempts >= 300 OR v_failures + v_legacy_failures >= 80
     OR v_short_attempts >= 60 OR v_short_failures >= 12 THEN
    RETURN jsonb_build_object('state', 'rate_limited');
  END IF;
  v_bad_pin := v_session.pin_hash IS NOT NULL AND
    (_pin IS NULL OR extensions.crypt(_pin, v_session.pin_hash) <> v_session.pin_hash);
  INSERT INTO public.private_review_session_admissions(session_id, bucket_start, attempt_count, pin_failure_count)
  VALUES (v_session.id, v_bucket, 1, CASE WHEN v_bad_pin THEN 1 ELSE 0 END)
  ON CONFLICT (session_id, bucket_start) DO UPDATE SET
    attempt_count = public.private_review_session_admissions.attempt_count + 1,
    pin_failure_count = public.private_review_session_admissions.pin_failure_count + EXCLUDED.pin_failure_count;
  IF pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('private-review-v2:cleanup', 0)) THEN
    DELETE FROM public.private_review_session_admissions WHERE bucket_start < v_now - interval '48 hours';
  END IF;
  IF v_bad_pin THEN RETURN jsonb_build_object('state', 'invalid_pin'); END IF;

  v_raw_key := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.private_review_reviewers(session_id, access_key_hash, display_name)
  VALUES (v_session.id, encode(extensions.digest(v_raw_key,'sha256'),'hex'), trim(_display_name))
  RETURNING * INTO v_reviewer;
  UPDATE public.private_review_sessions SET open_count = open_count + 1, last_opened_at = v_now
  WHERE id = v_session.id;
  RETURN jsonb_build_object('state','joined','reviewer_id',v_reviewer.id,
    'reviewer_key',v_raw_key,'display_name',v_reviewer.display_name);
END;
$$;
REVOKE ALL ON FUNCTION public.join_private_review_session(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_private_review_session(text, text, text) TO service_role;

-- Legacy app compatibility: the authoritative check is now INSIDE join.
-- Header fingerprints are accepted only as ignored obsolete arguments.
CREATE OR REPLACE FUNCTION public.admit_private_review_join(_token text, _network_hash text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN s.closed_at IS NOT NULL OR s.expires_at <= clock_timestamp()
         THEN jsonb_build_object('state','closed') ELSE jsonb_build_object('state','allowed') END
  FROM public.private_review_sessions s
  WHERE s.token_hash = encode(extensions.digest(_token,'sha256'),'hex')
  UNION ALL SELECT jsonb_build_object('state','unavailable')
  WHERE NOT EXISTS (SELECT 1 FROM public.private_review_sessions s
    WHERE s.token_hash = encode(extensions.digest(_token,'sha256'),'hex'));
$$;
CREATE OR REPLACE FUNCTION public.record_private_review_pin_failure(_token text, _network_hash text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ BEGIN RETURN; END; $$;
REVOKE ALL ON FUNCTION public.admit_private_review_join(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_private_review_pin_failure(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admit_private_review_join(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_private_review_pin_failure(text, text) TO service_role;
COMMIT;
