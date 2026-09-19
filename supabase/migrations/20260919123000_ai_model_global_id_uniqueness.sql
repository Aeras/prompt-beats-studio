-- PromptBeats resolves registry models by bare provider_model_id across the
-- application. Enforce that runtime invariant at the database boundary so
-- concurrent model installs cannot create ambiguous lookups.
CREATE UNIQUE INDEX IF NOT EXISTS ai_models_provider_model_id_unique
  ON public.ai_models (provider_model_id);
