-- Disposable local database only. All fixtures and assertions roll back.
BEGIN;
INSERT INTO public.ai_models(provider,provider_model_id,display_name,pricing_status,
 input_price_per_million,output_price_per_million,cached_input_price_per_million)
 VALUES ('openai','fixture','Offline usage fixture','verified',2,10,0.5);
INSERT INTO public.ai_models(provider,provider_model_id,display_name,pricing_status,
 input_price_per_million,output_price_per_million,cached_input_price_per_million,cache_write_price_per_million)
 VALUES ('anthropic','fixture-anthropic','Offline Anthropic cache fixture','verified',2,10,0.5,2.5);
INSERT INTO auth.users(id,email) VALUES
 ('11111111-1111-4111-8111-111111111111','usage-owner@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','usage-other@example.invalid');
DO $$
DECLARE p jsonb; n integer; blocked boolean := false; ids uuid[]; token uuid;
 receipt uuid := '33333333-3333-4333-8333-333333333333';
BEGIN
  IF has_table_privilege('anon','public.ai_provider_executions','SELECT')
    OR has_table_privilege('authenticated','public.ai_provider_executions','INSERT')
    OR has_function_privilege('authenticated','public.settle_ai_usage_internal(jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.claim_ai_execution_recovery_internal()','EXECUTE')
  THEN RAISE EXCEPTION 'client role can access internal execution evidence'; END IF;
  PERFORM public.begin_ai_execution_internal(receipt,'11111111-1111-4111-8111-111111111111',
    'generate','openai','fixture',NULL,NULL,NULL);
  IF NOT EXISTS (SELECT 1 FROM public.ai_provider_executions WHERE id=receipt AND state='execution_unknown')
    THEN RAISE EXCEPTION 'dispatch ambiguity not durable'; END IF;
  p := jsonb_build_object('id',receipt,'user_id','11111111-1111-4111-8111-111111111111',
    'provider','openai','model','fixture','operation','generate','provider_usage_state','unknown','success',false);
  PERFORM public.settle_ai_usage_internal(p);
  IF EXISTS (SELECT 1 FROM public.ai_usage_logs WHERE id=receipt AND
    (total_tokens IS NOT NULL OR estimated_cost_usd IS NOT NULL))
    THEN RAISE EXCEPTION 'unknown usage fabricated zero'; END IF;
  p := p || jsonb_build_object('input_tokens',100,'output_tokens',20,'total_tokens',120,
    'reasoning_tokens',10,'cached_input_tokens',25,'provider_reported_cost_usd',0.012,
    'provider_usage_state','final','success',true);
  PERFORM public.settle_ai_usage_internal(p);
  PERFORM public.settle_ai_usage_internal(p); -- commit ACK loss / duplicate completion
  SELECT count(*) INTO n FROM public.ai_usage_logs WHERE id=receipt;
  IF n <> 1 THEN RAISE EXCEPTION 'duplicate execution accounting'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_usage_logs WHERE id=receipt
    AND input_tokens=100 AND output_tokens=20 AND total_tokens=120 AND reasoning_tokens=10
    AND cached_input_tokens=25 AND provider_reported_cost_usd=0.012 AND provider_usage_state='final')
    THEN RAISE EXCEPTION 'receipt attribution lost or reasoning counted twice'; END IF;
  IF (SELECT estimated_cost_usd FROM public.ai_usage_logs WHERE id=receipt) <> 0.000363
    THEN RAISE EXCEPTION 'estimate must use cached split and must not add reasoning twice'; END IF;
  PERFORM public.settle_ai_usage_internal(p || jsonb_build_object('input_tokens',NULL,'output_tokens',NULL,'total_tokens',NULL,'provider_usage_state','unknown'));
  IF NOT EXISTS (SELECT 1 FROM public.ai_usage_logs WHERE id=receipt AND output_tokens=20)
    THEN RAISE EXCEPTION 'late unknown receipt erased real usage'; END IF;
  BEGIN
    PERFORM public.settle_ai_usage_internal(p || jsonb_build_object('user_id','22222222-2222-4222-8222-222222222222'));
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'cross-owner receipt reuse accepted'; END IF;
  INSERT INTO public.ai_usage_outbox(id,payload) VALUES (receipt,p);
  PERFORM public.flush_ai_usage_outbox(5);
  SELECT count(*) INTO n FROM public.ai_usage_logs WHERE id=receipt;
  IF n <> 1 OR EXISTS (SELECT 1 FROM public.ai_usage_outbox WHERE id=receipt)
    THEN RAISE EXCEPTION 'outbox replay duplicated spend'; END IF;
  PERFORM public.settle_ai_usage_internal(p || jsonb_build_object('id','44444444-4444-4444-8444-444444444444'));
  IF (SELECT sum(total_tokens) FROM public.ai_usage_logs WHERE id IN (receipt,'44444444-4444-4444-8444-444444444444')) <> 240
    THEN RAISE EXCEPTION 'genuine second execution not aggregated separately'; END IF;
  IF EXISTS (SELECT 1 FROM public.ai_usage_logs WHERE user_id='22222222-2222-4222-8222-222222222222')
    THEN RAISE EXCEPTION 'usage contaminated another account'; END IF;
  PERFORM public.settle_ai_usage_internal(p || jsonb_build_object(
    'id','99999999-9999-4999-8999-999999999999','provider','anthropic','model','fixture-anthropic',
    'input_tokens',100,'cached_input_tokens',80,'cache_write_tokens',10,
    'output_tokens',20,'total_tokens',120,'reasoning_tokens',NULL,'provider_reported_cost_usd',NULL));
  IF (SELECT estimated_cost_usd FROM public.ai_usage_logs WHERE id='99999999-9999-4999-8999-999999999999') <> 0.000285
    THEN RAISE EXCEPTION 'Anthropic normalized total must price each cache subset once'; END IF;
  PERFORM public.settle_ai_usage_internal(p || jsonb_build_object(
    'id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','provider_usage_state','partial'));
  PERFORM public.settle_ai_usage_internal(p || jsonb_build_object(
    'id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','provider_usage_state','final',
    'input_tokens',NULL,'output_tokens',NULL,'total_tokens',NULL,'reasoning_tokens',NULL,'cached_input_tokens',NULL));
  IF NOT EXISTS (SELECT 1 FROM public.ai_usage_logs WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    AND input_tokens=100 AND output_tokens=20 AND total_tokens=120 AND reasoning_tokens=10 AND cached_input_tokens=25)
    THEN RAISE EXCEPTION 'terminal response without receipt erased partial evidence'; END IF;
  UPDATE public.ai_provider_executions SET next_recovery_at=now()-interval '1 second' WHERE id=receipt;
  SELECT array_agg(id) INTO ids FROM public.claim_ai_execution_recovery_internal();
  IF NOT receipt=ANY(ids) THEN RAISE EXCEPTION 'recovery claim missing'; END IF;
  IF EXISTS (SELECT 1 FROM public.claim_ai_execution_recovery_internal() WHERE id=receipt)
    THEN RAISE EXCEPTION 'concurrent recovery lease reused'; END IF;
  PERFORM public.release_ai_execution_recovery_internal(receipt,gen_random_uuid());
  IF NOT EXISTS (SELECT 1 FROM public.ai_provider_executions WHERE id=receipt AND lease_token IS NOT NULL)
    THEN RAISE EXCEPTION 'wrong worker released lease'; END IF;
  UPDATE public.ai_provider_executions SET recovery_attempts=8,lease_until=now()-interval '1 second',
    next_recovery_at=now()-interval '1 second' WHERE id=receipt;
  IF EXISTS (SELECT 1 FROM public.claim_ai_execution_recovery_internal() WHERE id=receipt)
    THEN RAISE EXCEPTION 'unbounded recovery retries'; END IF;
  INSERT INTO public.ai_generation_jobs(id,user_id,idempotency_key,status,input_payload,started_at)
    VALUES ('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111',
      gen_random_uuid(),'processing','{"operation":"generate"}',now()-interval '20 minutes');
  receipt := '88888888-8888-4888-8888-888888888888';
  PERFORM public.begin_ai_execution_internal(receipt,'11111111-1111-4111-8111-111111111111',
    'generate','openai','fixture',NULL,'77777777-7777-4777-8777-777777777777',NULL);
  UPDATE public.ai_provider_executions SET created_at=now()-interval '20 minutes',
    next_recovery_at=now()-interval '1 second' WHERE id=receipt;
  PERFORM public.claim_ai_execution_recovery_internal();
  SELECT lease_token INTO token FROM public.ai_provider_executions WHERE id=receipt;
  PERFORM public.release_ai_execution_recovery_internal(receipt,token);
  IF (SELECT status FROM public.ai_generation_jobs WHERE id='77777777-7777-4777-8777-777777777777') <> 'processing'
    THEN RAISE EXCEPTION 'live long-running transport was failed prematurely'; END IF;
  UPDATE public.ai_provider_executions SET created_at=now()-interval '46 minutes',
    next_recovery_at=now()-interval '1 second' WHERE id=receipt;
  PERFORM public.claim_ai_execution_recovery_internal();
  SELECT lease_token INTO token FROM public.ai_provider_executions WHERE id=receipt;
  PERFORM public.release_ai_execution_recovery_internal(receipt,token);
  IF (SELECT status FROM public.ai_generation_jobs WHERE id='77777777-7777-4777-8777-777777777777') <> 'failed'
    THEN RAISE EXCEPTION 'unrecoverable orphan remained processing forever'; END IF;
  PERFORM public.checkpoint_ai_execution_internal(receipt,'11111111-1111-4111-8111-111111111111',
    '{"text":"recovered output","usage":null,"provider":"openai","model":"fixture","stopReason":"end_turn"}');
  IF public.claim_ai_recovered_job_internal('generate','77777777-7777-4777-8777-777777777777') IS NULL
    THEN RAISE EXCEPTION 'late provider result could not be safely claimed'; END IF;
  IF public.claim_ai_recovered_job_internal('generate','77777777-7777-4777-8777-777777777777') IS NOT NULL
    THEN RAISE EXCEPTION 'two workers claimed the same application recovery'; END IF;
  UPDATE public.ai_generation_jobs SET cancel_requested_at=now(),recovery_until=NULL
    WHERE id='77777777-7777-4777-8777-777777777777';
  IF public.claim_ai_recovered_job_internal('generate','77777777-7777-4777-8777-777777777777') IS NOT NULL
    THEN RAISE EXCEPTION 'cancelled work selected for application publication'; END IF;
  PERFORM public.settle_ai_usage_internal(p || jsonb_build_object('id',receipt));
  PERFORM public.claim_ai_execution_recovery_internal();
  SELECT lease_token INTO token FROM public.ai_provider_executions WHERE id=receipt;
  PERFORM public.release_ai_execution_recovery_internal(receipt,token);
  IF (SELECT status FROM public.ai_generation_jobs WHERE id='77777777-7777-4777-8777-777777777777') <> 'cancelled'
    THEN RAISE EXCEPTION 'orphan cancellation remained processing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_usage_logs WHERE id=receipt AND total_tokens=120)
    THEN RAISE EXCEPTION 'cancelled application lost observed provider usage'; END IF;
  INSERT INTO public.ai_generation_jobs(id,user_id,idempotency_key,status,input_payload,started_at,provider_started_at)
    VALUES ('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',
      gen_random_uuid(),'processing','{}',now()-interval '46 minutes',now()-interval '46 minutes'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
      gen_random_uuid(),'processing','{}',now()-interval '20 minutes',now()-interval '20 minutes');
  PERFORM public.reap_unjournaled_ai_jobs_internal();
  IF NOT EXISTS (SELECT 1 FROM public.ai_generation_jobs WHERE id='99999999-9999-4999-8999-999999999999'
    AND status='failed' AND error LIKE '%unknown%')
    THEN RAISE EXCEPTION 'unjournaled orphan not classified honestly'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_generation_jobs WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    AND status='processing')
    THEN RAISE EXCEPTION 'unjournaled live request failed prematurely'; END IF;
END;
$$;
ROLLBACK;
