-- Disposable local database only. All fixtures and assertions roll back.
BEGIN;
INSERT INTO public.ai_models(provider,provider_model_id,display_name,pricing_status,
 input_price_per_million,output_price_per_million,cached_input_price_per_million)
 VALUES ('openai','fixture','Offline usage fixture','verified',2,10,0.5);
INSERT INTO auth.users(id,email) VALUES
 ('11111111-1111-4111-8111-111111111111','usage-owner@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','usage-other@example.invalid');
DO $$
DECLARE p jsonb; n integer; blocked boolean := false; ids uuid[]; receipt uuid := '33333333-3333-4333-8333-333333333333';
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
END;
$$;
ROLLBACK;
