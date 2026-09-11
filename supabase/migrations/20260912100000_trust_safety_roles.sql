-- Trust & Safety roles, moderation suspension, centralized capabilities, and
-- the minimal system-derived public staff badge projection.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'senior_moderator';

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'active';

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_moderation_status_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_moderation_status_check CHECK (
  moderation_status IN ('active', 'suspended')
  AND (moderation_status = 'active' OR role::text IN ('moderator', 'senior_moderator'))
);

-- Normalize legacy data before enforcing one canonical role row per account.
-- The highest role wins; ties are resolved deterministically by newest row.
WITH ranked_roles AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id
    ORDER BY CASE role::text
      WHEN 'admin' THEN 4
      WHEN 'senior_moderator' THEN 3
      WHEN 'moderator' THEN 2
      ELSE 1
    END DESC, created_at DESC, id DESC
  ) AS row_number
  FROM public.user_roles
)
DELETE FROM public.user_roles ur
USING ranked_roles rr
WHERE ur.id = rr.id AND rr.row_number > 1;

-- Existing normal accounts that never had an explicit role receive the
-- canonical user role rather than being left without a role row.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE ur.user_id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_role_per_user_idx
  ON public.user_roles (user_id);

CREATE INDEX IF NOT EXISTS user_roles_role_status_idx
  ON public.user_roles (role, moderation_status, user_id);

REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_moderation_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := 'user';
  v_status text := 'active';
  v_is_banned boolean := true;
  v_can_moderate boolean := false;
