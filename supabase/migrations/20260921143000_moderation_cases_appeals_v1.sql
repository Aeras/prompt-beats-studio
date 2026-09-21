-- PromptBeats Moderation Cases / System Messages / Appeals V1
-- Extends content_reports; does not replace the existing report, role, moderation-action, or audit systems.
BEGIN;

CREATE TABLE IF NOT EXISTS public.moderation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL UNIQUE REFERENCES public.content_reports(id) ON DELETE RESTRICT,
  target_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'awaiting_creator_response',
    'under_review',
    'awaiting_admin_decision',
    'decision_issued',
    'appeal_submitted',
    'appeal_under_admin_review',
    'pending_super_admin_approval',
    'final_closed'
  )),
  initial_decision_outcome text CHECK (initial_decision_outcome IS NULL OR initial_decision_outcome IN (
    'action_taken','no_violation','dismissed_abuse'
  )),
  initial_decision_reason text,
  initial_action_summary text,
  initial_appeal_eligible boolean NOT NULL DEFAULT false,
  initial_proposed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  initial_proposed_at timestamptz,
  initial_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  initial_approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CHECK (char_length(COALESCE(initial_decision_reason,'')) <= 2000),
  CHECK (char_length(COALESCE(initial_action_summary,'')) <= 2000)
);

