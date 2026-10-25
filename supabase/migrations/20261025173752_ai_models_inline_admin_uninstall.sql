BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.ai_models ADD COLUMN admin_revision bigint NOT NULL DEFAULT 0
 CHECK (admin_revision BETWEEN 0 AND 9007199254740991);
-- Ephemeral registry tombstones prevent a request admitted concurrently with
-- uninstall from starting a now-uninstalled model. No historical record is erased.
CREATE TABLE public.ai_model_uninstall_guard(provider_model_id text PRIMARY KEY,removed_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.ai_model_uninstall_guard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_model_uninstall_guard FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.ai_model_registry_fence() RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Registry mutations require a fresh transaction' USING ERRCODE='40001';
 END IF;
 IF TG_TABLE_NAME IN ('ai_models','app_settings') THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('pb:ai-model-registry:v1',0));
 ELSE
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('pb:ai-model-registry:v1',0));
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.ai_model_registry_fence() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['ai_models','app_settings','user_model_access','ai_generation_jobs','ai_quality_check_actions','ai_provider_executions','ai_auxiliary_requests','ai_usage_outbox'] LOOP
  EXECUTE format('CREATE TRIGGER ai_model_registry_fence BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.ai_model_registry_fence()',tab);
 END LOOP;
END $$;

CREATE FUNCTION public.assert_ai_model_admin() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public._lock_user_security_state(auth.uid());
 IF NOT public.has_valid_account_state(auth.uid()) OR NOT public.current_user_is_admin_level()
  OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=now())) THEN
  RAISE EXCEPTION 'Not allowed';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_ai_model_admin() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.ai_model_uninstall_reasons(_model public.ai_models) RETURNS text[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE reasons text[]:='{}'; k text;
BEGIN
 FOR k IN SELECT key FROM public.app_settings WHERE key IN ('ai_model','ai_generator_default_model','ai_quality_check_default_model','ai_tools_default_model')
  AND (value->>'model'=_model.provider_model_id OR value->>'registryId'=_model.id::text) LOOP
  reasons:=array_append(reasons,'default:'||k);
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.user_model_access WHERE _model.provider_model_id=ANY(allowed_models)) THEN reasons:=array_append(reasons,'user_access'); END IF;
 IF EXISTS(SELECT 1 FROM public.ai_generation_jobs WHERE status IN ('pending','processing') AND coalesce(model,input_payload->>'generationModel',input_payload->>'model')=_model.provider_model_id)
  OR EXISTS(SELECT 1 FROM public.ai_quality_check_actions WHERE status IN ('pending','processing') AND coalesce(model,input_payload->>'qualityCheckModel',input_payload->>'model')=_model.provider_model_id) THEN reasons:=array_append(reasons,'active_jobs'); END IF;
 IF EXISTS(SELECT 1 FROM public.ai_provider_executions e WHERE e.model=_model.provider_model_id AND (
  e.state IN ('execution_unknown','accepted') OR (e.result IS NOT NULL AND e.application_recovery_attempts<8 AND (
   EXISTS(SELECT 1 FROM public.ai_generation_jobs j WHERE j.id=e.job_id AND j.status IN ('processing','failed') AND j.cancel_requested_at IS NULL)
   OR EXISTS(SELECT 1 FROM public.ai_quality_check_actions q WHERE q.id=e.quality_action_id AND q.status IN ('processing','failed') AND q.cancel_requested_at IS NULL))))) THEN reasons:=array_append(reasons,'unresolved_execution'); END IF;
 IF EXISTS(SELECT 1 FROM public.ai_usage_outbox WHERE payload->>'model'=_model.provider_model_id) THEN reasons:=array_append(reasons,'usage_pending'); END IF;
 -- Auxiliary admissions do not persist the chosen model. Never guess which
 -- unresolved operation is safe to remove; wait for completion/recovery.
 IF EXISTS(SELECT 1 FROM public.ai_auxiliary_requests WHERE status IN ('pending','processing')) THEN reasons:=array_append(reasons,'active_auxiliary'); END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='public.ai_models'::regclass) THEN reasons:=array_append(reasons,'foreign_key'); END IF;
 RETURN reasons;
