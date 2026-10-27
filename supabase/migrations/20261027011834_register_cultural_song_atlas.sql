BEGIN;
SELECT public.register_beta_feature('cultural_song_atlas','Cultural Song Atlas','Internal cultural song research preview; independently validated opt-in transfer only.');
-- Additional editorial boundary: promoting Beta does not publish unapproved RC1.
CREATE FUNCTION public.atlas_preview_admission() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public._lock_user_security_state(auth.uid());
 IF NOT public.current_user_can_use_feature('cultural_song_atlas') OR NOT public.beta_can_test(auth.uid()) THEN RAISE EXCEPTION 'Atlas research preview not available' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.atlas_preview_admission() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_preview_admission() TO authenticated;
-- RC1 has no approved transfer options. Raw job RPCs must not bypass that boundary.
CREATE FUNCTION public.guard_atlas_generation_input() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.input_payload ? 'atlasOrigin' AND NEW.input_payload->'atlasOrigin'<>'null'::jsonb THEN
  RAISE EXCEPTION 'Atlas Generator transfer awaits independent validation' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_atlas_generation_input() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_atlas_generation_input BEFORE INSERT OR UPDATE OF input_payload ON public.ai_generation_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_atlas_generation_input();
-- Worker check uses an explicit job owner, never user-controlled JWT metadata.
CREATE FUNCTION public.atlas_worker_admission(_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public._lock_user_security_state(_user_id);
 IF NOT public.can_use_feature(_user_id,'cultural_song_atlas') OR NOT public.beta_can_test(_user_id) THEN RAISE EXCEPTION 'Atlas unavailable' USING ERRCODE='42501'; END IF;
 RAISE EXCEPTION 'Atlas Generator transfer awaits independent validation' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION public.atlas_worker_admission(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_worker_admission(uuid) TO service_role;
COMMIT;