CREATE INDEX IF NOT EXISTS moderation_cases_assignee_idx
  ON public.moderation_cases(assigned_to,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS moderation_cases_owner_idx
  ON public.moderation_cases(target_owner_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS moderation_cases_status_idx
  ON public.moderation_cases(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.moderation_case_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.moderation_cases(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_side text NOT NULL CHECK (sender_side IN ('creator','staff')),
  message_type text NOT NULL DEFAULT 'general' CHECK (message_type IN (
    'request_information',
    'request_proof_rights',
    'request_clarification',
    'temporary_restriction',
    'general'
  )),
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_case_messages_case_idx
  ON public.moderation_case_messages(case_id,created_at,id);

CREATE TABLE IF NOT EXISTS public.moderation_case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.moderation_cases(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_case_notes_case_idx
  ON public.moderation_case_notes(case_id,created_at,id);

CREATE TABLE IF NOT EXISTS public.moderation_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.moderation_cases(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  event_type text NOT NULL CHECK (event_type IN (
    'case_opened',
    'case_assigned',
    'case_reassigned',
    'case_released',
    'creator_contacted',
    'staff_message_sent',
    'creator_reply',
    'internal_note_added',
    'initial_decision_proposed',
    'initial_decision_issued',
    'appeal_submitted',
    'appeal_decision_proposed',
    'appeal_returned_for_review',
    'final_decision_issued',
    'case_closed',
    'case_reopened'
  )),
  creator_visible boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_case_events_case_idx
  ON public.moderation_case_events(case_id,created_at,id);

CREATE TABLE IF NOT EXISTS public.moderation_case_reads (
  case_id uuid NOT NULL REFERENCES public.moderation_cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(case_id,user_id)
);

CREATE TABLE IF NOT EXISTS public.moderation_case_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL UNIQUE REFERENCES public.moderation_cases(id) ON DELETE CASCADE,
  appellant_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  statement text NOT NULL CHECK (char_length(trim(statement)) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted',
    'under_admin_review',
    'pending_super_admin_approval',
    'returned_for_review',
    'finalized'
  )),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  admin_proposed_outcome text CHECK (admin_proposed_outcome IS NULL OR admin_proposed_outcome IN (
    'action_taken','no_violation','dismissed_abuse'
  )),
  admin_proposed_reason text,
  admin_action_summary text,
  admin_proposed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_proposed_at timestamptz,
  super_admin_action text CHECK (super_admin_action IS NULL OR super_admin_action IN (
    'approve','override','return'
  )),
  super_admin_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  super_admin_at timestamptz,
  final_outcome text CHECK (final_outcome IS NULL OR final_outcome IN (
    'action_taken','no_violation','dismissed_abuse'
  )),
  final_reason text,
  final_action_summary text,
  finalized_at timestamptz,
  CHECK (char_length(COALESCE(admin_proposed_reason,'')) <= 2000),
  CHECK (char_length(COALESCE(admin_action_summary,'')) <= 2000),
  CHECK (char_length(COALESCE(final_reason,'')) <= 2000),
  CHECK (char_length(COALESCE(final_action_summary,'')) <= 2000)
);

ALTER TABLE public.moderation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_case_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_case_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_case_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_case_appeals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.moderation_cases FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.moderation_case_messages FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.moderation_case_notes FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.moderation_case_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.moderation_case_reads FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.moderation_case_appeals FROM PUBLIC,anon,authenticated;

GRANT ALL ON public.moderation_cases TO service_role;
GRANT ALL ON public.moderation_case_messages TO service_role;
GRANT ALL ON public.moderation_case_notes TO service_role;
GRANT ALL ON public.moderation_case_events TO service_role;
GRANT ALL ON public.moderation_case_reads TO service_role;
GRANT ALL ON public.moderation_case_appeals TO service_role;

CREATE OR REPLACE FUNCTION public._moderation_case_actor_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((
    SELECT ur.role::text
    FROM public.user_roles ur
    WHERE ur.user_id=_user_id AND ur.moderation_status::text='active'
    ORDER BY public.app_role_rank(ur.role::text) DESC
    LIMIT 1
  ),'user');
$$;

CREATE OR REPLACE FUNCTION public._moderation_case_can_read(_case_id uuid,_actor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.moderation_cases c
    WHERE c.id=_case_id
      AND (
        c.target_owner_id=_actor
        OR public.has_moderation_capability('can_view_users')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.take_moderation_case(_report_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_actor_role text;
  v_report public.content_reports%ROWTYPE;
  v_case_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.has_moderation_capability('can_view_users') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  v_actor_role:=public._moderation_case_actor_role(v_actor);

  SELECT * INTO v_report FROM public.content_reports WHERE id=_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'report not found'; END IF;
  IF v_report.status NOT IN ('open','under_review') THEN RAISE EXCEPTION 'report is already resolved'; END IF;

  SELECT id INTO v_case_id FROM public.moderation_cases WHERE report_id=_report_id;
  IF FOUND THEN RAISE EXCEPTION 'case already assigned'; END IF;

  INSERT INTO public.moderation_cases(
    report_id,target_owner_id,assigned_to,assigned_by,assigned_at,status
  ) VALUES(
    _report_id,v_report.target_owner_id,v_actor,v_actor,now(),'open'
  ) RETURNING id INTO v_case_id;

  UPDATE public.content_reports
  SET status='under_review',reviewed_at=now(),reviewed_by=v_actor
  WHERE id=_report_id;

  INSERT INTO public.moderation_case_events(case_id,actor_user_id,actor_role,event_type,creator_visible,payload)
  VALUES
    (v_case_id,v_actor,v_actor_role,'case_opened',true,jsonb_build_object('report_id',_report_id)),
    (v_case_id,v_actor,v_actor_role,'case_assigned',false,jsonb_build_object('assigned_to',v_actor));

  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,v_report.target_owner_id,'TAKE_MODERATION_CASE',
    jsonb_build_object('case_id',v_case_id,'report_id',_report_id));

  RETURN v_case_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'case already assigned';
END;
$$;

CREATE OR REPLACE FUNCTION public.reassign_moderation_case(_case_id uuid,_new_assignee uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_actor_role text;
  v_old_assignee uuid;
  v_target_owner uuid;
  v_message_count integer;
  v_new_role text;
BEGIN
  IF v_actor IS NULL OR NOT public.current_user_is_admin_level() THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_actor_role:=public._moderation_case_actor_role(v_actor);

  SELECT assigned_to,target_owner_id INTO v_old_assignee,v_target_owner
  FROM public.moderation_cases WHERE id=_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case not found'; END IF;

  IF _new_assignee IS NULL THEN
    SELECT count(*)::integer INTO v_message_count
    FROM public.moderation_case_messages WHERE case_id=_case_id AND sender_side='staff';
    IF v_message_count>0 THEN RAISE EXCEPTION 'handled cases must be reassigned explicitly'; END IF;
  ELSE
    v_new_role:=public._moderation_case_actor_role(_new_assignee);
    IF public.app_role_rank(v_new_role)<2 THEN RAISE EXCEPTION 'assignee is not active moderation staff'; END IF;
  END IF;

  UPDATE public.moderation_cases
  SET assigned_to=_new_assignee,
      assigned_by=CASE WHEN _new_assignee IS NULL THEN NULL ELSE v_actor END,
      assigned_at=CASE WHEN _new_assignee IS NULL THEN NULL ELSE now() END,
      status=CASE WHEN _new_assignee IS NULL THEN 'open' ELSE status END,
      updated_at=now()
  WHERE id=_case_id;

  INSERT INTO public.moderation_case_events(case_id,actor_user_id,actor_role,event_type,creator_visible,payload)
  VALUES(
    _case_id,v_actor,v_actor_role,
    CASE WHEN _new_assignee IS NULL THEN 'case_released' ELSE 'case_reassigned' END,
    false,
    jsonb_build_object('previous_assignee',v_old_assignee,'new_assignee',_new_assignee)
  );

  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,v_target_owner,'REASSIGN_MODERATION_CASE',
    jsonb_build_object('case_id',_case_id,'previous_assignee',v_old_assignee,'new_assignee',_new_assignee));
END;
$$;

CREATE OR REPLACE FUNCTION public.send_moderation_case_message(
  _case_id uuid,
  _message_type text,
  _body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_actor_role text;
  v_case public.moderation_cases%ROWTYPE;
  v_side text;
  v_id uuid;
  v_first_staff boolean:=false;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _message_type NOT IN ('request_information','request_proof_rights','request_clarification','temporary_restriction','general') THEN
    RAISE EXCEPTION 'invalid message type';
  END IF;
  IF char_length(trim(COALESCE(_body,''))) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'invalid message'; END IF;

  SELECT * INTO v_case FROM public.moderation_cases WHERE id=_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case not found'; END IF;
  IF v_case.status NOT IN ('open','awaiting_creator_response','under_review','awaiting_admin_decision') THEN
    RAISE EXCEPTION 'case conversation is closed';
  END IF;

  v_actor_role:=public._moderation_case_actor_role(v_actor);

  IF v_case.target_owner_id=v_actor THEN
    v_side:='creator';
  ELSIF public.has_moderation_capability('can_view_users')
    AND (v_case.assigned_to=v_actor OR v_actor_role='super_admin') THEN
    v_side:='staff';
  ELSE
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF v_side='staff' THEN
    SELECT NOT EXISTS(
      SELECT 1 FROM public.moderation_case_messages
      WHERE case_id=_case_id AND sender_side='staff'
    ) INTO v_first_staff;
  END IF;

  INSERT INTO public.moderation_case_messages(case_id,sender_user_id,sender_side,message_type,body)
  VALUES(_case_id,v_actor,v_side,_message_type,trim(_body))
  RETURNING id INTO v_id;

  UPDATE public.moderation_cases
  SET status=CASE WHEN v_side='staff' THEN 'awaiting_creator_response' ELSE 'under_review' END,
      updated_at=now()
  WHERE id=_case_id;

  INSERT INTO public.moderation_case_events(case_id,actor_user_id,actor_role,event_type,creator_visible,payload)
  VALUES(
    _case_id,v_actor,v_actor_role,
    CASE WHEN v_side='staff' AND v_first_staff THEN 'creator_contacted'
         WHEN v_side='staff' THEN 'staff_message_sent'
         ELSE 'creator_reply' END,
    true,
    jsonb_build_object('message_id',v_id,'message_type',_message_type)
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_moderation_case_note(_case_id uuid,_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_actor_role text;
  v_case public.moderation_cases%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.has_moderation_capability('can_view_users') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF char_length(trim(COALESCE(_body,''))) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'invalid note'; END IF;
  SELECT * INTO v_case FROM public.moderation_cases WHERE id=_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case not found'; END IF;
  v_actor_role:=public._moderation_case_actor_role(v_actor);
  IF v_case.assigned_to<>v_actor AND v_actor_role<>'super_admin' THEN RAISE EXCEPTION 'not allowed'; END IF;

  INSERT INTO public.moderation_case_notes(case_id,author_user_id,body)
  VALUES(_case_id,v_actor,trim(_body)) RETURNING id INTO v_id;
  UPDATE public.moderation_cases SET updated_at=now() WHERE id=_case_id;

  INSERT INTO public.moderation_case_events(case_id,actor_user_id,actor_role,event_type,creator_visible,payload)
  VALUES(_case_id,v_actor,v_actor_role,'internal_note_added',false,jsonb_build_object('note_id',v_id));

  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,v_case.target_owner_id,'ADD_CASE_INTERNAL_NOTE',jsonb_build_object('case_id',_case_id,'note_id',v_id));

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.propose_initial_case_decision(
  _case_id uuid,
  _outcome text,
  _reason text,
  _action_summary text DEFAULT NULL,
  _appeal_eligible boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_actor_role text;
  v_case public.moderation_cases%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_moderation_capability('can_view_users') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _outcome NOT IN ('action_taken','no_violation','dismissed_abuse') THEN RAISE EXCEPTION 'invalid outcome'; END IF;
  IF char_length(trim(COALESCE(_reason,''))) NOT BETWEEN 1 AND 2000
     OR char_length(COALESCE(_action_summary,''))>2000 THEN RAISE EXCEPTION 'invalid decision content'; END IF;

  SELECT * INTO v_case FROM public.moderation_cases WHERE id=_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case not found'; END IF;
  v_actor_role:=public._moderation_case_actor_role(v_actor);
  IF v_case.assigned_to<>v_actor AND v_actor_role<>'super_admin' THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF v_case.status NOT IN ('open','awaiting_creator_response','under_review','awaiting_admin_decision') THEN
    RAISE EXCEPTION 'case is not eligible for an initial decision';
  END IF;

  UPDATE public.moderation_cases SET
    initial_decision_outcome=_outcome,
    initial_decision_reason=trim(_reason),
    initial_action_summary=NULLIF(trim(COALESCE(_action_summary,'')),''),
    initial_appeal_eligible=COALESCE(_appeal_eligible,true),
    initial_proposed_by=v_actor,
    initial_proposed_at=now(),
    initial_approved_by=NULL,
    initial_approved_at=NULL,
    status='awaiting_admin_decision',
    updated_at=now()
  WHERE id=_case_id;

  INSERT INTO public.moderation_case_events(case_id,actor_user_id,actor_role,event_type,creator_visible,payload)
  VALUES(_case_id,v_actor,v_actor_role,'initial_decision_proposed',false,
    jsonb_build_object('outcome',_outcome,'appeal_eligible',COALESCE(_appeal_eligible,true)));

  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,v_case.target_owner_id,'PROPOSE_INITIAL_CASE_DECISION',
    jsonb_build_object('case_id',_case_id,'outcome',_outcome,'appeal_eligible',COALESCE(_appeal_eligible,true)));
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_initial_case_decision(_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_actor_role text;
  v_case public.moderation_cases%ROWTYPE;
  v_assignee_role text;
  v_report_status text;
BEGIN
  IF v_actor IS NULL OR NOT public.current_user_is_admin_level() THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_actor_role:=public._moderation_case_actor_role(v_actor);

  SELECT * INTO v_case FROM public.moderation_cases WHERE id=_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case not found'; END IF;
  IF v_case.status<>'awaiting_admin_decision' OR v_case.initial_decision_outcome IS NULL OR v_case.initial_proposed_by IS NULL THEN
    RAISE EXCEPTION 'no pending initial decision';
  END IF;

  v_assignee_role:=public._moderation_case_actor_role(v_case.assigned_to);
  IF public.app_role_rank(v_assignee_role)>=4 AND v_case.assigned_to=v_actor THEN
    RAISE EXCEPTION 'admin handlers cannot self-approve';
  END IF;
  IF public.app_role_rank(public._moderation_case_actor_role(v_case.initial_proposed_by))>=4
     AND v_case.initial_proposed_by=v_actor THEN
    RAISE EXCEPTION 'admin proposers cannot self-approve';
  END IF;

  UPDATE public.moderation_cases SET
    initial_approved_by=v_actor,
    initial_approved_at=now(),
    status='decision_issued',
    updated_at=now(),
    closed_at=now()
  WHERE id=_case_id;

  v_report_status:=CASE v_case.initial_decision_outcome
    WHEN 'action_taken' THEN 'resolved_action_taken'
    WHEN 'no_violation' THEN 'resolved_no_violation'
    ELSE 'dismissed_abuse'
  END;

  UPDATE public.content_reports
  SET status=v_report_status,reviewed_at=now(),reviewed_by=v_actor,
      resolution=v_case.initial_decision_reason
  WHERE id=v_case.report_id;

  INSERT INTO public.moderation_case_events(case_id,actor_user_id,actor_role,event_type,creator_visible,payload)
  VALUES
    (_case_id,v_actor,v_actor_role,'initial_decision_issued',true,
      jsonb_build_object(
        'outcome',v_case.initial_decision_outcome,
        'reason',v_case.initial_decision_reason,
        'action_summary',v_case.initial_action_summary,
        'appeal_eligible',v_case.initial_appeal_eligible
      )),
    (_case_id,v_actor,v_actor_role,'case_closed',true,jsonb_build_object('closure','initial_decision'));

  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,v_case.target_owner_id,'APPROVE_INITIAL_CASE_DECISION',
    jsonb_build_object('case_id',_case_id,'report_id',v_case.report_id,'outcome',v_case.initial_decision_outcome));
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_moderation_case_appeal(_case_id uuid,_statement text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_case public.moderation_cases%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF char_length(trim(COALESCE(_statement,''))) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'invalid appeal'; END IF;

  SELECT * INTO v_case FROM public.moderation_cases WHERE id=_case_id FOR UPDATE;
  IF NOT FOUND OR v_case.target_owner_id<>v_actor THEN RAISE EXCEPTION 'case not found'; END IF;
  IF v_case.status<>'decision_issued' OR NOT v_case.initial_appeal_eligible THEN RAISE EXCEPTION 'appeal is not available'; END IF;
  IF EXISTS(SELECT 1 FROM public.moderation_case_appeals WHERE case_id=_case_id) THEN RAISE EXCEPTION 'appeal already submitted'; END IF;

  INSERT INTO public.moderation_case_appeals(case_id,appellant_user_id,statement)
  VALUES(_case_id,v_actor,trim(_statement)) RETURNING id INTO v_id;

  UPDATE public.moderation_cases
  SET status='appeal_submitted',updated_at=now(),closed_at=NULL
  WHERE id=_case_id;

  INSERT INTO public.moderation_case_events(case_id,actor_user_id,actor_role,event_type,creator_visible,payload)
  VALUES(_case_id,v_actor,'user','appeal_submitted',true,jsonb_build_object('appeal_id',v_id));

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.propose_moderation_case_appeal_decision(
  _case_id uuid,
  _outcome text,
  _reason text,
  _action_summary text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_actor_role text;
  v_case public.moderation_cases%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.current_user_is_admin_level() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _outcome NOT IN ('action_taken','no_violation','dismissed_abuse') THEN RAISE EXCEPTION 'invalid outcome'; END IF;
  IF char_length(trim(COALESCE(_reason,''))) NOT BETWEEN 1 AND 2000
     OR char_length(COALESCE(_action_summary,''))>2000 THEN RAISE EXCEPTION 'invalid decision content'; END IF;

  SELECT * INTO v_case FROM public.moderation_cases WHERE id=_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case not found'; END IF;
  IF v_case.status NOT IN ('appeal_submitted','appeal_under_admin_review') THEN
    RAISE EXCEPTION 'appeal is not awaiting admin review';
  END IF;
  v_actor_role:=public._moderation_case_actor_role(v_actor);

  UPDATE public.moderation_case_appeals SET
    status='pending_super_admin_approval',
    admin_proposed_outcome=_outcome,
    admin_proposed_reason=trim(_reason),
    admin_action_summary=NULLIF(trim(COALESCE(_action_summary,'')),''),
    admin_proposed_by=v_actor,
    admin_proposed_at=now(),
    super_admin_action=NULL,
    super_admin_by=NULL,
    super_admin_at=NULL
  WHERE case_id=_case_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'appeal not found'; END IF;

  UPDATE public.moderation_cases
  SET status='pending_super_admin_approval',updated_at=now()
  WHERE id=_case_id;

  INSERT INTO public.moderation_case_events(case_id,actor_user_id,actor_role,event_type,creator_visible,payload)
  VALUES(_case_id,v_actor,v_actor_role,'appeal_decision_proposed',false,jsonb_build_object('outcome',_outcome));

  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,v_case.target_owner_id,'PROPOSE_CASE_APPEAL_DECISION',
    jsonb_build_object('case_id',_case_id,'outcome',_outcome));
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_moderation_case_appeal(
  _case_id uuid,
  _action text,
  _override_outcome text DEFAULT NULL,
  _override_reason text DEFAULT NULL,
  _override_action_summary text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_case public.moderation_cases%ROWTYPE;
  v_appeal public.moderation_case_appeals%ROWTYPE;
  v_outcome text;
  v_reason text;
  v_summary text;
  v_report_status text;
BEGIN
  IF v_actor IS NULL OR NOT public.current_user_is_super_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _action NOT IN ('approve','override','return') THEN RAISE EXCEPTION 'invalid final action'; END IF;

  SELECT * INTO v_case FROM public.moderation_cases WHERE id=_case_id FOR UPDATE;
  IF NOT FOUND OR v_case.status<>'pending_super_admin_approval' THEN RAISE EXCEPTION 'case is not awaiting final approval'; END IF;
  SELECT * INTO v_appeal FROM public.moderation_case_appeals WHERE case_id=_case_id FOR UPDATE;
  IF NOT FOUND OR v_appeal.status<>'pending_super_admin_approval' THEN RAISE EXCEPTION 'appeal is not awaiting final approval'; END IF;

  IF _action='return' THEN
    UPDATE public.moderation_case_appeals SET
      status='returned_for_review',super_admin_action='return',super_admin_by=v_actor,super_admin_at=now()
    WHERE case_id=_case_id;
    UPDATE public.moderation_cases SET status='appeal_under_admin_review',updated_at=now() WHERE id=_case_id;

    INSERT INTO public.moderation_case_events(case_id,actor_user_id,actor_role,event_type,creator_visible,payload)
    VALUES(_case_id,v_actor,'super_admin','appeal_returned_for_review',false,'{}'::jsonb);

    INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
    VALUES(v_actor,v_case.target_owner_id,'FINALIZE_CASE_APPEAL',
      jsonb_build_object('case_id',_case_id,'action','return'));
    RETURN;
  END IF;

  IF _action='approve' THEN
    v_outcome:=v_appeal.admin_proposed_outcome;
    v_reason:=v_appeal.admin_proposed_reason;
    v_summary:=v_appeal.admin_action_summary;
  ELSE
    IF _override_outcome NOT IN ('action_taken','no_violation','dismissed_abuse') THEN RAISE EXCEPTION 'override outcome required'; END IF;
    IF char_length(trim(COALESCE(_override_reason,''))) NOT BETWEEN 1 AND 2000
       OR char_length(COALESCE(_override_action_summary,''))>2000 THEN RAISE EXCEPTION 'invalid override content'; END IF;
    v_outcome:=_override_outcome;
    v_reason:=trim(_override_reason);
    v_summary:=NULLIF(trim(COALESCE(_override_action_summary,'')),'');
  END IF;

  UPDATE public.moderation_case_appeals SET
    status='finalized',
    super_admin_action=_action,
    super_admin_by=v_actor,
    super_admin_at=now(),
    final_outcome=v_outcome,
    final_reason=v_reason,
    final_action_summary=v_summary,
    finalized_at=now()
  WHERE case_id=_case_id;

  UPDATE public.moderation_cases SET
    status='final_closed',updated_at=now(),closed_at=now()
  WHERE id=_case_id;

  v_report_status:=CASE v_outcome
    WHEN 'action_taken' THEN 'resolved_action_taken'
    WHEN 'no_violation' THEN 'resolved_no_violation'
    ELSE 'dismissed_abuse'
  END;
  UPDATE public.content_reports SET
    status=v_report_status,reviewed_at=now(),reviewed_by=v_actor,resolution=v_reason
  WHERE id=v_case.report_id;

  INSERT INTO public.moderation_case_events(case_id,actor_user_id,actor_role,event_type,creator_visible,payload)
  VALUES
    (_case_id,v_actor,'super_admin','final_decision_issued',true,
      jsonb_build_object('outcome',v_outcome,'reason',v_reason,'action_summary',v_summary)),
    (_case_id,v_actor,'super_admin','case_closed',true,jsonb_build_object('closure','final_appeal'));

  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,v_case.target_owner_id,'FINALIZE_CASE_APPEAL',
    jsonb_build_object('case_id',_case_id,'action',_action,'outcome',v_outcome));
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_moderation_case(_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_case public.moderation_cases%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.current_user_is_super_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO v_case FROM public.moderation_cases WHERE id=_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case not found'; END IF;
  IF v_case.status NOT IN ('decision_issued','final_closed') THEN RAISE EXCEPTION 'case is not closed'; END IF;

  UPDATE public.moderation_cases SET status='under_review',closed_at=NULL,updated_at=now() WHERE id=_case_id;
  UPDATE public.content_reports SET status='under_review',reviewed_at=now(),reviewed_by=v_actor WHERE id=v_case.report_id;

  INSERT INTO public.moderation_case_events(case_id,actor_user_id,actor_role,event_type,creator_visible,payload)
  VALUES(_case_id,v_actor,'super_admin','case_reopened',true,'{}'::jsonb);

  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,v_case.target_owner_id,'REOPEN_MODERATION_CASE',jsonb_build_object('case_id',_case_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_moderation_case_read(_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_actor uuid:=auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public._moderation_case_can_read(_case_id,v_actor) THEN RAISE EXCEPTION 'case not found'; END IF;
  INSERT INTO public.moderation_case_reads(case_id,user_id,last_read_at)
  VALUES(_case_id,v_actor,now())
  ON CONFLICT(case_id,user_id) DO UPDATE SET last_read_at=EXCLUDED.last_read_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_moderation_case_unread_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_is_staff boolean;
  v_count integer;
BEGIN
  IF v_actor IS NULL THEN RETURN 0; END IF;
  v_is_staff:=public.has_moderation_capability('can_view_users');

  SELECT count(*)::integer INTO v_count
  FROM public.moderation_cases c
  LEFT JOIN public.moderation_case_reads rd ON rd.case_id=c.id AND rd.user_id=v_actor
  WHERE
    ((NOT v_is_staff AND c.target_owner_id=v_actor) OR v_is_staff)
    AND EXISTS(
      SELECT 1
      FROM (
        SELECT m.created_at
        FROM public.moderation_case_messages m
        WHERE m.case_id=c.id
          AND (
            (v_is_staff AND m.sender_side='creator')
            OR (NOT v_is_staff AND m.sender_side='staff')
          )
        UNION ALL
        SELECT e.created_at
        FROM public.moderation_case_events e
        WHERE e.case_id=c.id
          AND (
            (NOT v_is_staff AND e.creator_visible)
            OR (v_is_staff AND e.event_type='creator_reply')
          )
      ) incoming
      WHERE incoming.created_at>COALESCE(rd.last_read_at,'epoch'::timestamptz)
    );
  RETURN COALESCE(v_count,0);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_moderation_cases()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'updated_at')::timestamptz DESC),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id',c.id,
      'report_id',c.report_id,
      'status',c.status,
      'updated_at',c.updated_at,
      'track_title',r.target_title,
      'category',r.category,
      'assigned_label',COALESCE(ap.artist_alias,ap.display_name,CASE WHEN ap.handle IS NOT NULL THEN '@'||ap.handle END,'PromptBeats Moderation'),
      'unread_count',(
        SELECT count(*)::integer
        FROM (
          SELECT m.created_at FROM public.moderation_case_messages m
          WHERE m.case_id=c.id AND m.sender_side='staff'
          UNION ALL
          SELECT e.created_at FROM public.moderation_case_events e
          WHERE e.case_id=c.id AND e.creator_visible
            AND e.event_type NOT IN ('creator_contacted','staff_message_sent','creator_reply')
        ) incoming
        WHERE incoming.created_at>COALESCE(rd.last_read_at,'epoch'::timestamptz)
      )
    ) AS row_data
    FROM public.moderation_cases c
    JOIN public.content_reports r ON r.id=c.report_id
    LEFT JOIN public.profiles ap ON ap.id=c.assigned_to
    LEFT JOIN public.moderation_case_reads rd ON rd.case_id=c.id AND rd.user_id=v_actor
    WHERE c.target_owner_id=v_actor
  ) q;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_moderation_case(_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_actor_role text;
  v_is_staff boolean;
  v_is_admin boolean;
  v_case public.moderation_cases%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_case FROM public.moderation_cases WHERE id=_case_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'case not found'; END IF;

  v_is_staff:=public.has_moderation_capability('can_view_users');
  IF NOT v_is_staff AND v_case.target_owner_id<>v_actor THEN RAISE EXCEPTION 'case not found'; END IF;
  v_is_admin:=public.current_user_is_admin_level();
  v_actor_role:=public._moderation_case_actor_role(v_actor);

  SELECT jsonb_build_object(
    'id',c.id,
    'report_id',c.report_id,
    'target_owner_id',c.target_owner_id,
    'assigned_to',c.assigned_to,
    'assigned_label',COALESCE(ap.artist_alias,ap.display_name,CASE WHEN ap.handle IS NOT NULL THEN '@'||ap.handle END),
    'status',c.status,
    'created_at',c.created_at,
    'updated_at',c.updated_at,
    'track_id',r.target_id,
    'track_title',r.target_title,
    'report_category',r.category,
    'report_details',r.details,
    'supporting_url',r.supporting_url,
    'creator_label',COALESCE(op.artist_alias,op.display_name,CASE WHEN op.handle IS NOT NULL THEN '@'||op.handle END),
    'reporter_user_id',CASE WHEN v_is_admin THEN r.reporter_user_id ELSE NULL END,
    'initial_decision_outcome',c.initial_decision_outcome,
    'initial_decision_reason',c.initial_decision_reason,
    'initial_action_summary',c.initial_action_summary,
    'initial_appeal_eligible',c.initial_appeal_eligible,
    'initial_proposed_by',CASE WHEN v_is_staff THEN c.initial_proposed_by ELSE NULL END,
    'initial_approved_by',CASE WHEN v_is_staff THEN c.initial_approved_by ELSE NULL END,
    'appeal',(
      SELECT CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id',a.id,
        'statement',a.statement,
        'status',a.status,
        'submitted_at',a.submitted_at,
        'admin_proposed_outcome',CASE WHEN v_is_staff THEN a.admin_proposed_outcome ELSE NULL END,
        'admin_proposed_reason',CASE WHEN v_is_staff THEN a.admin_proposed_reason ELSE NULL END,
        'admin_action_summary',CASE WHEN v_is_staff THEN a.admin_action_summary ELSE NULL END,
        'final_outcome',a.final_outcome,
        'final_reason',a.final_reason,
        'final_action_summary',a.final_action_summary,
        'finalized_at',a.finalized_at
      ) END
      FROM public.moderation_case_appeals a WHERE a.case_id=c.id
    ),
    'messages',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',m.id,'sender_user_id',m.sender_user_id,'sender_side',m.sender_side,
        'message_type',m.message_type,'body',m.body,'created_at',m.created_at,
        'sender_label',CASE
          WHEN m.sender_side='staff' THEN 'PromptBeats Moderation'
          ELSE COALESCE(sp.artist_alias,sp.display_name,CASE WHEN sp.handle IS NOT NULL THEN '@'||sp.handle END,'Creator')
        END
      ) ORDER BY m.created_at,m.id)
      FROM public.moderation_case_messages m
      LEFT JOIN public.profiles sp ON sp.id=m.sender_user_id
      WHERE m.case_id=c.id
    ),'[]'::jsonb),
    'events',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',e.id,'event_type',e.event_type,'actor_role',CASE WHEN v_is_staff THEN e.actor_role ELSE NULL END,
        'creator_visible',e.creator_visible,'payload',e.payload,'created_at',e.created_at
      ) ORDER BY e.created_at,e.id)
      FROM public.moderation_case_events e
      WHERE e.case_id=c.id AND (v_is_staff OR e.creator_visible)
    ),'[]'::jsonb),
    'notes',CASE WHEN v_is_staff THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',n.id,'author_user_id',n.author_user_id,'body',n.body,'created_at',n.created_at,
        'author_label',COALESCE(np.artist_alias,np.display_name,CASE WHEN np.handle IS NOT NULL THEN '@'||np.handle END)
      ) ORDER BY n.created_at,n.id)
      FROM public.moderation_case_notes n
      LEFT JOIN public.profiles np ON np.id=n.author_user_id
      WHERE n.case_id=c.id
    ),'[]'::jsonb) ELSE '[]'::jsonb END,
    'permissions',jsonb_build_object(
      'is_staff',v_is_staff,
      'actor_role',v_actor_role,
      'can_write',CASE
        WHEN c.status NOT IN ('open','awaiting_creator_response','under_review','awaiting_admin_decision') THEN false
        WHEN c.target_owner_id=v_actor THEN true
        WHEN v_is_staff AND (c.assigned_to=v_actor OR v_actor_role='super_admin') THEN true
        ELSE false END,
      'can_add_note',v_is_staff AND (c.assigned_to=v_actor OR v_actor_role='super_admin'),
      'can_reassign',v_is_admin,
      'can_propose_initial',v_is_staff AND (c.assigned_to=v_actor OR v_actor_role='super_admin')
        AND c.status IN ('open','awaiting_creator_response','under_review','awaiting_admin_decision'),
      'can_approve_initial',v_is_admin AND c.status='awaiting_admin_decision'
        AND NOT (
          public.app_role_rank(public._moderation_case_actor_role(c.assigned_to))>=4
          AND c.assigned_to=v_actor
        )
        AND NOT (
          public.app_role_rank(public._moderation_case_actor_role(c.initial_proposed_by))>=4
          AND c.initial_proposed_by=v_actor
        ),
      'can_appeal',c.target_owner_id=v_actor AND c.status='decision_issued' AND c.initial_appeal_eligible
        AND NOT EXISTS(SELECT 1 FROM public.moderation_case_appeals ax WHERE ax.case_id=c.id),
      'can_propose_appeal',v_is_admin AND c.status IN ('appeal_submitted','appeal_under_admin_review'),
      'can_finalize_appeal',v_actor_role='super_admin' AND c.status='pending_super_admin_approval',
      'can_reopen',v_actor_role='super_admin' AND c.status IN ('decision_issued','final_closed')
    )
  ) INTO v_result
  FROM public.moderation_cases c
  JOIN public.content_reports r ON r.id=c.report_id
  LEFT JOIN public.profiles ap ON ap.id=c.assigned_to
  LEFT JOIN public.profiles op ON op.id=c.target_owner_id
  WHERE c.id=_case_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_moderation_case_assignees()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_actor uuid:=auth.uid(); v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.current_user_is_admin_level() THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id',q.user_id,'role',q.role,'label',q.label
  ) ORDER BY public.app_role_rank(q.role) DESC,q.label),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT ur.user_id,ur.role::text AS role,
      COALESCE(p.artist_alias,p.display_name,CASE WHEN p.handle IS NOT NULL THEN '@'||p.handle END,ur.user_id::text) AS label
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id=ur.user_id
    WHERE ur.moderation_status::text='active'
      AND public.app_role_rank(ur.role::text)>=2
  ) q;
  RETURN v_result;
