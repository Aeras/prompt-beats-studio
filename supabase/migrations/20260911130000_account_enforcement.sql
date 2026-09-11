-- Account enforcement: block metadata, registration suppression, and safe RPCs.

ALTER TABLE public.profile_private
  ADD COLUMN IF NOT EXISTS block_reason_code text,
  ADD COLUMN IF NOT EXISTS block_reason_text text,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.profile_private
  DROP CONSTRAINT IF EXISTS profile_private_block_reason_code_check;
ALTER TABLE public.profile_private
  ADD CONSTRAINT profile_private_block_reason_code_check CHECK (
    block_reason_code IS NULL OR block_reason_code IN (
      'platform_rules', 'copyright_or_third_party_rights',
      'abuse_spam_or_harmful_activity', 'ai_or_platform_misuse',
      'security_concern', 'other'
    )
  );

CREATE TABLE IF NOT EXISTS public.registration_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL UNIQUE,
  reason_code text NOT NULL CHECK (reason_code IN (
    'platform_rules', 'copyright_or_third_party_rights',
    'abuse_spam_or_harmful_activity', 'ai_or_platform_misuse',
    'security_concern', 'other'
  )),
  reason_text text,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  blocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT registration_blocks_other_reason_check CHECK (
    (reason_code = 'other' AND length(trim(COALESCE(reason_text, ''))) > 0)
    OR reason_code <> 'other'
  )
);

CREATE INDEX IF NOT EXISTS registration_blocks_blocked_idx
  ON public.registration_blocks (blocked_at DESC);

ALTER TABLE public.registration_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_blocks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.registration_blocks TO service_role;

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN (
  'BLOCK_USER', 'UNBLOCK_USER', 'DELETE_USER', 'UPDATE_MODEL_ACCESS',
  'BLOCK_REGISTRATION', 'UNBLOCK_REGISTRATION'
));

