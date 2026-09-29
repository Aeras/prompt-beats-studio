BEGIN;

CREATE OR REPLACE FUNCTION public.bulk_delete_prompt_projects(_plans jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _project_ids uuid[];
  _requested_project_count integer;
  _owned_project_count integer;
  _requested_prompt_count integer := 0;
  _deleted_prompt_count integer := 0;
  _deleted_project_count integer := 0;
  _plan jsonb;
  _project_id uuid;
  _prompt_ids uuid[];
  _matched_prompt_count integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF jsonb_typeof(_plans) <> 'array' THEN
    RAISE EXCEPTION 'Deletion plans must be an array.';
  END IF;

  _requested_project_count := jsonb_array_length(_plans);
  IF _requested_project_count < 1 OR _requested_project_count > 100 THEN
    RAISE EXCEPTION 'Select between 1 and 100 Projects.';
  END IF;

  SELECT array_agg(DISTINCT (item->>'projectId')::uuid)
  INTO _project_ids
  FROM jsonb_array_elements(_plans) AS item
  WHERE nullif(item->>'projectId', '') IS NOT NULL;

  IF coalesce(array_length(_project_ids, 1), 0) <> _requested_project_count THEN
    RAISE EXCEPTION 'Each deletion plan must contain one unique Project ID.';
  END IF;

  SELECT count(*)
  INTO _owned_project_count
  FROM public.prompt_projects
  WHERE user_id = _user_id
    AND id = ANY(_project_ids);

  IF _owned_project_count <> _requested_project_count THEN
    RAISE EXCEPTION 'One or more Projects were not found or do not belong to this account.';
  END IF;

  FOR _plan IN SELECT value FROM jsonb_array_elements(_plans)
  LOOP
    _project_id := (_plan->>'projectId')::uuid;

    SELECT coalesce(array_agg(DISTINCT value::uuid), ARRAY[]::uuid[])
    INTO _prompt_ids
    FROM jsonb_array_elements_text(coalesce(_plan->'deletePromptIds', '[]'::jsonb));

    IF coalesce(array_length(_prompt_ids, 1), 0) > 500 THEN
      RAISE EXCEPTION 'A Project cannot delete more than 500 prompts in one operation.';
    END IF;

    IF coalesce(array_length(_prompt_ids, 1), 0) > 0 THEN
      SELECT count(*)
      INTO _matched_prompt_count
      FROM public.saved_prompts
      WHERE user_id = _user_id
        AND project_id = _project_id
        AND id = ANY(_prompt_ids);

      IF _matched_prompt_count <> array_length(_prompt_ids, 1) THEN
        RAISE EXCEPTION 'One or more selected prompts do not belong to their Project.';
      END IF;

      _requested_prompt_count := _requested_prompt_count + array_length(_prompt_ids, 1);

      DELETE FROM public.saved_prompts
      WHERE user_id = _user_id
        AND project_id = _project_id
        AND id = ANY(_prompt_ids);

      GET DIAGNOSTICS _matched_prompt_count = ROW_COUNT;
      _deleted_prompt_count := _deleted_prompt_count + _matched_prompt_count;
    END IF;
  END LOOP;

  DELETE FROM public.prompt_projects
  WHERE user_id = _user_id
    AND id = ANY(_project_ids);

  GET DIAGNOSTICS _deleted_project_count = ROW_COUNT;

  IF _deleted_project_count <> _requested_project_count THEN
    RAISE EXCEPTION 'Bulk Project deletion did not complete atomically.';
  END IF;

  RETURN jsonb_build_object(
    'deletedProjectCount', _deleted_project_count,
    'deletedPromptCount', _deleted_prompt_count,
    'requestedPromptCount', _requested_prompt_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_delete_prompt_projects(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_delete_prompt_projects(jsonb) TO authenticated, service_role;

COMMIT;
