-- Stripe webhook hardening: durable replay protection, event ordering, and
-- trusted price-based entitlement. Checkout/webhook application code is the
-- only caller; browsers have no direct access to these objects.
BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS last_stripe_event_created_at bigint,
  ADD COLUMN IF NOT EXISTS last_stripe_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_customer_id_unique
  ON public.subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_unique
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  stripe_created_at bigint NOT NULL CHECK (stripe_created_at >= 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  outcome text NOT NULL DEFAULT 'received'
    CHECK (outcome IN ('received', 'applied', 'stale', 'ignored'))
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_received_at_idx
  ON public.stripe_webhook_events (received_at DESC);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.stripe_webhook_events TO service_role;

CREATE OR REPLACE FUNCTION public.process_stripe_subscription_event(
  _event_id text,
  _event_type text,
  _event_created bigint,
  _customer_id text,
  _subscription_id text,
  _subscription_status text,
  _current_period_end timestamptz,
  _price_id text,
  _approved_pro_price_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_incoming_plan text;
BEGIN
  IF COALESCE(trim(_event_id), '') = ''
    OR COALESCE(trim(_customer_id), '') = ''
    OR COALESCE(trim(_subscription_id), '') = ''
    OR _event_created < 0
  THEN
    RAISE EXCEPTION 'invalid Stripe event';
  END IF;

  v_incoming_plan := CASE
    WHEN _subscription_status IN ('active', 'trialing')
      AND NULLIF(_price_id, '') = NULLIF(_approved_pro_price_id, '')
    THEN 'pro'
    ELSE 'free'
  END;

  INSERT INTO public.stripe_webhook_events (stripe_event_id, event_type, stripe_created_at)
  VALUES (_event_id, _event_type, _event_created)
  ON CONFLICT (stripe_event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN 'duplicate';
  END IF;

  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE stripe_customer_id = _customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.stripe_webhook_events
    SET outcome = 'ignored', processed_at = now()
    WHERE stripe_event_id = _event_id;
    RETURN 'ignored';
  END IF;

  IF v_subscription.last_stripe_event_created_at IS NOT NULL
     AND _event_created < v_subscription.last_stripe_event_created_at
  THEN
    UPDATE public.stripe_webhook_events
    SET outcome = 'stale', processed_at = now()
    WHERE stripe_event_id = _event_id;
    RETURN 'stale';
  END IF;

  -- Stripe event timestamps are second-granularity, so an equal timestamp
  -- cannot prove delivery order. Make the entitlement monotonic within that
  -- second: a valid downgrade applies, while a later same-second upgrade is
  -- ignored. This makes the least-privileged entitlement win regardless of
  -- webhook delivery order without pretending event IDs are chronological.
  IF v_subscription.last_stripe_event_created_at = _event_created THEN
    IF v_subscription.plan = 'pro' AND v_incoming_plan = 'free' THEN
      UPDATE public.subscriptions
      SET stripe_subscription_id = _subscription_id,
          stripe_price_id = NULLIF(_price_id, ''),
          status = COALESCE(NULLIF(_subscription_status, ''), 'inactive'),
          plan = 'free',
          current_period_end = _current_period_end,
          last_stripe_event_id = _event_id,
          updated_at = now()
      WHERE id = v_subscription.id;

      UPDATE public.stripe_webhook_events
      SET outcome = 'applied', processed_at = now()
      WHERE stripe_event_id = _event_id;
      RETURN 'applied';
    END IF;

    UPDATE public.stripe_webhook_events
    SET outcome = 'ignored', processed_at = now()
    WHERE stripe_event_id = _event_id;
    RETURN 'ignored';
  END IF;

  UPDATE public.subscriptions
  SET stripe_subscription_id = _subscription_id,
      stripe_price_id = NULLIF(_price_id, ''),
      status = COALESCE(NULLIF(_subscription_status, ''), 'inactive'),
      plan = v_incoming_plan,
      current_period_end = _current_period_end,
      last_stripe_event_created_at = _event_created,
      last_stripe_event_id = _event_id,
      updated_at = now()
  WHERE id = v_subscription.id;

  UPDATE public.stripe_webhook_events
  SET outcome = 'applied', processed_at = now()
  WHERE stripe_event_id = _event_id;

  RETURN 'applied';
END;
$$;

REVOKE ALL ON FUNCTION public.process_stripe_subscription_event(text, text, bigint, text, text, text, timestamptz, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_stripe_subscription_event(text, text, bigint, text, text, text, timestamptz, text, text)
  TO service_role;

COMMIT;
