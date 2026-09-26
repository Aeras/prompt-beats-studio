BEGIN;

CREATE TABLE IF NOT EXISTS public.private_review_join_admissions (
  session_id uuid NOT NULL REFERENCES public.private_review_sessions(id) ON DELETE CASCADE,
  network_hash text NOT NULL CHECK (char_length(network_hash) = 64),
  bucket_start timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  pin_failure_count integer NOT NULL DEFAULT 0 CHECK (pin_failure_count >= 0),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, network_hash, bucket_start)
);

CREATE INDEX IF NOT EXISTS private_review_join_admissions_session_bucket_idx
  ON public.private_review_join_admissions(session_id, bucket_start);

ALTER TABLE public.private_review_join_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.private_review_join_admissions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.private_review_join_admissions TO service_role;

CREATE OR REPLACE FUNCTION public.admit_private_review_join(
  _token text,
  _network_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session public.private_review_sessions%ROWTYPE;
  v_bucket timestamptz := date_trunc('hour', now());
  v_network_attempts integer := 0;
  v_network_failures integer := 0;
  v_session_attempts integer := 0;
  v_session_failures integer := 0;
BEGIN
  IF _network_hash IS NULL OR _network_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('state', 'rate_limited');
  END IF;

  SELECT * INTO v_session
  FROM public.private_review_sessions
  WHERE token_hash = encode(extensions.digest(_token, 'sha256'), 'hex');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'unavailable');
  END IF;

  IF v_session.closed_at IS NOT NULL OR v_session.expires_at <= now() THEN
    RETURN jsonb_build_object('state', 'closed');
  END IF;

  -- Serialize both the session-wide aggregate and this network bucket so
  -- distributed attempts cannot race the durable limits.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('private-review-session:' || v_session.id::text || ':' || v_bucket::text, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'private-review-network:' || v_session.id::text || ':' || _network_hash || ':' || v_bucket::text,
      0
    )
  );

  DELETE FROM public.private_review_join_admissions
  WHERE session_id = v_session.id
    AND bucket_start < v_bucket - interval '48 hours';

  SELECT attempt_count, pin_failure_count
  INTO v_network_attempts, v_network_failures
  FROM public.private_review_join_admissions
  WHERE session_id = v_session.id
    AND network_hash = _network_hash
    AND bucket_start = v_bucket;

  v_network_attempts := COALESCE(v_network_attempts, 0);
  v_network_failures := COALESCE(v_network_failures, 0);

  SELECT
    COALESCE(sum(attempt_count), 0)::integer,
    COALESCE(sum(pin_failure_count), 0)::integer
  INTO v_session_attempts, v_session_failures
  FROM public.private_review_join_admissions
  WHERE session_id = v_session.id
    AND bucket_start = v_bucket;

  -- NAT-safe limits: ordinary shared networks can host many reviewers while
  -- a short PIN still cannot be brute-forced at useful speed.
  IF v_network_attempts >= 60
     OR v_network_failures >= 12
     OR v_session_attempts >= 300
     OR v_session_failures >= 80 THEN
    RETURN jsonb_build_object('state', 'rate_limited');
  END IF;

  INSERT INTO public.private_review_join_admissions(
    session_id,
    network_hash,
    bucket_start,
    attempt_count,
    pin_failure_count,
    last_attempt_at
  ) VALUES (
    v_session.id,
    _network_hash,
    v_bucket,
    1,
    0,
    now()
  )
  ON CONFLICT (session_id, network_hash, bucket_start)
  DO UPDATE SET
    attempt_count = public.private_review_join_admissions.attempt_count + 1,
    last_attempt_at = now();

  RETURN jsonb_build_object('state', 'allowed');
END;
$$;

CREATE OR REPLACE FUNCTION public.record_private_review_pin_failure(
  _token text,
  _network_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session_id uuid;
  v_bucket timestamptz := date_trunc('hour', now());
BEGIN
  IF _network_hash IS NULL OR _network_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  SELECT id INTO v_session_id
  FROM public.private_review_sessions
  WHERE token_hash = encode(extensions.digest(_token, 'sha256'), 'hex');

  IF v_session_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('private-review-session:' || v_session_id::text || ':' || v_bucket::text, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'private-review-network:' || v_session_id::text || ':' || _network_hash || ':' || v_bucket::text,
      0
    )
  );

  INSERT INTO public.private_review_join_admissions(
    session_id,
    network_hash,
    bucket_start,
    attempt_count,
    pin_failure_count,
    last_attempt_at
  ) VALUES (
    v_session_id,
    _network_hash,
    v_bucket,
    0,
    1,
    now()
  )
  ON CONFLICT (session_id, network_hash, bucket_start)
  DO UPDATE SET
    pin_failure_count = public.private_review_join_admissions.pin_failure_count + 1,
    last_attempt_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.admit_private_review_join(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_private_review_pin_failure(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admit_private_review_join(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_private_review_pin_failure(text, text) TO service_role;

COMMIT;
