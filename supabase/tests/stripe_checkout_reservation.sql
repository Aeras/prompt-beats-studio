BEGIN;
DO $$
DECLARE
  v_user uuid := '00000000-0000-0000-0000-0000000000a1';
  v_first uuid := '00000000-0000-0000-0000-0000000000a2';
  v_second uuid := '00000000-0000-0000-0000-0000000000a3';
BEGIN
  IF NOT public.reserve_stripe_checkout_attempt(v_user, v_first) THEN
    RAISE EXCEPTION 'first reservation not admitted';
  END IF;
  IF NOT public.reserve_stripe_checkout_attempt(v_user, v_first) THEN
    RAISE EXCEPTION 'same attempt retry must be idempotent';
  END IF;
  IF public.reserve_stripe_checkout_attempt(v_user, v_second) THEN
    RAISE EXCEPTION 'distinct overlapping checkout admitted';
  END IF;
  UPDATE public.stripe_checkout_reservations SET expires_at = now() - interval '1 second'
   WHERE user_id = v_user;
  IF NOT public.reserve_stripe_checkout_attempt(v_user, v_second) THEN
    RAISE EXCEPTION 'expired reservation could not be replaced';
  END IF;
  IF public.reserve_stripe_checkout_attempt(v_user, v_first) THEN
    RAISE EXCEPTION 'stale attempt reclaimed active reservation';
  END IF;
  IF has_function_privilege('anon', 'public.reserve_stripe_checkout_attempt(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.reserve_stripe_checkout_attempt(uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.reserve_stripe_checkout_attempt(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'unexpected RPC execution grants';
  END IF;
END;
$$;
ROLLBACK;
