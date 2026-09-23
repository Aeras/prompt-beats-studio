BEGIN;

ALTER TABLE public.saved_prompts
  ADD COLUMN IF NOT EXISTS branch_label text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'saved_prompts_branch_label_length_check'
      AND conrelid = 'public.saved_prompts'::regclass
  ) THEN
    ALTER TABLE public.saved_prompts
      ADD CONSTRAINT saved_prompts_branch_label_length_check
      CHECK (branch_label IS NULL OR char_length(branch_label) <= 120);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS saved_prompts_project_parent_idx
  ON public.saved_prompts(project_id, parent_prompt_id)
  WHERE project_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.replace_latest_prompt_lyrics_review_version(
  _user_id uuid,
  _project_id uuid,
  _version_prompt_id uuid,
  _lyrics text,
  _version_change_metadata jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target public.saved_prompts;
BEGIN
  IF _lyrics IS NULL OR char_length(_lyrics) = 0 OR char_length(_lyrics) > 12000 THEN
    RAISE EXCEPTION 'Lyrics are required and must be 12000 characters or fewer';
  END IF;
  IF _version_change_metadata IS NULL OR jsonb_typeof(_version_change_metadata) <> 'object' THEN
    RAISE EXCEPTION 'Version change metadata is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.prompt_projects p
    WHERE p.id = _project_id AND p.user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'Prompt project does not belong to this user';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(_project_id::text));

  SELECT * INTO v_target
  FROM public.saved_prompts sp
  WHERE sp.id = _version_prompt_id
    AND sp.user_id = _user_id
    AND sp.project_id = _project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version does not belong to this user/project';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.saved_prompts child
    WHERE child.user_id = _user_id
      AND child.project_id = _project_id
      AND child.parent_prompt_id = _version_prompt_id
  ) THEN
    RAISE EXCEPTION 'Only a leaf project version can be replaced';
  END IF;

  PERFORM set_config('promptbeats.allow_version_metadata_update', 'lyrics_review_latest', true);

  UPDATE public.saved_prompts
  SET lyrics = _lyrics,
      version_change_metadata = _version_change_metadata
  WHERE id = _version_prompt_id
    AND user_id = _user_id
    AND project_id = _project_id;

  PERFORM set_config('promptbeats.allow_version_metadata_update', '', true);

  UPDATE public.prompt_projects
  SET updated_at = now()
  WHERE id = _project_id AND user_id = _user_id;

  RETURN jsonb_build_object(
    'id', v_target.id,
    'project_id', v_target.project_id,
    'version_number', v_target.version_number,
    'parent_prompt_id', v_target.parent_prompt_id,
    'replaced', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_latest_prompt_lyrics_review_version(
  uuid, uuid, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_latest_prompt_lyrics_review_version(
  uuid, uuid, uuid, text, jsonb
) TO service_role;

COMMIT;
