-- Disposable local DB only. All synthetic content and permission probes roll back.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
CREATE FUNCTION pg_temp.denied(sql text,expected text DEFAULT 'P0001') RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, got % for %',expected,actual,sql; END IF;
END $$;
INSERT INTO auth.users(id,email) VALUES
 ('dd000000-0000-4000-8000-000000000001','folder-owner@example.invalid'),
 ('dd000000-0000-4000-8000-000000000002','folder-other@example.invalid'),
 ('dd000000-0000-4000-8000-000000000003','folder-banned@example.invalid');
INSERT INTO public.prompt_projects(id,user_id,name) VALUES
 ('ee000000-0000-4000-8000-000000000003','dd000000-0000-4000-8000-000000000003','Banned source');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000076',true);
SELECT public.admin_set_user_banned('dd000000-0000-4000-8000-000000000003',true,'security_concern');
SELECT set_config('request.jwt.claim.sub','dd000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE i integer; parent uuid; id uuid; BEGIN
 FOR i IN 1..5 LOOP
  id:=('fa000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  INSERT INTO public.library_folders(id,user_id,parent_folder_id,name) VALUES(id,auth.uid(),parent,'Depth '||i);
  parent:=id;
 END LOOP;
 FOR i IN 1..3 LOOP
  id:=('fb000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  INSERT INTO public.library_folders(id,user_id,parent_folder_id,name) VALUES(id,auth.uid(),CASE WHEN i=1 THEN NULL ELSE ('fb000000-0000-4000-8000-'||lpad((i-1)::text,12,'0'))::uuid END,'Subtree '||i);
 END LOOP;
END $$;
SELECT pg_temp.denied($q$INSERT INTO public.library_folders(user_id,parent_folder_id,name) VALUES(auth.uid(),'fa000000-0000-4000-8000-000000000005','Too deep')$q$);
SELECT pg_temp.denied($q$UPDATE public.library_folders SET parent_folder_id='fa000000-0000-4000-8000-000000000003' WHERE id='fb000000-0000-4000-8000-000000000001'$q$);
UPDATE public.library_folders SET parent_folder_id='fa000000-0000-4000-8000-000000000002' WHERE id='fb000000-0000-4000-8000-000000000001';
UPDATE public.library_folders SET parent_folder_id=NULL WHERE id='fb000000-0000-4000-8000-000000000001';
SELECT pg_temp.denied($q$UPDATE public.library_folders SET parent_folder_id='fb000000-0000-4000-8000-000000000003' WHERE id='fb000000-0000-4000-8000-000000000001'$q$);
SELECT pg_temp.denied($q$UPDATE public.library_folders SET parent_folder_id=id WHERE id='fb000000-0000-4000-8000-000000000003'$q$);
SELECT pg_temp.denied($q$UPDATE public.library_folders SET id=gen_random_uuid() WHERE id='fb000000-0000-4000-8000-000000000003'$q$);
SELECT pg_temp.denied($q$INSERT INTO public.library_folders(user_id,name) VALUES(auth.uid(),' Subtree 1 ')$q$,'23505');
UPDATE public.library_folders SET name=' Renamed ' WHERE id='fb000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert((SELECT name='Renamed' FROM public.library_folders WHERE id='fb000000-0000-4000-8000-000000000003'),'Rename trim preserved');
INSERT INTO public.prompt_projects(id,user_id,name,creation_notes) VALUES
 ('ee000000-0000-4000-8000-000000000001',auth.uid(),'Source','Keep notes'),
 ('ee000000-0000-4000-8000-000000000002',auth.uid(),'Empty','');
-- Child precedes parent in BOTH version number and creation order.
INSERT INTO public.saved_prompts(id,user_id,project_id,title,tags,lyrics,note,version_number,created_at,generator_input_snapshot,version_change_metadata,version_user_note,branch_label) VALUES
 ('ef000000-0000-4000-8000-000000000001',auth.uid(),'ee000000-0000-4000-8000-000000000001','Child','style','lyrics','note',1,'2026-01-01','{"seed":1}','{"schemaVersion":1}','Keep note','Alternative'),
 ('ef000000-0000-4000-8000-000000000002',auth.uid(),'ee000000-0000-4000-8000-000000000001','Parent','style','lyrics','note',7,'2026-01-02','{"seed":2}','{"schemaVersion":1}',NULL,NULL);
UPDATE public.saved_prompts SET parent_prompt_id='ef000000-0000-4000-8000-000000000002' WHERE id='ef000000-0000-4000-8000-000000000001';
UPDATE public.prompt_projects SET preferred_prompt_id='ef000000-0000-4000-8000-000000000001' WHERE id='ee000000-0000-4000-8000-000000000001';
DO $$ DECLARE result jsonb; project uuid; child public.saved_prompts; parent public.saved_prompts; BEGIN
 result:=public.duplicate_prompt_project_to_folder('ee000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001',' Duplicate ');
 project:=(result->>'id')::uuid;
 SELECT * INTO child FROM public.saved_prompts WHERE project_id=project AND duplicated_from_prompt_id='ef000000-0000-4000-8000-000000000001';
 SELECT * INTO parent FROM public.saved_prompts WHERE project_id=project AND duplicated_from_prompt_id='ef000000-0000-4000-8000-000000000002';
 PERFORM pg_temp.assert((result->>'copied_versions')::integer=2 AND child.parent_prompt_id=parent.id,'Two-pass parent mapping');
 PERFORM pg_temp.assert(child.branch_label='Alternative' AND child.version_user_note='Keep note' AND child.generator_input_snapshot='{"seed":1}'::jsonb AND child.version_change_metadata='{"schemaVersion":1}'::jsonb AND child.source_generation_job_id IS NULL,'Later metadata preserved, execution ID cleared');
 PERFORM pg_temp.assert((SELECT preferred_prompt_id=child.id AND name='Duplicate' AND creation_notes='Keep notes' AND duplicated_from_project_id='ee000000-0000-4000-8000-000000000001' FROM public.prompt_projects WHERE id=project),'Preference/notes/canonical response');
 PERFORM pg_temp.assert((public.duplicate_prompt_project_to_folder('ee000000-0000-4000-8000-000000000002',NULL,'Empty copy')->>'copied_versions')::integer=0,'Empty project still supported');
END $$;
SELECT pg_temp.denied($q$SELECT public.duplicate_prompt_project_to_folder('ee000000-0000-4000-8000-000000000001',NULL,'')$q$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','dd000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.library_folders(id,user_id,name) VALUES('fc000000-0000-4000-8000-000000000001',auth.uid(),'Other folder');
SELECT pg_temp.denied($q$SELECT public.duplicate_prompt_project_to_folder('ee000000-0000-4000-8000-000000000001',NULL,'Cross-user')$q$);
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.library_folders WHERE id='fa000000-0000-4000-8000-000000000001'),'Folder isolation');
SELECT pg_temp.denied($q$INSERT INTO public.library_folders(user_id,parent_folder_id,name) VALUES(auth.uid(),'fa000000-0000-4000-8000-000000000001','Cross parent')$q$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','dd000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT public.duplicate_prompt_project_to_folder('ee000000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','Wrong destination')$q$);
RESET ROLE;
-- Corrupt source lineage cannot leave a partial duplicate. Never edit real data.
ALTER TABLE public.saved_prompts DISABLE TRIGGER trg_enforce_saved_prompt_revision_lineage;
UPDATE public.saved_prompts SET parent_prompt_id=(SELECT id FROM public.saved_prompts WHERE project_id<>'ee000000-0000-4000-8000-000000000001' LIMIT 1) WHERE id='ef000000-0000-4000-8000-000000000001';
ALTER TABLE public.saved_prompts ENABLE TRIGGER trg_enforce_saved_prompt_revision_lineage;
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT public.duplicate_prompt_project_to_folder('ee000000-0000-4000-8000-000000000001',NULL,'Must roll back')$q$);
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.prompt_projects WHERE name='Must roll back'),'Failed copy atomic rollback');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','dd000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$INSERT INTO public.library_folders(user_id,name) VALUES(auth.uid(),'Banned')$q$,'42501');
SELECT pg_temp.denied($q$SELECT public.duplicate_prompt_project_to_folder('ee000000-0000-4000-8000-000000000003',NULL,'Banned')$q$);
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.denied($q$SELECT public.duplicate_prompt_project_to_folder('ee000000-0000-4000-8000-000000000001',NULL,'Anonymous')$q$,'42501');
RESET ROLE;
SELECT pg_temp.assert(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.duplicate_prompt_project_to_folder(uuid,uuid,text)'::regprocedure),'Invoker/RLS preserved');
SELECT pg_temp.assert(NOT has_function_privilege('anon','public.duplicate_prompt_project_to_folder(uuid,uuid,text)','EXECUTE'),'No anon RPC grant');
ROLLBACK;
