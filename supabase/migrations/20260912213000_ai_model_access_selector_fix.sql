ALTER TABLE public.ai_quality_check_actions
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model text;

INSERT INTO public.app_settings (key, value)
VALUES ('ai_model', '{"model":"gemini-3-flash-preview"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

UPDATE public.app_settings
SET value = '{"model":"gemini-3-flash-preview"}'::jsonb
WHERE key = 'ai_model'
  AND COALESCE(value->>'model', '') NOT IN (
    'gemini-3-flash-preview',
    'gemini-3.6-flash',
    'gemini-3.8-flash',
    'gemini-3.1-pro-preview',
    'claude-sonnet-5',
    'claude-opus-5',
    'claude-fable-5'
  );

CREATE OR REPLACE FUNCTION public.claim_quality_check(_idempotency_key uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_action public.ai_quality_check_actions;
  v_used integer;
  v_reserved integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.has_valid_account_state(v_user) THEN
    RAISE EXCEPTION 'account is not available';
  END IF;

  PERFORM public._lock_user_security_state(v_user);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  SELECT * INTO v_action
  FROM public.ai_quality_check_actions
  WHERE user_id = v_user AND idempotency_key = _idempotency_key
  FOR UPDATE;

  IF FOUND AND v_action.status = 'completed' THEN
    RETURN jsonb_build_object(
      'status', 'completed',
      'qualityReport', v_action.quality_report,
      'provider', v_action.provider,
      'model', v_action.model
    );
  END IF;

  IF FOUND AND v_action.status = 'failed' AND v_action.provider_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'failed');
  END IF;

  IF FOUND AND v_action.status = 'processing'
     AND (v_action.provider_started_at IS NOT NULL
          OR v_action.updated_at > now() - interval '15 minutes') THEN
    RETURN jsonb_build_object('status', 'processing');
  END IF;

  IF NOT public.has_role(v_user, 'admin') THEN
    SELECT count(*)::integer INTO v_used
    FROM public.ai_generations
    WHERE user_id = v_user AND created_at > now() - interval '1 hour';

    SELECT count(*)::integer INTO v_reserved
    FROM public.ai_quality_check_actions
    WHERE user_id = v_user AND status = 'processing'
      AND (v_action.id IS NULL OR id <> v_action.id);

    IF v_used + v_reserved >= 10 THEN
      RETURN jsonb_build_object('status', 'rate_limited');
    END IF;
  END IF;

  IF FOUND THEN
    UPDATE public.ai_quality_check_actions
    SET status = 'processing',
        quality_report = NULL,
        consumed_generation_id = NULL,
        provider_started_at = NULL,
        provider = NULL,
        model = NULL,
        updated_at = now()
    WHERE id = v_action.id;
    RETURN jsonb_build_object('status', 'claimed');
  END IF;

  INSERT INTO public.ai_quality_check_actions (user_id, idempotency_key, status)
  VALUES (v_user, _idempotency_key, 'processing');
  RETURN jsonb_build_object('status', 'claimed');
END;
$$;

DROP FUNCTION IF EXISTS public.consume_quality_check(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.consume_quality_check(
  _idempotency_key uuid,
  _quality_report jsonb,
  _provider text,
  _model text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_action public.ai_quality_check_actions;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.has_valid_account_state(v_user) THEN
    RAISE EXCEPTION 'account is not available';
  END IF;
  IF COALESCE(trim(_provider), '') = '' OR COALESCE(trim(_model), '') = '' THEN
    RAISE EXCEPTION 'quality check model metadata is required';
  END IF;

  PERFORM public._lock_user_security_state(v_user);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  SELECT * INTO v_action
  FROM public.ai_quality_check_actions
  WHERE user_id = v_user AND idempotency_key = _idempotency_key
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quality check action was not claimed';
  END IF;
  IF v_action.status <> 'processing' THEN
    RAISE EXCEPTION 'quality check action is not processing';
  END IF;
  IF v_action.provider_started_at IS NULL THEN
    RAISE EXCEPTION 'quality check provider was not started';
  END IF;

  SELECT id INTO v_id
  FROM public.ai_generations
  WHERE user_id = v_user AND quality_check_key = _idempotency_key;
  IF FOUND THEN
    UPDATE public.ai_quality_check_actions
    SET status = 'completed',
        quality_report = _quality_report,
        consumed_generation_id = v_id,
        provider = _provider,
        model = _model,
        updated_at = now()
    WHERE id = v_action.id;
    RETURN v_id;
  END IF;

  INSERT INTO public.ai_generations (user_id, quality_check_key)
  VALUES (v_user, _idempotency_key)
  RETURNING id INTO v_id;

  UPDATE public.ai_quality_check_actions
  SET status = 'completed',
      quality_report = _quality_report,
      consumed_generation_id = v_id,
      provider = _provider,
      model = _model,
      updated_at = now()
  WHERE id = v_action.id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_quality_check(uuid, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_quality_check(uuid, jsonb, text, text) TO authenticated;
