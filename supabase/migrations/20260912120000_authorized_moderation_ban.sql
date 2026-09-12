-- Allow the existing protected moderation RPC to update is_banned while
-- keeping direct profile_private mutations blocked by the trigger.

CREATE OR REPLACE FUNCTION public.guard_profile_private_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $func$
BEGIN
  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned
     AND NOT (
       current_setting('promptbeats.authorized_moderation_ban', true) = 'on'
       AND (
         public.has_moderation_capability('can_block_users')
         OR public.has_moderation_capability('can_unblock_users')
       )
     ) THEN
    RAISE EXCEPTION 'not allowed to modify is_banned';
  END IF;
  RETURN NEW;
END;
$func$;

CREATE OR REPLACE FUNCTION public.admin_set_user_banned(
  _target_user_id uuid,
  _banned boolean,
  _reason_code text DEFAULT NULL,
  _reason_text text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
BEGIN
  IF NOT public.has_moderation_capability(CASE WHEN _banned THEN 'can_block_users' ELSE 'can_unblock_users' END) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _target_user_id) THEN
    RAISE EXCEPTION 'user not found';
  END IF;
  SELECT role::text INTO v_actor_role
  FROM public.user_roles
  WHERE user_id = v_actor
  ORDER BY CASE role::text WHEN 'admin' THEN 4 WHEN 'senior_moderator' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END DESC
  LIMIT 1;
  SELECT COALESCE((SELECT role::text FROM public.user_roles WHERE user_id = _target_user_id
    ORDER BY CASE role::text WHEN 'admin' THEN 4 WHEN 'senior_moderator' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END DESC LIMIT 1), 'user')
    INTO v_target_role;
  IF _target_user_id = v_actor OR v_target_role = 'admin' THEN
    RAISE EXCEPTION 'protected account';
  END IF;
  IF v_actor_role <> 'admin' AND v_target_role <> 'user' THEN
    RAISE EXCEPTION 'moderators may only act on normal users';
  END IF;
  IF _banned AND (_reason_code IS NULL OR _reason_code NOT IN (
    'platform_rules','copyright_or_third_party_rights','abuse_spam_or_harmful_activity',
    'ai_or_platform_misuse','security_concern','other'
  )) THEN
    RAISE EXCEPTION 'a valid block reason is required';
  END IF;
  IF _banned AND _reason_code = 'other' AND length(trim(COALESCE(_reason_text, ''))) = 0 THEN
    RAISE EXCEPTION 'custom block reason is required';
  END IF;

  PERFORM set_config('promptbeats.authorized_moderation_ban', 'on', true);
  INSERT INTO public.profile_private (user_id, is_banned, block_reason_code, block_reason_text, blocked_at, blocked_by)
    VALUES (
      _target_user_id,
      _banned,
      CASE WHEN _banned THEN _reason_code ELSE NULL END,
      CASE WHEN _banned AND _reason_code = 'other' THEN trim(_reason_text) ELSE NULL END,
      CASE WHEN _banned THEN now() ELSE NULL END,
      CASE WHEN _banned THEN v_actor ELSE NULL END
    )
    ON CONFLICT (user_id) DO UPDATE SET
      is_banned = EXCLUDED.is_banned,
      block_reason_code = EXCLUDED.block_reason_code,
      block_reason_text = EXCLUDED.block_reason_text,
      blocked_at = EXCLUDED.blocked_at,
      blocked_by = EXCLUDED.blocked_by;
  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details)
    VALUES (v_actor, _target_user_id, CASE WHEN _banned THEN 'BLOCK_USER' ELSE 'UNBLOCK_USER' END,
      jsonb_build_object('reason_code', _reason_code, 'has_custom_reason', _reason_code = 'other'));
END;
$$;

-- Preserve the legacy admin-only RPC while routing it through the same guard.
CREATE OR REPLACE FUNCTION public.set_user_banned(_user_id uuid, _banned boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot change your own account status';
  END IF;
  IF public.has_role(_user_id, 'admin') THEN
    RAISE EXCEPTION 'admin accounts are protected';
  END IF;
  PERFORM set_config('promptbeats.authorized_moderation_ban', 'on', true);
  INSERT INTO public.profile_private (user_id, is_banned, block_reason_code, block_reason_text, blocked_at, blocked_by)
  VALUES (_user_id, _banned, CASE WHEN _banned THEN 'other' ELSE NULL END,
    CASE WHEN _banned THEN 'Legacy moderation action' ELSE NULL END,
    CASE WHEN _banned THEN now() ELSE NULL END, CASE WHEN _banned THEN auth.uid() ELSE NULL END)
  ON CONFLICT (user_id) DO UPDATE SET
    is_banned = EXCLUDED.is_banned,
    block_reason_code = EXCLUDED.block_reason_code,
    block_reason_text = EXCLUDED.block_reason_text,
    blocked_at = EXCLUDED.blocked_at,
    blocked_by = EXCLUDED.blocked_by;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_banned(uuid, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_banned(uuid, boolean, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_user_banned(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_banned(uuid, boolean) TO authenticated, service_role;
