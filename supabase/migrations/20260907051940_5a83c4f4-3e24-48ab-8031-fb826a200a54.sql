CREATE TABLE public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generation_id uuid,
  provider text NOT NULL,
  model text NOT NULL,
  operation text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric(12,6),
  success boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ai_usage_logs TO service_role;

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view AI usage logs"
ON public.ai_usage_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX ai_usage_logs_created_at_idx ON public.ai_usage_logs (created_at DESC);
CREATE INDEX ai_usage_logs_user_id_idx ON public.ai_usage_logs (user_id);
CREATE INDEX ai_usage_logs_generation_id_idx ON public.ai_usage_logs (generation_id);
CREATE INDEX ai_usage_logs_provider_model_idx ON public.ai_usage_logs (provider, model);
CREATE INDEX ai_usage_logs_operation_idx ON public.ai_usage_logs (operation);