CREATE OR REPLACE FUNCTION public.normalize_registration_email(_email text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT lower(trim(COALESCE(_email, '')));
$$;

REVOKE ALL ON FUNCTION public.normalize_registration_email(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reject_blocked_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.registration_blocks
    WHERE email_normalized = public.normalize_registration_email(NEW.email)
  ) THEN
    RAISE EXCEPTION 'Registration with this email is not available. Contact support@promptbeats.app for assistance.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_blocked_registration ON auth.users;
CREATE TRIGGER reject_blocked_registration
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.reject_blocked_registration();

CREATE OR REPLACE FUNCTION public.get_my_account_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT jsonb_build_object(
    'is_banned', COALESCE(pp.is_banned, false),
    'reason', CASE pp.block_reason_code
      WHEN 'platform_rules' THEN 'Violation of platform rules'
      WHEN 'copyright_or_third_party_rights' THEN 'Copyright or third-party rights concern'
      WHEN 'abuse_spam_or_harmful_activity' THEN 'Abuse, spam or harmful activity'
      WHEN 'ai_or_platform_misuse' THEN 'Misuse of AI or platform features'
      WHEN 'security_concern' THEN 'Security concern'
      WHEN 'other' THEN NULLIF(pp.block_reason_text, '')
      ELSE NULL
    END,
    'blocked_at', pp.blocked_at
  )
  FROM (SELECT auth.uid() AS user_id) me
  LEFT JOIN public.profile_private pp ON pp.user_id = me.user_id
  WHERE me.user_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_account_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_account_status() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_set_user_banned(uuid, boolean);
CREATE OR REPLACE FUNCTION public.admin_set_user_banned(
  _target_user_id uuid,
  _banned boolean,
  _reason_code text DEFAULT NULL,
  _reason_text text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_admin uuid := auth.uid();
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _target_user_id = v_admin THEN RAISE EXCEPTION 'cannot change your own account status'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _target_user_id) THEN RAISE EXCEPTION 'user not found'; END IF;
  IF public.has_role(_target_user_id, 'admin') THEN RAISE EXCEPTION 'admin accounts are protected'; END IF;
  IF _banned AND (_reason_code IS NULL OR _reason_code NOT IN (
    'platform_rules', 'copyright_or_third_party_rights',
    'abuse_spam_or_harmful_activity', 'ai_or_platform_misuse',
    'security_concern', 'other'
  )) THEN RAISE EXCEPTION 'a valid block reason is required'; END IF;
  IF _banned AND _reason_code = 'other' AND length(trim(COALESCE(_reason_text, ''))) = 0 THEN
    RAISE EXCEPTION 'custom block reason is required';
  END IF;

  INSERT INTO public.profile_private (
    user_id, is_banned, block_reason_code, block_reason_text, blocked_at, blocked_by
  ) VALUES (
    _target_user_id, _banned,
    CASE WHEN _banned THEN _reason_code ELSE NULL END,
    CASE WHEN _banned AND _reason_code = 'other' THEN trim(_reason_text) ELSE NULL END,
    CASE WHEN _banned THEN now() ELSE NULL END,
    CASE WHEN _banned THEN v_admin ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    is_banned = EXCLUDED.is_banned,
    block_reason_code = EXCLUDED.block_reason_code,
    block_reason_text = EXCLUDED.block_reason_text,
    blocked_at = EXCLUDED.blocked_at,
    blocked_by = EXCLUDED.blocked_by;

  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details)
  VALUES (v_admin, _target_user_id, CASE WHEN _banned THEN 'BLOCK_USER' ELSE 'UNBLOCK_USER' END,
    CASE WHEN _banned THEN jsonb_build_object('reason_code', _reason_code,
      'has_custom_reason', (_reason_code = 'other')) ELSE '{}'::jsonb END);
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
    'block_reason_code', pp.block_reason_code, 'block_reason_text', pp.block_reason_text,
    'blocked_at', pp.blocked_at,
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

CREATE OR REPLACE FUNCTION public.admin_create_registration_block(
  _email text, _reason_code text, _reason_text text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_email text := public.normalize_registration_email(_email);
  v_id uuid;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF v_email = '' OR _reason_code NOT IN (
    'platform_rules', 'copyright_or_third_party_rights',
    'abuse_spam_or_harmful_activity', 'ai_or_platform_misuse',
    'security_concern', 'other'
  ) THEN RAISE EXCEPTION 'invalid registration block'; END IF;
  IF _reason_code = 'other' AND length(trim(COALESCE(_reason_text, ''))) = 0 THEN
    RAISE EXCEPTION 'custom registration block reason is required';
  END IF;
  INSERT INTO public.registration_blocks (email_normalized, reason_code, reason_text, blocked_by)
  VALUES (v_email, _reason_code, CASE WHEN _reason_code = 'other' THEN trim(_reason_text) ELSE NULL END, v_admin)
  ON CONFLICT (email_normalized) DO UPDATE SET reason_code = EXCLUDED.reason_code,
    reason_text = EXCLUDED.reason_text, blocked_at = now(), blocked_by = EXCLUDED.blocked_by
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Preserve the legacy RPC surface while ensuring legacy moderation calls also
-- record the canonical block metadata. The newer admin RPC supplies a reason.
CREATE OR REPLACE FUNCTION public.set_user_banned(_user_id uuid, _banned boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'cannot change your own account status'; END IF;
  IF public.has_role(_user_id, 'admin') THEN RAISE EXCEPTION 'admin accounts are protected'; END IF;
  INSERT INTO public.profile_private (user_id, is_banned, block_reason_code, block_reason_text, blocked_at, blocked_by)
  VALUES (_user_id, _banned, CASE WHEN _banned THEN 'other' ELSE NULL END,
    CASE WHEN _banned THEN 'Legacy moderation action' ELSE NULL END,
    CASE WHEN _banned THEN now() ELSE NULL END, CASE WHEN _banned THEN auth.uid() ELSE NULL END)
  ON CONFLICT (user_id) DO UPDATE SET is_banned = EXCLUDED.is_banned,
    block_reason_code = EXCLUDED.block_reason_code, block_reason_text = EXCLUDED.block_reason_text,
    blocked_at = EXCLUDED.blocked_at, blocked_by = EXCLUDED.blocked_by;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_registration_blocks(
  _search text DEFAULT '', _limit integer DEFAULT 25, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_search text := public.normalize_registration_email(_search);
  v_result jsonb;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.registration_blocks WHERE v_search = '' OR email_normalized LIKE '%' || v_search || '%'),
    'blocks', COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.blocked_at DESC) FROM (
      SELECT id, email_normalized, reason_code, reason_text, blocked_at FROM public.registration_blocks
      WHERE v_search = '' OR email_normalized LIKE '%' || v_search || '%'
      ORDER BY blocked_at DESC LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 100)
      OFFSET GREATEST(COALESCE(_offset, 0), 0)
    ) q), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_registration_block(_block_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_email text;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  DELETE FROM public.registration_blocks WHERE id = _block_id RETURNING email_normalized INTO v_email;
  IF v_email IS NULL THEN RAISE EXCEPTION 'registration block not found'; END IF;
  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details)
  VALUES (v_admin, NULL, 'UNBLOCK_REGISTRATION', jsonb_build_object('registration_block_id', _block_id));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_banned(uuid, boolean, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create_registration_block(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_registration_blocks(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_remove_registration_block(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_banned(uuid, boolean, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_registration_block(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_registration_blocks(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_remove_registration_block(uuid) TO authenticated, service_role;

-- Direct client mutations remain owner-scoped, but blocked accounts must not
-- use them as a bypass around the server-function account gate.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id AND NOT public.is_banned(auth.uid()))
  WITH CHECK (auth.uid() = id AND NOT public.is_banned(auth.uid()));
DROP POLICY IF EXISTS "Users can mark their own welcome email sent" ON public.profile_private;
CREATE POLICY "Users can mark their own welcome email sent" ON public.profile_private FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND NOT public.is_banned(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));

DROP POLICY IF EXISTS "Users can create their own tracks" ON public.tracks;
CREATE POLICY "Users can create their own tracks" ON public.tracks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
DROP POLICY IF EXISTS "Users can update their own tracks" ON public.tracks;
CREATE POLICY "Users can update their own tracks" ON public.tracks FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND NOT public.is_banned(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
DROP POLICY IF EXISTS "Users can delete their own tracks" ON public.tracks;
CREATE POLICY "Users can delete their own tracks" ON public.tracks FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));

DROP POLICY IF EXISTS "Users manage their own saved prompts" ON public.saved_prompts;
CREATE POLICY "Users manage their own saved prompts" ON public.saved_prompts FOR ALL TO authenticated
  USING (auth.uid() = user_id AND NOT public.is_banned(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));

DROP POLICY IF EXISTS "Users can like as themselves" ON public.likes;
CREATE POLICY "Users can like as themselves" ON public.likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
DROP POLICY IF EXISTS "Users can remove their own likes" ON public.likes;
CREATE POLICY "Users can remove their own likes" ON public.likes FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));

DROP POLICY IF EXISTS "Users can upload own avatars" ON storage.objects;
CREATE POLICY "Users can upload own avatars" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.is_banned(auth.uid()));
DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
CREATE POLICY "Users can update own avatars" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.is_banned(auth.uid()))
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.is_banned(auth.uid()));
DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;
CREATE POLICY "Users can delete own avatars" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.is_banned(auth.uid()));
DROP POLICY IF EXISTS "Users manage their own avatar files" ON storage.objects;
CREATE POLICY "Users manage their own avatar files" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.is_banned(auth.uid()))
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.is_banned(auth.uid()));
DROP POLICY IF EXISTS "Users can upload their own track covers" ON storage.objects;
CREATE POLICY "Users can upload their own track covers" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'track-covers' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.is_banned(auth.uid()));
DROP POLICY IF EXISTS "Users can update their own track covers" ON storage.objects;
CREATE POLICY "Users can update their own track covers" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'track-covers' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.is_banned(auth.uid()))
  WITH CHECK (bucket_id = 'track-covers' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.is_banned(auth.uid()));
DROP POLICY IF EXISTS "Users can delete their own track covers" ON storage.objects;
CREATE POLICY "Users can delete their own track covers" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'track-covers' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.is_banned(auth.uid()));

-- Existing clients need only safe moderation columns; block actor/internal data stays private.
REVOKE SELECT ON public.profile_private FROM authenticated;
GRANT SELECT (user_id, is_banned, welcome_email_sent_at) ON public.profile_private TO authenticated;
