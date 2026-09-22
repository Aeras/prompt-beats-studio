CREATE INDEX IF NOT EXISTS prompt_projects_preferred_prompt_idx
ON public.prompt_projects(preferred_prompt_id)
WHERE preferred_prompt_id IS NOT NULL;
