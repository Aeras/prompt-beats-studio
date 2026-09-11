-- Keep account status fail-closed when a stale session references a deleted
-- auth user or when required canonical profile state is missing.
CREATE OR REPLACE FUNCTION public.get_my_account_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_banned boolean;
  v_reason_code text;
  v_reason_text text;
  v_blocked_at timestamptz;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RETURN jsonb_build_object(
      'status', 'invalid',
      'is_banned', false,
      'reason', NULL,
      'blocked_at', NULL
    );
  END IF;

  SELECT is_banned, block_reason_code, block_reason_text, blocked_at
    INTO v_is_banned, v_reason_code, v_reason_text, v_blocked_at
  FROM public.profile_private
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'invalid',
      'is_banned', false,
      'reason', NULL,
      'blocked_at', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_is_banned THEN 'blocked' ELSE 'active' END,
    'is_banned', COALESCE(v_is_banned, false),
    'reason', CASE v_reason_code
      WHEN 'platform_rules' THEN 'Violation of platform rules'
      WHEN 'copyright_or_third_party_rights' THEN 'Copyright or third-party rights concern'
      WHEN 'abuse_spam_or_harmful_activity' THEN 'Abuse, spam or harmful activity'
      WHEN 'ai_or_platform_misuse' THEN 'Misuse of AI or platform features'
      WHEN 'security_concern' THEN 'Security concern'
      WHEN 'other' THEN NULLIF(v_reason_text, '')
      ELSE NULL
    END,
    'blocked_at', v_blocked_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_account_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_account_status() TO authenticated, service_role;