END;
$$;

-- Extend report projections with case ownership/status and per-staff unread state.
CREATE OR REPLACE FUNCTION public.list_content_reports(_scope text DEFAULT 'open')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_admin_level boolean;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.has_moderation_capability('can_view_users') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _scope NOT IN ('open','under_review','resolved','all') THEN RAISE EXCEPTION 'invalid report scope'; END IF;
  v_admin_level:=public.current_user_is_admin_level();

  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'created_at')::timestamptz DESC),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'id',r.id,'target_type',r.target_type,'target_id',r.target_id,'target_owner_id',r.target_owner_id,
      'category',r.category,'details',r.details,'supporting_url',r.supporting_url,'status',r.status,
      'created_at',r.created_at,'reviewed_at',r.reviewed_at,'reviewed_by',r.reviewed_by,
      'resolution',r.resolution,'moderator_notes',r.moderator_notes,
      'track_title',COALESCE(t.title,r.target_title),
      'track_is_published',COALESCE(t.is_published,false),
      'track_moderation_status',COALESCE(t.moderation_status,'deleted'),
      'creator_handle',owner_profile.handle,'creator_display_name',owner_profile.display_name,
      'creator_artist_alias',owner_profile.artist_alias,
      'reporter_user_id',CASE WHEN v_admin_level THEN r.reporter_user_id ELSE NULL END,
      'reporter_email',CASE WHEN v_admin_level THEN reporter.email ELSE NULL END,
      'reporter_handle',CASE WHEN v_admin_level THEN reporter_profile.handle ELSE NULL END,
      'reporter_display_name',CASE WHEN v_admin_level THEN reporter_profile.display_name ELSE NULL END,
      'case_id',c.id,'case_status',c.status,'case_assigned_to',c.assigned_to,
      'case_assigned_label',COALESCE(handler.artist_alias,handler.display_name,CASE WHEN handler.handle IS NOT NULL THEN '@'||handler.handle END),
      'case_unread_count',CASE WHEN c.id IS NULL THEN 0 ELSE (
        SELECT count(*)::integer
        FROM public.moderation_case_messages m
        LEFT JOIN public.moderation_case_reads rd ON rd.case_id=c.id AND rd.user_id=v_actor
        WHERE m.case_id=c.id AND m.sender_side='creator'
          AND m.created_at>COALESCE(rd.last_read_at,'epoch'::timestamptz)
      ) END
    )) AS row_data
    FROM public.content_reports r
    LEFT JOIN public.tracks t ON t.id=r.target_id AND r.target_type='track'
    LEFT JOIN public.profiles owner_profile ON owner_profile.id=r.target_owner_id
    LEFT JOIN auth.users reporter ON reporter.id=r.reporter_user_id AND v_admin_level
    LEFT JOIN public.profiles reporter_profile ON reporter_profile.id=r.reporter_user_id AND v_admin_level
    LEFT JOIN public.moderation_cases c ON c.report_id=r.id
    LEFT JOIN public.profiles handler ON handler.id=c.assigned_to
    WHERE
      _scope='all'
      OR (_scope='open' AND r.status='open')
      OR (_scope='under_review' AND r.status='under_review')
      OR (_scope='resolved' AND r.status IN ('resolved_action_taken','resolved_no_violation','dismissed_abuse'))
  ) q;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_content_report(_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_admin_level boolean;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.has_moderation_capability('can_view_users') THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_admin_level:=public.current_user_is_admin_level();

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id',r.id,'target_type',r.target_type,'target_id',r.target_id,'target_owner_id',r.target_owner_id,
    'category',r.category,'details',r.details,'supporting_url',r.supporting_url,'status',r.status,
    'created_at',r.created_at,'reviewed_at',r.reviewed_at,'reviewed_by',r.reviewed_by,
    'resolution',r.resolution,'moderator_notes',r.moderator_notes,
    'track_title',COALESCE(t.title,r.target_title),'track_is_published',COALESCE(t.is_published,false),
    'track_moderation_status',COALESCE(t.moderation_status,'deleted'),
    'creator_handle',owner_profile.handle,'creator_display_name',owner_profile.display_name,
    'creator_artist_alias',owner_profile.artist_alias,
    'reporter_user_id',CASE WHEN v_admin_level THEN r.reporter_user_id ELSE NULL END,
    'reporter_email',CASE WHEN v_admin_level THEN reporter.email ELSE NULL END,
    'reporter_handle',CASE WHEN v_admin_level THEN reporter_profile.handle ELSE NULL END,
    'reporter_display_name',CASE WHEN v_admin_level THEN reporter_profile.display_name ELSE NULL END,
    'case_id',c.id,'case_status',c.status,'case_assigned_to',c.assigned_to,
    'case_assigned_label',COALESCE(handler.artist_alias,handler.display_name,CASE WHEN handler.handle IS NOT NULL THEN '@'||handler.handle END)
  )) INTO v_result
  FROM public.content_reports r
  LEFT JOIN public.tracks t ON t.id=r.target_id AND r.target_type='track'
  LEFT JOIN public.profiles owner_profile ON owner_profile.id=r.target_owner_id
  LEFT JOIN auth.users reporter ON reporter.id=r.reporter_user_id AND v_admin_level
  LEFT JOIN public.profiles reporter_profile ON reporter_profile.id=r.reporter_user_id AND v_admin_level
  LEFT JOIN public.moderation_cases c ON c.report_id=r.id
  LEFT JOIN public.profiles handler ON handler.id=c.assigned_to
  WHERE r.id=_report_id;

  IF v_result IS NULL THEN RAISE EXCEPTION 'report not found'; END IF;
  RETURN v_result;
