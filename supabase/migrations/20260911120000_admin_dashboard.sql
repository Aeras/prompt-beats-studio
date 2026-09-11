-- Admin dashboard data and server-authoritative management routines.
-- All admin data is inaccessible to browser roles; the application uses the
-- service-role client only after checking the caller's authenticated admin role.

CREATE TABLE IF NOT EXISTS public.user_model_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_mode text NOT NULL DEFAULT 'inherit' CHECK (access_mode IN ('inherit', 'custom')),
  allowed_models text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_model_access_custom_models CHECK (
    access_mode = 'inherit' OR cardinality(allowed_models) > 0
  )
);

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('BLOCK_USER', 'UNBLOCK_USER', 'DELETE_USER', 'UPDATE_MODEL_ACCESS')),
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_model_access_updated_idx ON public.user_model_access (updated_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS profiles_search_idx ON public.profiles (handle, display_name);
CREATE INDEX IF NOT EXISTS profile_private_banned_idx ON public.profile_private (is_banned, user_id);

DROP TRIGGER IF EXISTS update_user_model_access_updated_at ON public.user_model_access;
CREATE TRIGGER update_user_model_access_updated_at BEFORE UPDATE ON public.user_model_access
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_model_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_model_access FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_model_access TO service_role;
GRANT ALL ON public.admin_audit_log TO service_role;

CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_user uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user, 'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT jsonb_build_object(
    'totalUsers', (SELECT count(*) FROM auth.users),
    'blockedUsers', (SELECT count(*) FROM public.profile_private WHERE is_banned),
    'songsGenerated', (SELECT count(*) FROM public.ai_generations),
    'aiRequests', (SELECT count(*) FROM public.ai_usage_logs),
    'failedRequests', (SELECT count(*) FROM public.ai_usage_logs WHERE NOT success),
    'estimatedCostUsd', COALESCE((SELECT sum(estimated_cost_usd) FROM public.ai_usage_logs), 0),
    'recentUsers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', p.id, 'handle', p.handle, 'displayName', p.display_name,
      'createdAt', p.created_at, 'blocked', COALESCE(pp.is_banned, false)
    ) ORDER BY p.created_at DESC) FROM (SELECT * FROM public.profiles ORDER BY created_at DESC LIMIT 8) p
      LEFT JOIN public.profile_private pp ON pp.user_id = p.id), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users(
  _search text DEFAULT '', _status text DEFAULT 'all', _limit integer DEFAULT 25, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_user uuid := auth.uid();
  v_limit integer := LEAST(GREATEST(COALESCE(_limit, 25), 1), 100);
  v_offset integer := GREATEST(COALESCE(_offset, 0), 0);
  v_search text := lower(trim(COALESCE(_search, '')));
  v_total bigint;
  v_result jsonb;
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user, 'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT count(*) INTO v_total
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.profile_private pp ON pp.user_id = u.id
  WHERE (v_search = '' OR lower(COALESCE(u.email, '')) LIKE '%' || v_search || '%'
    OR lower(COALESCE(p.handle, '')) LIKE '%' || v_search || '%'
    OR lower(COALESCE(p.display_name, '')) LIKE '%' || v_search || '%')
    AND (_status = 'all' OR (_status = 'blocked' AND COALESCE(pp.is_banned, false))
      OR (_status = 'active' AND NOT COALESCE(pp.is_banned, false)));
  SELECT jsonb_build_object(
    'total', v_total,
    'users', COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT u.id, u.email, u.created_at, p.handle, p.display_name,
      COALESCE(pp.is_banned, false) AS blocked,
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin') AS is_admin,
      (SELECT count(*) FROM public.ai_generations g WHERE g.user_id = u.id) AS generations
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.profile_private pp ON pp.user_id = u.id
    WHERE (v_search = '' OR lower(COALESCE(u.email, '')) LIKE '%' || v_search || '%'
      OR lower(COALESCE(p.handle, '')) LIKE '%' || v_search || '%'
      OR lower(COALESCE(p.display_name, '')) LIKE '%' || v_search || '%')
      AND (_status = 'all' OR (_status = 'blocked' AND COALESCE(pp.is_banned, false))
        OR (_status = 'active' AND NOT COALESCE(pp.is_banned, false)))
    ORDER BY u.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) q;
  RETURN COALESCE(v_result, jsonb_build_object('total', 0, 'users', '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_user_detail(_target_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_user uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user, 'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT jsonb_build_object(
    'id', u.id, 'email', u.email, 'created_at', u.created_at,
    'handle', p.handle, 'display_name', p.display_name,
    'blocked', COALESCE(pp.is_banned, false),
    'is_admin', EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin'),
    'generations', (SELECT count(*) FROM public.ai_generations g WHERE g.user_id = u.id),
    'ai_requests', (SELECT count(*) FROM public.ai_usage_logs l WHERE l.user_id = u.id),
    'model_access', jsonb_build_object(
      'mode', COALESCE(uma.access_mode, 'inherit'),
      'models', COALESCE(to_jsonb(uma.allowed_models), '[]'::jsonb)
    )
  ) INTO v_result
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.profile_private pp ON pp.user_id = u.id
  LEFT JOIN public.user_model_access uma ON uma.user_id = u.id
  WHERE u.id = _target_user_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_banned(_target_user_id uuid, _banned boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _target_user_id = auth.uid() THEN RAISE EXCEPTION 'cannot change your own account status'; END IF;
  INSERT INTO public.profile_private (user_id, is_banned) VALUES (_target_user_id, _banned)
    ON CONFLICT (user_id) DO UPDATE SET is_banned = EXCLUDED.is_banned;
  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details)
    VALUES (auth.uid(), _target_user_id, CASE WHEN _banned THEN 'BLOCK_USER' ELSE 'UNBLOCK_USER' END, '{}'::jsonb);
END;
$$;

-- Harden the pre-existing moderation RPC as well, so older admin UI paths
-- cannot accidentally lock out the currently authenticated administrator.
CREATE OR REPLACE FUNCTION public.set_user_banned(_user_id uuid, _banned boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'cannot change your own account status'; END IF;
  INSERT INTO public.profile_private (user_id, is_banned) VALUES (_user_id, _banned)
    ON CONFLICT (user_id) DO UPDATE SET is_banned = EXCLUDED.is_banned;
  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details)
    VALUES (auth.uid(), _user_id, CASE WHEN _banned THEN 'BLOCK_USER' ELSE 'UNBLOCK_USER' END, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_model_access(
  _target_user_id uuid, _access_mode text, _allowed_models text[]
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _access_mode NOT IN ('inherit', 'custom') THEN RAISE EXCEPTION 'invalid access mode'; END IF;
  IF _access_mode = 'custom' AND cardinality(COALESCE(_allowed_models, '{}')) = 0 THEN RAISE EXCEPTION 'custom access needs a model'; END IF;
  INSERT INTO public.user_model_access (user_id, access_mode, allowed_models)
    VALUES (_target_user_id, _access_mode, COALESCE(_allowed_models, '{}'))
    ON CONFLICT (user_id) DO UPDATE SET access_mode = EXCLUDED.access_mode,
      allowed_models = EXCLUDED.allowed_models, updated_at = now();
  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details)
    VALUES (auth.uid(), _target_user_id, 'UPDATE_MODEL_ACCESS',
      jsonb_build_object('mode', _access_mode, 'model_count', cardinality(COALESCE(_allowed_models, '{}'))));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_users(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_user_detail(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_user_banned(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_model_access(uuid, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_detail(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_banned(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_model_access(uuid, text, text[]) TO authenticated, service_role;
