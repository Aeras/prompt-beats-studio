-- Third canonical AI default category: AI Tools.
INSERT INTO public.app_settings(key, value, updated_at, updated_by)
SELECT 'ai_tools_default_model',
       COALESCE((SELECT value FROM public.app_settings WHERE key='ai_generator_default_model'),
                (SELECT value FROM public.app_settings WHERE key='ai_model'),
                '{"model":"gemini-3.8-flash"}'::jsonb),
       now(), NULL
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key='ai_tools_default_model');