END;
$$;

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN (
  'BLOCK_USER','UNBLOCK_USER','DELETE_USER','UPDATE_MODEL_ACCESS',
  'BLOCK_REGISTRATION','UNBLOCK_REGISTRATION','ASSIGN_MODERATOR_ROLE',
  'ASSIGN_SENIOR_MODERATOR_ROLE','REMOVE_MODERATOR_ROLE','CHANGE_MODERATOR_ROLE',
  'SUSPEND_MODERATOR','REACTIVATE_MODERATOR','LOCK_TRACK','UNLOCK_TRACK','DELETE_TRACK',
  'UPDATE_AI_MODEL','UPDATE_AI_MODEL_DEFAULT','ADD_AI_MODEL',
  'UPDATE_DONATION_GLOBAL','UPDATE_DONATION_ACCESS',
  'ASSIGN_ADMIN_ROLE','REMOVE_ADMIN_ROLE','ASSIGN_SUPER_ADMIN_ROLE','REMOVE_SUPER_ADMIN_ROLE',
  'UPDATE_FEATURE_ACCESS_POLICY','ADD_FEATURE_ACCESS_USER','REMOVE_FEATURE_ACCESS_USER',
  'REVIEW_CONTENT_REPORT',
  'TAKE_MODERATION_CASE','REASSIGN_MODERATION_CASE','ADD_CASE_INTERNAL_NOTE',
  'PROPOSE_INITIAL_CASE_DECISION','APPROVE_INITIAL_CASE_DECISION',
  'PROPOSE_CASE_APPEAL_DECISION','FINALIZE_CASE_APPEAL','REOPEN_MODERATION_CASE'
));

REVOKE ALL ON FUNCTION public._moderation_case_actor_role(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public._moderation_case_can_read(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.take_moderation_case(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.reassign_moderation_case(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.send_moderation_case_message(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.add_moderation_case_note(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.propose_initial_case_decision(uuid,text,text,text,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.approve_initial_case_decision(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_moderation_case_appeal(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.propose_moderation_case_appeal_decision(uuid,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.finalize_moderation_case_appeal(uuid,text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.reopen_moderation_case(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mark_moderation_case_read(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_moderation_case_unread_count() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_my_moderation_cases() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_moderation_case(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_moderation_case_assignees() FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public._moderation_case_actor_role(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public._moderation_case_can_read(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.take_moderation_case(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reassign_moderation_case(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.send_moderation_case_message(uuid,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.add_moderation_case_note(uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.propose_initial_case_decision(uuid,text,text,text,boolean) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.approve_initial_case_decision(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_moderation_case_appeal(uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.propose_moderation_case_appeal_decision(uuid,text,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finalize_moderation_case_appeal(uuid,text,text,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reopen_moderation_case(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mark_moderation_case_read(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_moderation_case_unread_count() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_my_moderation_cases() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_moderation_case(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_moderation_case_assignees() TO authenticated,service_role;

COMMIT;