END $$;
REVOKE ALL ON FUNCTION public.ai_model_uninstall_reasons(public.ai_models) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.guard_ai_model_registry_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k text; changed boolean;
BEGIN
 IF TG_OP='DELETE' THEN
  IF cardinality(public.ai_model_uninstall_reasons(OLD))>0 THEN RAISE EXCEPTION 'Model has active defaults or dependencies; reassign or finish them first'; END IF;
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
CREATE TRIGGER guard_ai_model_registry_row BEFORE UPDATE OR DELETE ON public.ai_models FOR EACH ROW EXECUTE FUNCTION public.guard_ai_model_registry_row();
REVOKE ALL ON FUNCTION public.guard_ai_model_registry_row() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.restore_ai_model_registry_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN DELETE FROM public.ai_model_uninstall_guard WHERE provider_model_id=NEW.provider_model_id; RETURN NEW; END $$;
CREATE TRIGGER restore_ai_model_registry_identity AFTER INSERT ON public.ai_models FOR EACH ROW EXECUTE FUNCTION public.restore_ai_model_registry_identity();
REVOKE ALL ON FUNCTION public.restore_ai_model_registry_identity() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.guard_uninstalled_ai_request() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE selected text;
BEGIN
 IF TG_TABLE_NAME='user_model_access' THEN
  IF EXISTS(SELECT 1 FROM unnest(NEW.allowed_models) m JOIN public.ai_model_uninstall_guard g ON g.provider_model_id=m) THEN RAISE EXCEPTION 'Model is no longer installed'; END IF;
  RETURN NEW;
 ELSIF TG_TABLE_NAME='ai_provider_executions' THEN
  IF TG_OP<>'INSERT' OR NEW.state NOT IN ('execution_unknown','accepted') THEN RETURN NEW; END IF;
  selected:=NEW.model;
 ELSE
  IF NEW.status NOT IN ('pending','processing') THEN RETURN NEW; END IF;
  selected:=coalesce(NEW.model,NEW.input_payload->>'generationModel',NEW.input_payload->>'qualityCheckModel',NEW.input_payload->>'model');
 END IF;
 IF EXISTS(SELECT 1 FROM public.ai_model_uninstall_guard WHERE provider_model_id=selected) THEN RAISE EXCEPTION 'Model is no longer installed'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['user_model_access','ai_generation_jobs','ai_quality_check_actions','ai_provider_executions'] LOOP
  EXECUTE format('CREATE TRIGGER guard_uninstalled_ai_request BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_uninstalled_ai_request()',tab);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.guard_uninstalled_ai_request() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.admin_ai_model_controls() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.assert_ai_model_admin();
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'blockers',public.ai_model_uninstall_reasons(m))),'[]') INTO result FROM public.ai_models m;
 RETURN result;
END $$;

