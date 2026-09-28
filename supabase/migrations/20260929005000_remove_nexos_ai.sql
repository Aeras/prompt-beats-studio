-- Remove Nexos AI catalog entries. Provider support is removed from the application code separately.
DELETE FROM public.ai_models
WHERE lower(provider) = 'nexos';
