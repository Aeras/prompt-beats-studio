-- Allow authenticated requests to reach the existing admin-only RLS policy on AI usage logs.
-- Row visibility remains restricted by "Admins can view AI usage logs" using
-- public.current_user_is_admin_level().
GRANT SELECT ON TABLE public.ai_usage_logs TO authenticated;