BEGIN
  SELECT ur.role::text, ur.moderation_status, COALESCE(pp.is_banned, true)
    INTO v_role, v_status, v_is_banned
  FROM public.user_roles ur
  LEFT JOIN public.profile_private pp ON pp.user_id = ur.user_id
  WHERE ur.user_id = auth.uid()
  ORDER BY CASE ur.role::text
    WHEN 'admin' THEN 4
    WHEN 'senior_moderator' THEN 3
    WHEN 'moderator' THEN 2
    ELSE 1
  END DESC
  LIMIT 1;

  v_can_moderate := NOT v_is_banned AND (v_role = 'admin' OR (v_role IN ('moderator', 'senior_moderator') AND v_status = 'active'));

  RETURN jsonb_build_object(
    'role', v_role,
    'status', v_status,
    'can_view_users', v_can_moderate,
    'can_block_users', v_can_moderate,
    'can_unblock_users', v_can_moderate,
    'can_suspend_moderator', NOT v_is_banned AND v_role IN ('admin', 'senior_moderator') AND (v_role = 'admin' OR v_status = 'active'),
    'can_manage_roles', NOT v_is_banned AND v_role = 'admin',
    'can_delete_users', NOT v_is_banned AND v_role = 'admin',
    'can_manage_registration_blocks', NOT v_is_banned AND v_role = 'admin',
    'can_manage_model_access', NOT v_is_banned AND v_role = 'admin',
    'can_access_admin_settings', NOT v_is_banned AND v_role = 'admin',
    'can_review_reported_message', v_can_moderate,
    'can_review_reported_conversation', NOT v_is_banned AND v_role IN ('admin', 'senior_moderator')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_moderation_capability(_capability text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_context jsonb := public.get_my_moderation_context();
BEGIN
  RETURN COALESCE((v_context ->> _capability)::boolean, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_moderate_target(_target_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_actor_role text; v_target_role text;
BEGIN
  IF v_actor IS NULL OR v_actor = _target_user_id THEN RETURN false; END IF;
  SELECT role::text INTO v_actor_role FROM public.user_roles WHERE user_id = v_actor ORDER BY CASE role::text WHEN 'admin' THEN 4 WHEN 'senior_moderator' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END DESC LIMIT 1;
  SELECT COALESCE((SELECT role::text FROM public.user_roles WHERE user_id = _target_user_id ORDER BY CASE role::text WHEN 'admin' THEN 4 WHEN 'senior_moderator' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END DESC LIMIT 1), 'user') INTO v_target_role;
  RETURN (v_actor_role = 'admin' AND v_target_role <> 'admin') OR (v_actor_role IN ('moderator','senior_moderator') AND public.has_moderation_capability('can_block_users') AND v_target_role = 'user');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users(
  _search text DEFAULT '', _status text DEFAULT 'all', _limit integer DEFAULT 25, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_user uuid := auth.uid(); v_total integer; v_users jsonb;
BEGIN
  IF NOT public.has_moderation_capability('can_view_users') THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT count(*) INTO v_total FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.profile_private pp ON pp.user_id = u.id
    WHERE (_search = '' OR u.email ILIKE '%' || _search || '%' OR p.handle ILIKE '%' || _search || '%' OR p.display_name ILIKE '%' || _search || '%')
      AND (_status = 'all' OR (_status = 'blocked' AND COALESCE(pp.is_banned, false)) OR (_status = 'active' AND NOT COALESCE(pp.is_banned, false)));
  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_users FROM (
    SELECT u.id, u.email, u.created_at, p.handle, p.display_name,
      COALESCE(pp.is_banned, false) AS blocked,
      (r.role::text = 'admin') AS is_admin,
      COALESCE(r.role::text, 'user') AS role,
      COALESCE(r.moderation_status, 'active') AS moderation_status,
      (SELECT count(*) FROM public.tracks t WHERE t.user_id = u.id) AS generations
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.profile_private pp ON pp.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT ur.role, ur.moderation_status FROM public.user_roles ur WHERE ur.user_id = u.id
      ORDER BY CASE ur.role::text WHEN 'admin' THEN 4 WHEN 'senior_moderator' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END DESC LIMIT 1
    ) r ON true
    WHERE (_search = '' OR u.email ILIKE '%' || _search || '%' OR p.handle ILIKE '%' || _search || '%' OR p.display_name ILIKE '%' || _search || '%')
      AND (_status = 'all' OR (_status = 'blocked' AND COALESCE(pp.is_banned, false)) OR (_status = 'active' AND NOT COALESCE(pp.is_banned, false)))
    ORDER BY u.created_at DESC LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0)
  ) x;
  RETURN jsonb_build_object('total', v_total, 'users', v_users);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_user_detail(_target_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_user auth.users%ROWTYPE; v_profile public.profiles%ROWTYPE; v_private public.profile_private%ROWTYPE; v_role text := 'user'; v_status text := 'active'; v_access jsonb; v_is_admin boolean;
BEGIN
  IF NOT public.has_moderation_capability('can_view_users') THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO v_user FROM auth.users WHERE id = _target_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = _target_user_id;
  SELECT * INTO v_private FROM public.profile_private WHERE user_id = _target_user_id;
  SELECT ur.role::text, ur.moderation_status INTO v_role, v_status FROM public.user_roles ur WHERE ur.user_id = _target_user_id ORDER BY CASE ur.role::text WHEN 'admin' THEN 4 WHEN 'senior_moderator' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END DESC LIMIT 1;
  v_is_admin := public.has_moderation_capability('can_manage_model_access');
  IF v_is_admin THEN
    SELECT jsonb_build_object('mode', access_mode, 'models', allowed_models) INTO v_access FROM public.user_model_access WHERE user_id = _target_user_id;
  END IF;
  RETURN jsonb_build_object(
    'id', v_user.id, 'email', v_user.email, 'created_at', v_user.created_at,
    'handle', v_profile.handle, 'display_name', v_profile.display_name,
    'blocked', COALESCE(v_private.is_banned, false), 'is_admin', v_role = 'admin',
    'role', v_role, 'moderation_status', v_status,
    'generations', (SELECT count(*) FROM public.tracks WHERE user_id = _target_user_id),
    'ai_requests', (SELECT count(*) FROM public.ai_usage_logs WHERE user_id = _target_user_id),
    'model_access', CASE WHEN v_is_admin THEN COALESCE(v_access, jsonb_build_object('mode', 'inherit', 'models', '[]'::jsonb)) ELSE jsonb_build_object('mode', 'inherit', 'models', '[]'::jsonb) END,
    'block_reason_code', v_private.block_reason_code, 'block_reason_text', v_private.block_reason_text,
    'blocked_at', v_private.blocked_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_banned(
  _target_user_id uuid, _banned boolean, _reason_code text DEFAULT NULL, _reason_text text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid := auth.uid(); v_actor_role text; v_target_role text;
BEGIN
  IF NOT public.has_moderation_capability(CASE WHEN _banned THEN 'can_block_users' ELSE 'can_unblock_users' END) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _target_user_id) THEN RAISE EXCEPTION 'user not found'; END IF;
  SELECT role::text INTO v_actor_role FROM public.user_roles WHERE user_id = v_actor ORDER BY CASE role::text WHEN 'admin' THEN 4 WHEN 'senior_moderator' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END DESC LIMIT 1;
  SELECT COALESCE((SELECT role::text FROM public.user_roles WHERE user_id = _target_user_id ORDER BY CASE role::text WHEN 'admin' THEN 4 WHEN 'senior_moderator' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END DESC LIMIT 1), 'user') INTO v_target_role;
  IF _target_user_id = v_actor OR v_target_role = 'admin' THEN RAISE EXCEPTION 'protected account'; END IF;
  IF v_actor_role <> 'admin' AND v_target_role <> 'user' THEN RAISE EXCEPTION 'moderators may only act on normal users'; END IF;
  IF _banned AND (_reason_code IS NULL OR _reason_code NOT IN ('platform_rules','copyright_or_third_party_rights','abuse_spam_or_harmful_activity','ai_or_platform_misuse','security_concern','other')) THEN RAISE EXCEPTION 'a valid block reason is required'; END IF;
  IF _banned AND _reason_code = 'other' AND length(trim(COALESCE(_reason_text, ''))) = 0 THEN RAISE EXCEPTION 'custom block reason is required'; END IF;
  INSERT INTO public.profile_private (user_id, is_banned, block_reason_code, block_reason_text, blocked_at, blocked_by)
    VALUES (_target_user_id, _banned, CASE WHEN _banned THEN _reason_code ELSE NULL END, CASE WHEN _banned AND _reason_code = 'other' THEN trim(_reason_text) ELSE NULL END, CASE WHEN _banned THEN now() ELSE NULL END, CASE WHEN _banned THEN v_actor ELSE NULL END)
    ON CONFLICT (user_id) DO UPDATE SET is_banned = EXCLUDED.is_banned, block_reason_code = EXCLUDED.block_reason_code, block_reason_text = EXCLUDED.block_reason_text, blocked_at = EXCLUDED.blocked_at, blocked_by = EXCLUDED.blocked_by;
  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details) VALUES (v_actor, _target_user_id, CASE WHEN _banned THEN 'BLOCK_USER' ELSE 'UNBLOCK_USER' END, jsonb_build_object('reason_code', _reason_code, 'has_custom_reason', _reason_code = 'other'));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(_target_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid := auth.uid(); v_old text; v_action text;
BEGIN
  IF NOT public.has_moderation_capability('can_manage_roles') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _target_user_id = v_actor THEN RAISE EXCEPTION 'cannot change your own role'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _target_user_id) THEN RAISE EXCEPTION 'user not found'; END IF;
  IF public.has_role(_target_user_id, 'admin') THEN RAISE EXCEPTION 'admin accounts are protected'; END IF;
  IF _role::text NOT IN ('user','moderator','senior_moderator') THEN RAISE EXCEPTION 'invalid assignable role'; END IF;
  SELECT role::text INTO v_old FROM public.user_roles WHERE user_id = _target_user_id ORDER BY CASE role::text WHEN 'admin' THEN 4 WHEN 'senior_moderator' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END DESC LIMIT 1;
  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  INSERT INTO public.user_roles (user_id, role, moderation_status) VALUES (_target_user_id, _role, 'active');
  v_action := CASE WHEN _role::text = 'moderator' THEN 'ASSIGN_MODERATOR_ROLE' WHEN _role::text = 'senior_moderator' THEN 'ASSIGN_SENIOR_MODERATOR_ROLE' WHEN v_old IN ('moderator','senior_moderator') THEN 'REMOVE_MODERATOR_ROLE' ELSE 'CHANGE_MODERATOR_ROLE' END;
  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details) VALUES (v_actor, _target_user_id, v_action, jsonb_build_object('from_role', v_old, 'to_role', _role::text));
END;
$$;

DROP FUNCTION IF EXISTS public.admin_set_moderation_status(uuid, text);
CREATE OR REPLACE FUNCTION public.admin_set_moderation_status(_target_user_id uuid, _status text, _reason_text text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid := auth.uid(); v_actor_role text; v_target_role text;
BEGIN
  IF _status NOT IN ('active','suspended') THEN RAISE EXCEPTION 'invalid moderation status'; END IF;
  IF _status = 'suspended' AND length(trim(COALESCE(_reason_text, ''))) = 0 THEN RAISE EXCEPTION 'a suspension reason is required'; END IF;
  IF NOT public.has_moderation_capability('can_suspend_moderator') THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT role::text INTO v_actor_role FROM public.user_roles WHERE user_id = v_actor ORDER BY CASE role::text WHEN 'admin' THEN 4 WHEN 'senior_moderator' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END DESC LIMIT 1;
  SELECT role::text INTO v_target_role FROM public.user_roles WHERE user_id = _target_user_id ORDER BY CASE role::text WHEN 'admin' THEN 4 WHEN 'senior_moderator' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END DESC LIMIT 1;
  IF v_actor_role = 'admin' THEN NULL;
  ELSIF v_actor_role = 'senior_moderator' AND v_target_role = 'moderator' AND _status = 'suspended' AND v_actor <> _target_user_id THEN NULL;
  ELSE RAISE EXCEPTION 'not allowed'; END IF;
  IF v_target_role NOT IN ('moderator','senior_moderator') OR v_actor = _target_user_id OR (v_actor_role <> 'admin' AND v_target_role <> 'moderator') THEN RAISE EXCEPTION 'protected moderation role'; END IF;
  UPDATE public.user_roles SET moderation_status = _status WHERE user_id = _target_user_id AND role::text IN ('moderator','senior_moderator');
  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details) VALUES (v_actor, _target_user_id, CASE WHEN _status = 'suspended' THEN 'SUSPEND_MODERATOR' ELSE 'REACTIVATE_MODERATOR' END, jsonb_build_object('role', v_target_role, 'status', _status, 'reason', CASE WHEN _status = 'suspended' THEN trim(_reason_text) ELSE NULL END));
END;
$$;

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN (
  'BLOCK_USER','UNBLOCK_USER','DELETE_USER','UPDATE_MODEL_ACCESS',
  'BLOCK_REGISTRATION','UNBLOCK_REGISTRATION','ASSIGN_MODERATOR_ROLE',
  'ASSIGN_SENIOR_MODERATOR_ROLE','REMOVE_MODERATOR_ROLE','CHANGE_MODERATOR_ROLE',
  'SUSPEND_MODERATOR','REACTIVATE_MODERATOR'
));

REVOKE ALL ON FUNCTION public.get_my_moderation_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_moderation_capability(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_moderate_target(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_users(text,text,integer,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_user_detail(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_banned(uuid,boolean,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid,public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_moderation_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_moderation_context() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_moderation_capability(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_moderate_target(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text,text,integer,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_detail(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_banned(uuid,boolean,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid,public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_moderation_status(uuid,text,text) TO authenticated, service_role;

DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles WITH (security_invoker = false) AS
SELECT p.id, p.handle, p.display_name, p.artist_alias, p.avatar_url, p.bio,
  p.website_url, p.instagram_url, p.tiktok_url, p.youtube_url, p.x_url,
  p.donation_provider, p.donation_url, p.donation_custom_name,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.profile_private pp ON pp.user_id = p.id WHERE ur.user_id = p.id AND ur.role = 'admin' AND pp.is_banned = false) THEN 'PromptBeats Team'
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.profile_private pp ON pp.user_id = p.id WHERE ur.user_id = p.id AND ur.role::text IN ('moderator','senior_moderator') AND ur.moderation_status = 'active' AND pp.is_banned = false) THEN 'Moderator'
    ELSE NULL
  END AS staff_badge
FROM public.profiles p;
ALTER VIEW public.public_profiles OWNER TO postgres;
GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT ALL ON public.public_profiles TO service_role;
