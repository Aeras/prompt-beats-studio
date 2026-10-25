BEGIN;
SET LOCAL lock_timeout='5s';
-- A model-specific dispatch admission, not a financial receipt or a provider invoice.
CREATE TABLE public.ai_auxiliary_model_uses(
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES public.ai_auxiliary_requests(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,model text NOT NULL CHECK(length(model) BETWEEN 1 AND 240),
 receipt_id uuid UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ai_auxiliary_model_uses_model ON public.ai_auxiliary_model_uses(model,request_id);
CREATE INDEX ai_auxiliary_model_uses_request ON public.ai_auxiliary_model_uses(request_id);
CREATE INDEX ai_auxiliary_model_uses_user ON public.ai_auxiliary_model_uses(user_id);
ALTER TABLE public.ai_auxiliary_model_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_auxiliary_model_uses FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ai_model_registry_fence BEFORE INSERT OR UPDATE OR DELETE ON public.ai_auxiliary_model_uses FOR EACH STATEMENT EXECUTE FUNCTION public.ai_model_registry_fence();

CREATE FUNCTION public.auxiliary_model_use_start_internal(_user_id uuid,_operation text,_request_key uuid,_execution_token uuid,_model text,_use_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request public.ai_auxiliary_requests;
BEGIN
 PERFORM public._lock_user_security_state(_user_id);
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('pb:ai-model-registry:v1',0));
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Fresh transaction required' USING ERRCODE='40001'; END IF;
 IF _model IS NULL OR length(_model) NOT BETWEEN 1 AND 240 OR _use_id IS NULL THEN RAISE EXCEPTION 'Model identity required'; END IF;
 IF EXISTS(SELECT 1 FROM public.ai_model_uninstall_guard WHERE provider_model_id=_model) THEN RAISE EXCEPTION 'Model is no longer installed'; END IF;
 SELECT * INTO request FROM public.ai_auxiliary_requests WHERE user_id=_user_id AND operation=_operation AND request_key=_request_key FOR UPDATE;
 IF NOT FOUND OR request.status<>'processing' OR request.execution_token IS DISTINCT FROM _execution_token OR _execution_token IS NULL THEN RAISE EXCEPTION 'Auxiliary claim lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users a JOIN public.profile_private p ON p.user_id=a.id WHERE a.id=_user_id AND NOT p.is_banned AND a.deleted_at IS NULL AND (a.banned_until IS NULL OR a.banned_until<=now())) THEN RAISE EXCEPTION 'Account unavailable'; END IF;
 INSERT INTO public.ai_auxiliary_model_uses(id,request_id,user_id,model) VALUES(_use_id,request.id,_user_id,_model);
 UPDATE public.ai_auxiliary_requests SET provider_started_at=coalesce(provider_started_at,now()),updated_at=now() WHERE id=request.id;
 RETURN true;
END $$;
-- Old servers must not dispatch without model identity after cutover. Existing
-- unlabelled historical rows are retained; release requires draining old workers.
CREATE OR REPLACE FUNCTION public.mark_auxiliary_ai_provider_started_internal(_user_id uuid,_operation text,_request_key uuid,_execution_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Upgrade required: model-aware auxiliary admission'; END $$;

CREATE FUNCTION public.auxiliary_model_use_receipt_internal(_use_id uuid,_receipt_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u public.ai_auxiliary_model_uses;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('pb:ai-model-registry:v1',0));
 SELECT * INTO u FROM public.ai_auxiliary_model_uses WHERE id=_use_id FOR UPDATE;
 IF NOT FOUND OR _receipt_id IS NULL OR (u.receipt_id IS NOT NULL AND u.receipt_id<>_receipt_id) THEN RAISE EXCEPTION 'Invalid usage association'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_usage_logs WHERE id=_receipt_id AND user_id=u.user_id AND model=u.model)
 AND NOT EXISTS(SELECT 1 FROM public.ai_usage_outbox WHERE id=_receipt_id AND payload->>'user_id'=u.user_id::text AND payload->>'model'=u.model) THEN RAISE EXCEPTION 'Usage not durably recorded'; END IF;
 UPDATE public.ai_auxiliary_model_uses SET receipt_id=_receipt_id WHERE id=_use_id;
END $$;
REVOKE ALL ON FUNCTION public.auxiliary_model_use_start_internal(uuid,text,uuid,uuid,text,uuid),public.auxiliary_model_use_receipt_internal(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.auxiliary_model_use_start_internal(uuid,text,uuid,uuid,text,uuid),public.auxiliary_model_use_receipt_internal(uuid,uuid) TO service_role;

CREATE FUNCTION public.ai_legacy_fallback_safe(_removed text[]) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.app_settings WHERE key='ai_model' AND value->>'model'=ANY(_removed)) THEN RETURN true; END IF;
 IF (SELECT count(*)=3 FROM (VALUES('ai_generator_default_model',false),('ai_tools_default_model',false),('ai_quality_check_default_model',true)) keys(k,q)
 JOIN public.app_settings s ON s.key=keys.k JOIN public.ai_models m ON m.provider_model_id=s.value->>'model'
 WHERE m.status='enabled' AND NOT(m.provider_model_id=ANY(_removed)) AND CASE WHEN keys.q THEN m.quality_check_compatible AND m.quality_check_enabled ELSE m.generator_compatible AND m.generator_enabled END) THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM public.ai_models WHERE NOT(provider_model_id=ANY(_removed)) AND status='enabled' AND generator_compatible AND generator_enabled AND quality_check_compatible AND quality_check_enabled);
END $$;
CREATE FUNCTION public.reconcile_ai_legacy_fallback(_removed text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE replacement public.ai_models;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.app_settings WHERE key='ai_model' AND value->>'model'=ANY(_removed)) THEN RETURN; END IF;
 IF NOT public.ai_legacy_fallback_safe(_removed) THEN RAISE EXCEPTION 'Configure active operation defaults before removing the last fallback'; END IF;
 -- The three authoritative operation settings are never changed.
 IF (SELECT count(*)=3 FROM (VALUES('ai_generator_default_model',false),('ai_tools_default_model',false),('ai_quality_check_default_model',true)) keys(k,q)
 JOIN public.app_settings s ON s.key=keys.k JOIN public.ai_models m ON m.provider_model_id=s.value->>'model'
 WHERE m.status='enabled' AND NOT(m.provider_model_id=ANY(_removed)) AND CASE WHEN keys.q THEN m.quality_check_compatible AND m.quality_check_enabled ELSE m.generator_compatible AND m.generator_enabled END) THEN
  DELETE FROM public.app_settings WHERE key='ai_model';
 ELSE
  SELECT * INTO replacement FROM public.ai_models WHERE NOT(provider_model_id=ANY(_removed)) AND status='enabled' AND generator_compatible AND generator_enabled AND quality_check_compatible AND quality_check_enabled ORDER BY id LIMIT 1 FOR UPDATE;
  UPDATE public.app_settings SET value=jsonb_build_object('registryId',replacement.id,'model',replacement.provider_model_id),updated_at=now() WHERE key='ai_model';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.ai_legacy_fallback_safe(text[]),public.reconcile_ai_legacy_fallback(text[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ai_model_uninstall_reasons(_model public.ai_models) RETURNS text[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE reasons text[]:='{}'; k text;
BEGIN
 FOR k IN SELECT key FROM public.app_settings WHERE key IN ('ai_generator_default_model','ai_quality_check_default_model','ai_tools_default_model')
  AND (value->>'model'=_model.provider_model_id OR value->>'registryId'=_model.id::text) LOOP
  reasons:=array_append(reasons,'default:'||k);
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.ai_generation_jobs WHERE status IN ('pending','processing') AND coalesce(model,input_payload->>'generationModel',input_payload->>'model')=_model.provider_model_id)
  OR EXISTS(SELECT 1 FROM public.ai_quality_check_actions WHERE status IN ('pending','processing') AND coalesce(model,input_payload->>'qualityCheckModel',input_payload->>'model')=_model.provider_model_id) THEN reasons:=array_append(reasons,'active_jobs'); END IF;
 IF EXISTS(SELECT 1 FROM public.ai_provider_executions e WHERE e.model=_model.provider_model_id AND (
  e.state IN ('execution_unknown','accepted') OR (e.result IS NOT NULL AND e.application_recovery_attempts<8 AND (
   EXISTS(SELECT 1 FROM public.ai_generation_jobs j WHERE j.id=e.job_id AND j.status IN ('processing','failed') AND j.cancel_requested_at IS NULL)
   OR EXISTS(SELECT 1 FROM public.ai_quality_check_actions q WHERE q.id=e.quality_action_id AND q.status IN ('processing','failed') AND q.cancel_requested_at IS NULL))))) THEN reasons:=array_append(reasons,'unresolved_execution'); END IF;
 IF EXISTS(SELECT 1 FROM public.ai_usage_outbox WHERE payload->>'model'=_model.provider_model_id) THEN reasons:=array_append(reasons,'usage_pending'); END IF;
 IF EXISTS(SELECT 1 FROM public.ai_auxiliary_model_uses u JOIN public.ai_auxiliary_requests r ON r.id=u.request_id WHERE u.model=_model.provider_model_id AND (r.status IN ('pending','processing') OR u.receipt_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.ai_usage_logs l WHERE l.id=u.receipt_id AND l.user_id=u.user_id AND l.model=u.model AND l.provider_usage_state='final'))) THEN reasons:=array_append(reasons,'active_auxiliary'); END IF;
 IF NOT public.ai_legacy_fallback_safe(ARRAY[_model.provider_model_id]) THEN reasons:=array_append(reasons,'legacy_fallback'); END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='public.ai_models'::regclass) THEN reasons:=array_append(reasons,'foreign_key'); END IF;
 RETURN reasons;
END $$;
CREATE OR REPLACE FUNCTION public.guard_ai_model_registry_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k text; changed boolean;
BEGIN
 IF TG_OP='DELETE' THEN
  IF cardinality(public.ai_model_uninstall_reasons(OLD))>0 THEN RAISE EXCEPTION 'Model has active defaults or dependencies; reassign or finish them first'; END IF;
  PERFORM public.reconcile_ai_legacy_fallback(ARRAY[OLD.provider_model_id]);
  UPDATE public.user_model_access SET allowed_models=array_remove(allowed_models,OLD.provider_model_id),access_mode=CASE WHEN cardinality(array_remove(allowed_models,OLD.provider_model_id))=0 THEN 'inherit' ELSE access_mode END,updated_at=now() WHERE OLD.provider_model_id=ANY(allowed_models);
  INSERT INTO public.ai_model_uninstall_guard(provider_model_id) VALUES(OLD.provider_model_id)
   ON CONFLICT(provider_model_id) DO UPDATE SET removed_at=now();
  RETURN OLD;
 END IF;
 IF NEW.provider_model_id IS DISTINCT FROM OLD.provider_model_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Registry identity cannot be changed'; END IF;
 IF (NEW.generator_enabled AND NOT NEW.generator_compatible AND ROW(NEW.generator_enabled,NEW.generator_compatible) IS DISTINCT FROM ROW(OLD.generator_enabled,OLD.generator_compatible)) OR (NEW.quality_check_enabled AND NOT NEW.quality_check_compatible AND ROW(NEW.quality_check_enabled,NEW.quality_check_compatible) IS DISTINCT FROM ROW(OLD.quality_check_enabled,OLD.quality_check_compatible)) THEN RAISE EXCEPTION 'Operation is not compatible'; END IF;
 FOR k IN SELECT key FROM public.app_settings WHERE key IN ('ai_model','ai_generator_default_model','ai_quality_check_default_model','ai_tools_default_model')
  AND value->>'model'=OLD.provider_model_id LOOP
  IF NEW.status<>'enabled' OR (k<>'ai_quality_check_default_model' AND (NOT NEW.generator_enabled OR NOT NEW.generator_compatible))
   OR (k IN ('ai_model','ai_quality_check_default_model') AND (NOT NEW.quality_check_enabled OR NOT NEW.quality_check_compatible)) THEN
   RAISE EXCEPTION 'Select another default before disabling this model';
  END IF;
 END LOOP;
 changed:=(to_jsonb(NEW)-ARRAY['updated_at','admin_revision','last_checked_at','last_success_at','last_failure_at','last_error_code','health_status'])
  IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','admin_revision','last_checked_at','last_success_at','last_failure_at','last_error_code','health_status']);
 NEW.admin_revision:=OLD.admin_revision+CASE WHEN changed THEN 1 ELSE 0 END;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.admin_uninstall_ai_models(_models jsonb,_confirmed boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; row public.ai_models; ids uuid[]:='{}'; removed jsonb:='[]'; selected_models text[]; legacy_before jsonb; users_cleaned integer;
BEGIN
 PERFORM public.assert_ai_model_admin();
 PERFORM pg_advisory_xact_lock(hashtextextended('pb:ai-model-registry:v1',0));
 IF _confirmed IS NOT TRUE OR _models IS NULL OR jsonb_typeof(_models)<>'array' OR jsonb_array_length(_models) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Confirm 1 to 100 installed models'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(_models) LOOP
  IF jsonb_typeof(item)<>'object' OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'revision') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid uninstall selection'; END IF;
  IF (item->>'revision')::numeric NOT BETWEEN 0 AND 9007199254740991 OR (item->>'revision')::numeric<>trunc((item->>'revision')::numeric) OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN ('id','revision')) THEN RAISE EXCEPTION 'Invalid uninstall revision'; END IF;
  ids:=array_append(ids,(item->>'id')::uuid);
 END LOOP;
 IF cardinality(ids)<>(SELECT count(DISTINCT id) FROM unnest(ids) id) THEN RAISE EXCEPTION 'Duplicate model selection'; END IF;
 FOR row IN SELECT * FROM public.ai_models WHERE id=ANY(ids) ORDER BY id FOR UPDATE LOOP
  SELECT value INTO item FROM jsonb_array_elements(_models) WHERE (value->>'id')::uuid=row.id;
  IF row.admin_revision<>(item->>'revision')::bigint THEN RAISE EXCEPTION 'Model settings changed. Refresh and retry.' USING ERRCODE='PT409'; END IF;
  IF cardinality(public.ai_model_uninstall_reasons(row))>0 THEN RAISE EXCEPTION 'Model has active defaults or dependencies; reassign or finish them first'; END IF;
  removed:=removed||jsonb_build_array(jsonb_build_object('id',row.id,'name',row.display_name,'model',row.provider_model_id,'provider',row.provider,'pricing_snapshot',jsonb_build_object('status',row.pricing_status,'currency',row.pricing_currency,'input',row.input_price_per_million,'output',row.output_price_per_million,'cached_input',row.cached_input_price_per_million,'cache_write',row.cache_write_price_per_million)));
 END LOOP;
 IF jsonb_array_length(removed)<>cardinality(ids) THEN RAISE EXCEPTION 'Some models are no longer installed. Refresh and retry.'; END IF;
 SELECT array_agg(provider_model_id ORDER BY id) INTO selected_models FROM public.ai_models WHERE id=ANY(ids);
 SELECT value INTO legacy_before FROM public.app_settings WHERE key='ai_model';
 SELECT count(*) INTO users_cleaned FROM public.user_model_access WHERE allowed_models && selected_models;
 PERFORM public.reconcile_ai_legacy_fallback(selected_models);
 DELETE FROM public.ai_models WHERE id=ANY(ids);
 INSERT INTO public.admin_audit_log(admin_user_id,action,details) VALUES(auth.uid(),'UPDATE_AI_MODEL',jsonb_build_object('operation','uninstall','models',removed,'access_rows_cleaned',users_cleaned,'legacy_fallback_before',legacy_before,'legacy_fallback_after',(SELECT value FROM public.app_settings WHERE key='ai_model')));
 RETURN jsonb_build_object('removed',removed);
END $$;


COMMIT;
