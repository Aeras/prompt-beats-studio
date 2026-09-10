ALTER TABLE public.ai_generations
  ADD COLUMN IF NOT EXISTS quality_check_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS ai_generations_quality_check_key_idx
  ON public.ai_generations(user_id, quality_check_key)
  WHERE quality_check_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ai_quality_check_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  quality_report JSONB,
  consumed_generation_id UUID REFERENCES public.ai_generations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_quality_check_actions_user_key UNIQUE (user_id, idempotency_key)
);

ALTER TABLE public.ai_quality_check_actions ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.ai_quality_check_actions
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_quality_check(_idempotency_key uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_action public.ai_quality_check_actions;
  v_stale_before timestamptz := now() - interval '15 minutes';
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  SELECT * INTO v_action
  FROM public.ai_quality_check_actions
  WHERE user_id = v_user AND idempotency_key = _idempotency_key
  FOR UPDATE;

  IF FOUND AND v_action.status = 'completed' THEN
    RETURN jsonb_build_object(
      'status', 'completed',
      'qualityReport', v_action.quality_report
    );
  END IF;

  IF FOUND AND v_action.status = 'processing' AND v_action.updated_at > v_stale_before THEN
    RETURN jsonb_build_object('status', 'processing');
  END IF;

  IF FOUND THEN
    UPDATE public.ai_quality_check_actions
    SET status = 'processing', quality_report = NULL, consumed_generation_id = NULL,
        updated_at = now()
    WHERE id = v_action.id;
    RETURN jsonb_build_object('status', 'claimed');
  END IF;

  INSERT INTO public.ai_quality_check_actions (user_id, idempotency_key, status)
  VALUES (v_user, _idempotency_key, 'processing');
  RETURN jsonb_build_object('status', 'claimed');
END;
$$;

CREATE OR REPLACE FUNCTION public.release_quality_check(_idempotency_key uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  UPDATE public.ai_quality_check_actions
  SET status = 'failed', updated_at = now()
  WHERE user_id = v_user AND idempotency_key = _idempotency_key AND status = 'processing';
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_quality_check(
  _idempotency_key uuid,
  _quality_report jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_used integer;
  v_action public.ai_quality_check_actions;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

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

  SELECT id INTO v_id
  FROM public.ai_generations
  WHERE user_id = v_user AND quality_check_key = _idempotency_key;
  IF FOUND THEN
    UPDATE public.ai_quality_check_actions
    SET status = 'completed', quality_report = _quality_report,
        consumed_generation_id = v_id, updated_at = now()
    WHERE id = v_action.id;
    RETURN v_id;
  END IF;

  IF NOT public.has_role(v_user, 'admin') THEN
    SELECT count(*) INTO v_used FROM public.ai_generations
    WHERE user_id = v_user AND created_at > now() - interval '1 hour';
    IF v_used >= 10 THEN
      RAISE EXCEPTION 'quality check rate limited';
    END IF;
  END IF;

  INSERT INTO public.ai_generations (user_id, quality_check_key)
  VALUES (v_user, _idempotency_key)
  RETURNING id INTO v_id;

  UPDATE public.ai_quality_check_actions
  SET status = 'completed', quality_report = _quality_report,
      consumed_generation_id = v_id, updated_at = now()
  WHERE id = v_action.id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_quality_check(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_quality_check(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_quality_check(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_quality_check(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_quality_check(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_quality_check(uuid, jsonb) TO authenticated;
