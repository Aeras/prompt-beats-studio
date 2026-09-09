
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.ai_generation_jobs
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

-- Where the durable runner lives. Kept in app_settings (no anon/authenticated access).
INSERT INTO public.app_settings(key, value)
VALUES ('runner_url', to_jsonb('https://project--5e47f960-74f1-4eda-9749-0196542f1025.lovable.app/api/public/jobs/run'::text))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO public.app_settings(key, value)
VALUES ('runner_token', to_jsonb(gen_random_uuid()::text))
ON CONFLICT (key) DO NOTHING;

-- Durable start signal. This runs inside the database (pg_net background worker),
-- so it is completely independent of the browser request that created the job.
CREATE OR REPLACE FUNCTION public.kick_generation_runner(_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_token text;
BEGIN
  SELECT value #>> '{}' INTO v_url FROM public.app_settings WHERE key = 'runner_url';
  SELECT value #>> '{}' INTO v_token FROM public.app_settings WHERE key = 'runner_token';
  IF v_url IS NULL OR v_token IS NULL THEN RETURN; END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-runner-token', v_token),
    body := jsonb_build_object('jobId', _job_id),
    timeout_milliseconds := 170000
  );
EXCEPTION WHEN OTHERS THEN
  -- The scheduled sweep is the backstop; never fail job creation over this.
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.kick_generation_runner(uuid) FROM PUBLIC, anon, authenticated;

-- Sweep: start jobs nobody picked up yet (safe: the provider was not called).
CREATE OR REPLACE FUNCTION public.sweep_generation_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job record;
  v_count integer := 0;
BEGIN
  -- A claimed job that never finished is failed, never retried: the provider
  -- call may already have happened and could be billable.
  UPDATE public.ai_generation_jobs
  SET status = 'failed',
      error = 'The generation did not finish in time. Please try again.',
      completed_at = now()
  WHERE status = 'processing'
    AND started_at < now() - interval '5 minutes';

  FOR v_job IN
    SELECT id FROM public.ai_generation_jobs
    WHERE status = 'pending'
      AND dismissed_at IS NULL
      AND created_at > now() - interval '30 minutes'
    ORDER BY created_at
    LIMIT 10
  LOOP
    PERFORM public.kick_generation_runner(v_job.id);
    v_count := v_count + 1;
  END LOOP;

  -- A pending job nobody ever ran (runner unreachable) must not hang forever.
  UPDATE public.ai_generation_jobs
  SET status = 'failed',
      error = 'The generation could not be started. Please try again.',
      completed_at = now()
  WHERE status = 'pending'
    AND created_at < now() - interval '30 minutes';

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_generation_jobs() FROM PUBLIC, anon, authenticated;

-- Explicit dismissal: the Generator forgets this job and never recovers it.
CREATE OR REPLACE FUNCTION public.dismiss_generation_job(_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.ai_generation_jobs
  SET dismissed_at = COALESCE(dismissed_at, now()),
      status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END
  WHERE id = _job_id AND user_id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_generation_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_generation_job(uuid) TO authenticated;

-- Job creation: unchanged credit/idempotency semantics, but dismissed jobs no
-- longer block a new generation, and the durable runner is signalled by the
-- database itself instead of by the browser.
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

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  SELECT * INTO v_job FROM public.ai_generation_jobs
  WHERE user_id = v_user AND idempotency_key = _idempotency_key;
  IF FOUND THEN
    RETURN to_jsonb(v_job);
  END IF;

  SELECT * INTO v_job FROM public.ai_generation_jobs
  WHERE user_id = v_user AND status IN ('pending','processing')
    AND dismissed_at IS NULL
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

  PERFORM public.kick_generation_runner(v_job.id);

  RETURN to_jsonb(v_job);
END;
$$;
