-- PB-AUD-018: serialize Checkout admission by account across concurrent workers.
-- Reservation expiry is a recovery lease, not proof that a Stripe session expired.
BEGIN;

CREATE TABLE public.stripe_checkout_reservations (
  user_id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_checkout_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_checkout_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.stripe_checkout_reservations TO service_role;

CREATE FUNCTION public.reserve_stripe_checkout_attempt(_user_id uuid, _attempt_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF _user_id IS NULL OR _attempt_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.stripe_checkout_reservations AS existing
    (user_id, attempt_id, expires_at)
  VALUES (_user_id, _attempt_id, now() + interval '30 minutes')
  ON CONFLICT (user_id) DO UPDATE
  SET attempt_id = EXCLUDED.attempt_id,
      expires_at = EXCLUDED.expires_at,
      updated_at = now()
  WHERE existing.attempt_id = EXCLUDED.attempt_id
     OR existing.expires_at <= now();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_stripe_checkout_attempt(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_stripe_checkout_attempt(uuid, uuid)
  TO service_role;

COMMIT;
