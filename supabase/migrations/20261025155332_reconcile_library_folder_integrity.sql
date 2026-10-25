BEGIN;
SET LOCAL lock_timeout='5s';

-- Forward reconciliation: never mark the missing historical migration applied.
-- Serialize only folder writes, before tuple locks; reads remain concurrent.
-- A single database-owned fence covers authenticated and maintenance writers.
CREATE FUNCTION public.serialize_library_folder_writes() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Folder writes require a fresh transaction snapshot' USING ERRCODE='40001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('promptbeats:library-folder-writes:v1',0));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.serialize_library_folder_writes() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER trg_serialize_library_folder_writes
BEFORE INSERT OR UPDATE OR DELETE ON public.library_folders
FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_library_folder_writes();

CREATE OR REPLACE FUNCTION public.validate_library_folder_hierarchy() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_node_depth integer:=1; v_subtree_height integer:=1;
  v_cycle boolean:=false; v_broken boolean:=false;
BEGIN
  NEW.name:=btrim(NEW.name);
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'Folder identity and ownership cannot be changed';
  END IF;
  IF NEW.parent_folder_id=NEW.id THEN RAISE EXCEPTION 'A folder cannot be moved into itself'; END IF;
  IF NEW.parent_folder_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.library_folders WHERE id=NEW.parent_folder_id AND user_id=NEW.user_id) THEN
      RAISE EXCEPTION 'Parent folder does not belong to this user';
    END IF;
    -- Bound traversal even for pre-existing corrupt/over-deep graphs.
    WITH RECURSIVE ancestors AS (
      SELECT f.id,f.parent_folder_id,1 AS level,ARRAY[f.id] AS path,false AS cycle
      FROM public.library_folders f WHERE f.id=NEW.parent_folder_id AND f.user_id=NEW.user_id
      UNION ALL
      SELECT f.id,f.parent_folder_id,a.level+1,a.path||f.id,f.id=ANY(a.path)
      FROM public.library_folders f JOIN ancestors a ON f.id=a.parent_folder_id
      WHERE f.user_id=NEW.user_id AND NOT a.cycle AND a.level<=5
    )
    SELECT max(level)+1, bool_or(cycle OR NEW.id=ANY(path)),
      bool_or(parent_folder_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM public.library_folders p WHERE p.id=ancestors.parent_folder_id AND p.user_id=NEW.user_id))
    INTO v_node_depth,v_cycle,v_broken FROM ancestors;
    IF v_cycle THEN RAISE EXCEPTION 'A folder cannot be moved into one of its descendants'; END IF;
    IF v_broken THEN RAISE EXCEPTION 'Parent folder does not belong to this user'; END IF;
  END IF;
  IF TG_OP='UPDATE' THEN
    WITH RECURSIVE descendants AS (
      SELECT f.id,1 AS level,ARRAY[f.id] AS path,false AS cycle
      FROM public.library_folders f WHERE f.id=NEW.id AND f.user_id=NEW.user_id
      UNION ALL
      SELECT child.id,d.level+1,d.path||child.id,child.id=ANY(d.path)
      FROM public.library_folders child JOIN descendants d ON child.parent_folder_id=d.id
      WHERE child.user_id=NEW.user_id AND NOT d.cycle AND d.level<=5
    ) SELECT COALESCE(max(level),1),COALESCE(bool_or(cycle),false)
      INTO v_subtree_height,v_cycle FROM descendants;
    IF v_cycle THEN RAISE EXCEPTION 'A folder cannot be moved into one of its descendants'; END IF;
  END IF;
  IF v_node_depth+v_subtree_height-1>5 THEN RAISE EXCEPTION 'Folder nesting cannot exceed 5 levels'; END IF;
  RETURN NEW;
END;
$$;
-- Validate key mutations as well; normal rename/move APIs are unchanged.
DROP TRIGGER trg_validate_library_folder_hierarchy ON public.library_folders;
CREATE TRIGGER trg_validate_library_folder_hierarchy BEFORE INSERT OR UPDATE ON public.library_folders
FOR EACH ROW EXECUTE FUNCTION public.validate_library_folder_hierarchy();

