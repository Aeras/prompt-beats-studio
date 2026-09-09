CREATE TABLE public.ai_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  input_payload jsonb NOT NULL,
  result jsonb,
  error text,
  generation_id uuid,
  provider text,
  model text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT ai_generation_jobs_status_check CHECK (status IN ('pending','processing','completed','failed')),
  CONSTRAINT ai_generation_jobs_user_key UNIQUE (user_id, idempotency_key)
);

GRANT SELECT ON public.ai_generation_jobs TO authenticated;
GRANT ALL ON public.ai_generation_jobs TO service_role;

ALTER TABLE public.ai_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own generation jobs"
ON public.ai_generation_jobs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_ai_generation_jobs_updated_at
BEFORE UPDATE ON public.ai_generation_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX ai_generation_jobs_user_created_idx ON public.ai_generation_jobs (user_id, created_at DESC);
CREATE INDEX ai_generation_jobs_status_idx ON public.ai_generation_jobs (status, created_at);

CREATE OR REPLACE FUNCTION public.start_generation_job(_idempotency_key uuid, _input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_job public.ai_generation_jobs;
  v_used integer;
  v_gen uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Serializes concurrent Generate requests from the same user for the whole
  -- transaction: limit check + credit consumption + job creation are atomic.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  SELECT * INTO v_job FROM public.ai_generation_jobs
  WHERE user_id = v_user AND idempotency_key = _idempotency_key;
  IF FOUND THEN
    RETURN to_jsonb(v_job);
  END IF;

  SELECT * INTO v_job FROM public.ai_generation_jobs
  WHERE user_id = v_user AND status IN ('pending','processing')
    AND created_at > now() - interval '5 minutes'
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN to_jsonb(v_job);
  END IF;

  IF NOT public.has_role(v_user, 'admin') THEN
    SELECT count(*) INTO v_used FROM public.ai_generations
    WHERE user_id = v_user AND created_at > now() - interval '1 hour';
    IF v_used >= 10 THEN
      RETURN jsonb_build_object('rate_limited', true);
    END IF;
  END IF;

  INSERT INTO public.ai_generations (user_id) VALUES (v_user) RETURNING id INTO v_gen;

  INSERT INTO public.ai_generation_jobs (user_id, idempotency_key, status, input_payload, generation_id)
  VALUES (v_user, _idempotency_key, 'pending', _input, v_gen)
  RETURNING * INTO v_job;

  RETURN to_jsonb(v_job);
END;
$$;

REVOKE ALL ON FUNCTION public.start_generation_job(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_generation_job(uuid, jsonb) TO authenticated;