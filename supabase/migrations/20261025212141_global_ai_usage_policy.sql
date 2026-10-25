BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.global_ai_usage_policy(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT true,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
 updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid);
ALTER TABLE public.global_ai_usage_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.global_ai_usage_policy FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO public.global_ai_usage_policy(singleton) VALUES(true);

CREATE FUNCTION public.admit_global_ai_dispatch_internal() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed boolean;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Fresh AI policy transaction required' USING ERRCODE='40001'; END IF;
 SELECT enabled INTO allowed FROM public.global_ai_usage_policy WHERE singleton FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AI usage policy unavailable'; END IF;
 IF NOT allowed THEN RAISE EXCEPTION 'AI is temporarily disabled by an administrator. Please try again later.' USING ERRCODE='PT423'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.admit_global_ai_dispatch_internal() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admit_global_ai_dispatch_internal() TO service_role;

CREATE FUNCTION public.admin_get_global_ai_usage() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE policy public.global_ai_usage_policy;
BEGIN
 PERFORM public.assert_ai_model_admin();
 SELECT * INTO STRICT policy FROM public.global_ai_usage_policy WHERE singleton;
 RETURN to_jsonb(policy)-'singleton'-'updated_by';
END $$;
CREATE FUNCTION public.admin_set_global_ai_usage(_enabled boolean,_expected_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE policy public.global_ai_usage_policy; previous boolean;
BEGIN
 PERFORM public.assert_ai_model_admin();
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Fresh AI policy transaction required' USING ERRCODE='40001'; END IF;
 IF _enabled IS NULL OR _expected_revision IS NULL OR _expected_revision NOT BETWEEN 0 AND 9007199254740991 THEN RAISE EXCEPTION 'Invalid AI policy'; END IF;
 SELECT * INTO STRICT policy FROM public.global_ai_usage_policy WHERE singleton FOR UPDATE;
 IF policy.revision<>_expected_revision THEN RAISE EXCEPTION 'AI policy changed. Refresh and retry.' USING ERRCODE='PT409'; END IF;
 IF policy.enabled IS DISTINCT FROM _enabled THEN
  previous:=policy.enabled;
  UPDATE public.global_ai_usage_policy SET enabled=_enabled,revision=revision+1,updated_at=now(),updated_by=auth.uid() WHERE singleton RETURNING * INTO policy;
  INSERT INTO public.admin_audit_log(admin_user_id,action,details) VALUES(auth.uid(),'UPDATE_AI_MODEL',jsonb_build_object('operation','global_ai_usage','previous_enabled',previous,'enabled',policy.enabled,'revision',policy.revision));
 END IF;
 RETURN to_jsonb(policy)-'singleton'-'updated_by';
END $$;
REVOKE ALL ON FUNCTION public.admin_get_global_ai_usage(),public.admin_set_global_ai_usage(boolean,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_global_ai_usage(),public.admin_set_global_ai_usage(boolean,bigint) TO authenticated;

-- Deny new queued work/claims atomically before their admission transaction
-- consumes quotas. Completion, cancellation, polling and receipts stay writable.
CREATE FUNCTION public.guard_global_ai_work_admission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status NOT IN ('pending','processing') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME<>'ai_auxiliary_requests' AND to_jsonb(NEW)->>'recovery_until' IS NOT NULL AND EXISTS(SELECT 1 FROM public.ai_provider_executions e WHERE e.result IS NOT NULL AND ((TG_TABLE_NAME='ai_generation_jobs' AND e.job_id=NEW.id) OR (TG_TABLE_NAME='ai_quality_check_actions' AND e.quality_action_id=NEW.id))) THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN PERFORM public.admit_global_ai_dispatch_internal();
 ELSIF NEW.status IS DISTINCT FROM OLD.status OR
  (TG_TABLE_NAME='ai_auxiliary_requests' AND to_jsonb(NEW)->>'execution_token' IS DISTINCT FROM to_jsonb(OLD)->>'execution_token') THEN
  PERFORM public.admit_global_ai_dispatch_internal();
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_global_ai_work_admission() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['ai_generation_jobs','ai_quality_check_actions','ai_auxiliary_requests'] LOOP
  EXECUTE format('CREATE TRIGGER guard_global_ai_work_admission BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_global_ai_work_admission()',tab);
 END LOOP;
END $$;
COMMIT;