CREATE OR REPLACE FUNCTION public.duplicate_prompt_project_to_folder(
  _project_id uuid,_destination_folder_id uuid,_new_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id uuid:=auth.uid(); v_snapshot record;
  v_source_project public.prompt_projects; v_new_project public.prompt_projects;
  v_source_prompt public.saved_prompts; v_versions public.saved_prompts[];
  v_new_prompt_id uuid; v_new_parent_id uuid;
  v_id_map jsonb:='{}'; v_copied_count integer:=0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_valid_account_state(v_user_id) THEN RAISE EXCEPTION 'Account is unavailable'; END IF;
  IF _new_name IS NULL OR char_length(btrim(_new_name))=0 OR char_length(btrim(_new_name))>120 THEN
    RAISE EXCEPTION 'Duplicate project name is required and must be 120 characters or fewer';
  END IF;
  -- One MVCC statement captures project/preference/content/lineage together.
  -- Neither pass re-reads source versions that may be concurrently edited.
  SELECT p AS project,COALESCE((SELECT array_agg(sp ORDER BY sp.created_at,sp.id)
    FROM public.saved_prompts sp WHERE sp.project_id=p.id AND sp.user_id=v_user_id),
    ARRAY[]::public.saved_prompts[]) AS versions
  INTO v_snapshot FROM public.prompt_projects p WHERE p.id=_project_id AND p.user_id=v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
  v_source_project:=v_snapshot.project; v_versions:=v_snapshot.versions;
  IF _destination_folder_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.library_folders WHERE id=_destination_folder_id AND user_id=v_user_id
  ) THEN RAISE EXCEPTION 'Destination folder does not belong to this user'; END IF;
  INSERT INTO public.prompt_projects(user_id,name,creation_notes,preferred_prompt_id,folder_id,duplicated_from_project_id)
    VALUES(v_user_id,btrim(_new_name),v_source_project.creation_notes,NULL,_destination_folder_id,v_source_project.id)
    RETURNING * INTO v_new_project;
  -- Pass 1: all IDs exist before any parent is assigned (including irregular order).
  FOREACH v_source_prompt IN ARRAY v_versions LOOP
    INSERT INTO public.saved_prompts(
      user_id,custom_name,project_id,folder_id,duplicated_from_prompt_id,
      version_number,version_label,generator_input_snapshot,parent_prompt_id,revision_request,
      source_generation_job_id,version_change_metadata,version_user_note,branch_label,
      title,theme,genre,mood,language,tags,lyrics,note
    ) VALUES (
      v_user_id,v_source_prompt.custom_name,v_new_project.id,NULL,v_source_prompt.id,
      v_source_prompt.version_number,v_source_prompt.version_label,v_source_prompt.generator_input_snapshot,NULL,v_source_prompt.revision_request,
      NULL,v_source_prompt.version_change_metadata,v_source_prompt.version_user_note,v_source_prompt.branch_label,
      v_source_prompt.title,v_source_prompt.theme,v_source_prompt.genre,v_source_prompt.mood,
      v_source_prompt.language,v_source_prompt.tags,v_source_prompt.lyrics,v_source_prompt.note
    ) RETURNING id INTO v_new_prompt_id;
    v_id_map:=v_id_map||jsonb_build_object(v_source_prompt.id::text,v_new_prompt_id::text);
    v_copied_count:=v_copied_count+1;
  END LOOP;
  -- Pass 2: map only into this duplicate; never retain source/external IDs.
  FOREACH v_source_prompt IN ARRAY v_versions LOOP
    IF v_source_prompt.parent_prompt_id IS NOT NULL THEN
      v_new_prompt_id:=NULLIF(v_id_map->>v_source_prompt.id::text,'')::uuid;
      v_new_parent_id:=NULLIF(v_id_map->>v_source_prompt.parent_prompt_id::text,'')::uuid;
      IF v_new_prompt_id IS NULL OR v_new_parent_id IS NULL THEN
        RAISE EXCEPTION 'Project version graph contains an external or missing parent reference';
      END IF;
      UPDATE public.saved_prompts SET parent_prompt_id=v_new_parent_id,updated_at=now()
        WHERE id=v_new_prompt_id AND user_id=v_user_id AND project_id=v_new_project.id;
    END IF;
  END LOOP;
  IF v_source_project.preferred_prompt_id IS NOT NULL THEN
    v_new_prompt_id:=NULLIF(v_id_map->>v_source_project.preferred_prompt_id::text,'')::uuid;
    IF v_new_prompt_id IS NULL THEN RAISE EXCEPTION 'Preferred Project version could not be mapped into the duplicate'; END IF;
    UPDATE public.prompt_projects SET preferred_prompt_id=v_new_prompt_id,updated_at=now()
      WHERE id=v_new_project.id AND user_id=v_user_id;
  END IF;
  RETURN jsonb_build_object('id',v_new_project.id,'folder_id',v_new_project.folder_id,
    'duplicated_from_project_id',v_new_project.duplicated_from_project_id,'copied_versions',v_copied_count);
END;
$$;
-- CREATE OR REPLACE retains existing ACLs; make the public API contract explicit.
REVOKE ALL ON FUNCTION public.duplicate_prompt_project_to_folder(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.duplicate_prompt_project_to_folder(uuid,uuid,text) TO authenticated,service_role;
COMMIT;