CREATE FUNCTION public.admin_patch_ai_model(_id uuid,_patch jsonb,_expected_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.ai_models; candidate public.ai_models; k text; val jsonb;
BEGIN
 PERFORM public.assert_ai_model_admin();
 PERFORM pg_advisory_xact_lock(hashtextextended('pb:ai-model-registry:v1',0));
 IF _patch IS NULL OR jsonb_typeof(_patch)<>'object' OR _patch='{}' OR _expected_revision IS NULL OR _expected_revision NOT BETWEEN 0 AND 9007199254740991 THEN RAISE EXCEPTION 'Invalid model patch'; END IF;
 SELECT * INTO old FROM public.ai_models WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Model is no longer installed'; END IF;
 IF old.admin_revision<>_expected_revision THEN RAISE EXCEPTION 'Model settings changed. Refresh and retry.' USING ERRCODE='PT409'; END IF;
 FOR k,val IN SELECT * FROM jsonb_each(_patch) LOOP
  IF k NOT IN ('display_name','status','access_policy','generator_enabled','quality_check_enabled','generator_reasoning_effort','quality_check_reasoning_effort','input_price_per_million','output_price_per_million','cached_input_price_per_million','cache_write_price_per_million','pricing_status','notes') THEN RAISE EXCEPTION 'Invalid model field'; END IF;
  IF k IN ('generator_enabled','quality_check_enabled') AND jsonb_typeof(val)<>'boolean' THEN RAISE EXCEPTION 'Invalid boolean'; END IF;
  IF k LIKE '%price_per_million' AND val<>'null'::jsonb AND (jsonb_typeof(val)<>'number' OR (val::text)::numeric<0 OR (val::text)::numeric>1000000) THEN RAISE EXCEPTION 'Invalid price'; END IF;
  IF k IN ('notes','generator_reasoning_effort','quality_check_reasoning_effort') AND val<>'null'::jsonb AND jsonb_typeof(val)<>'string' THEN RAISE EXCEPTION 'Invalid nullable text'; END IF;
  IF k IN ('display_name','status','access_policy','pricing_status') AND jsonb_typeof(val)<>'string' THEN RAISE EXCEPTION 'Invalid text field'; END IF;
 END LOOP;
 candidate:=jsonb_populate_record(old,_patch);
 IF candidate.display_name IS NULL OR length(btrim(candidate.display_name)) NOT BETWEEN 1 AND 120 OR length(candidate.notes)>2000 THEN RAISE EXCEPTION 'Invalid model text'; END IF;
 IF candidate.pricing_status='verified' AND (candidate.input_price_per_million IS NULL OR candidate.output_price_per_million IS NULL) THEN RAISE EXCEPTION 'Verified pricing requires both input and output prices'; END IF;
 UPDATE public.ai_models SET display_name=btrim(candidate.display_name),status=candidate.status,access_policy=candidate.access_policy,
  generator_enabled=candidate.generator_enabled,quality_check_enabled=candidate.quality_check_enabled,
  generator_reasoning_effort=candidate.generator_reasoning_effort,quality_check_reasoning_effort=candidate.quality_check_reasoning_effort,
  input_price_per_million=candidate.input_price_per_million,output_price_per_million=candidate.output_price_per_million,
  cached_input_price_per_million=candidate.cached_input_price_per_million,cache_write_price_per_million=candidate.cache_write_price_per_million,
  pricing_status=candidate.pricing_status,notes=candidate.notes,
  pricing_updated_at=CASE WHEN ROW(old.input_price_per_million,old.output_price_per_million,old.cached_input_price_per_million,old.cache_write_price_per_million,old.pricing_status) IS DISTINCT FROM ROW(candidate.input_price_per_million,candidate.output_price_per_million,candidate.cached_input_price_per_million,candidate.cache_write_price_per_million,candidate.pricing_status) THEN now() ELSE old.pricing_updated_at END,
  updated_at=now() WHERE id=_id RETURNING * INTO candidate;
 IF candidate.admin_revision<>old.admin_revision THEN
  INSERT INTO public.admin_audit_log(admin_user_id,action,details) VALUES(auth.uid(),'UPDATE_AI_MODEL',jsonb_build_object('operation','patch','id',_id,'model',candidate.provider_model_id,'fields',(SELECT jsonb_agg(key ORDER BY key) FROM jsonb_object_keys(_patch) key),'previous_revision',old.admin_revision,'revision',candidate.admin_revision));
 END IF;
 RETURN jsonb_build_object('model',to_jsonb(candidate),'blockers',public.ai_model_uninstall_reasons(candidate));
END $$;

CREATE FUNCTION public.admin_uninstall_ai_models(_models jsonb,_confirmed boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; row public.ai_models; ids uuid[]:='{}'; removed jsonb:='[]';
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
  removed:=removed||jsonb_build_array(jsonb_build_object('id',row.id,'name',row.display_name,'model',row.provider_model_id,'provider',row.provider));
 END LOOP;
 IF jsonb_array_length(removed)<>cardinality(ids) THEN RAISE EXCEPTION 'Some models are no longer installed. Refresh and retry.'; END IF;
 DELETE FROM public.ai_models WHERE id=ANY(ids);
 INSERT INTO public.admin_audit_log(admin_user_id,action,details) VALUES(auth.uid(),'UPDATE_AI_MODEL',jsonb_build_object('operation','uninstall','models',removed));
 RETURN jsonb_build_object('removed',removed);
END $$;

CREATE FUNCTION public.admin_set_ai_model_default(_operation text,_model text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k text; row public.ai_models;
BEGIN
 PERFORM public.assert_ai_model_admin();
 PERFORM pg_advisory_xact_lock(hashtextextended('pb:ai-model-registry:v1',0));
 k:=CASE _operation WHEN 'generator' THEN 'ai_generator_default_model' WHEN 'quality_check' THEN 'ai_quality_check_default_model' WHEN 'ai_tools' THEN 'ai_tools_default_model' WHEN 'legacy' THEN 'ai_model' ELSE NULL END;
 IF k IS NULL THEN RAISE EXCEPTION 'Invalid default operation'; END IF;
 SELECT * INTO row FROM public.ai_models WHERE provider_model_id=_model FOR UPDATE;
 IF NOT FOUND OR row.status<>'enabled' OR (_operation<>'quality_check' AND (NOT row.generator_compatible OR NOT row.generator_enabled)) OR (_operation IN ('quality_check','legacy') AND (NOT row.quality_check_compatible OR NOT row.quality_check_enabled)) THEN RAISE EXCEPTION 'That model is not eligible for this default'; END IF;
 INSERT INTO public.app_settings(key,value,updated_at,updated_by) VALUES(k,jsonb_build_object('registryId',row.id,'model',row.provider_model_id),now(),auth.uid()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by;
 INSERT INTO public.admin_audit_log(admin_user_id,action,details) VALUES(auth.uid(),'UPDATE_AI_MODEL_DEFAULT',jsonb_build_object('operation',_operation,'model',_model));
 RETURN jsonb_build_object('model',_model);
END $$;
REVOKE ALL ON FUNCTION public.admin_ai_model_controls(),public.admin_patch_ai_model(uuid,jsonb,bigint),public.admin_uninstall_ai_models(jsonb,boolean),public.admin_set_ai_model_default(text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_model_controls(),public.admin_patch_ai_model(uuid,jsonb,bigint),public.admin_uninstall_ai_models(jsonb,boolean),public.admin_set_ai_model_default(text,text) TO authenticated;
COMMIT;
