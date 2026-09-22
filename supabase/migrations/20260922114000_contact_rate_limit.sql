-- Durable Contact Us abuse admission. The public web endpoint supplies only
-- one-way request fingerprints; raw email addresses and IP addresses are never
-- stored in this table.
BEGIN;

CREATE TABLE IF NOT EXISTS public.contact_rate_admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash text NOT NULL CHECK (length(email_hash) = 64),
  network_hash text NOT NULL CHECK (length(network_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_rate_admissions_email_created_idx
  ON public.contact_rate_admissions(email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_rate_admissions_network_created_idx
  ON public.contact_rate_admissions(network_hash, created_at DESC);

ALTER TABLE public.contact_rate_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_rate_admissions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.contact_rate_admissions TO service_role;

CREATE OR REPLACE FUNCTION public.admit_contact_request(
  _email_hash text,
  _network_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email_count integer;
  v_network_count integer;
BEGIN
  IF _email_hash !~ '^[0-9a-f]{64}$' OR _network_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid contact fingerprint';
  END IF;

  -- Serialize by network fingerprint. The email check is inside the same
  -- transaction, so concurrent spam cannot race past either threshold.
  PERFORM pg_advisory_xact_lock(hashtextextended('contact:' || _network_hash, 0));

  SELECT count(*)::integer INTO v_email_count
  FROM public.contact_rate_admissions
  WHERE email_hash = _email_hash
    AND created_at > now() - interval '30 minutes';

  SELECT count(*)::integer INTO v_network_count
  FROM public.contact_rate_admissions
  WHERE network_hash = _network_hash
    AND created_at > now() - interval '30 minutes';

  IF v_email_count >= 3 OR v_network_count >= 10 THEN
    RETURN false;
  END IF;

  INSERT INTO public.contact_rate_admissions(email_hash, network_hash)
  VALUES (_email_hash, _network_hash);

  DELETE FROM public.contact_rate_admissions
  WHERE created_at < now() - interval '7 days';

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admit_contact_request(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admit_contact_request(text, text)
  TO service_role;

COMMIT;
