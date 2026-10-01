BEGIN;

-- PB-004: this legacy mutation was superseded by admin_set_user_banned(...),
-- which is the only current application caller and enforces the current
-- moderation capability/reason/audit contract. Keep the historical function
-- definition for migration compatibility, but remove direct authenticated RPC
-- execution so it is no longer part of the user-callable privileged surface.
REVOKE ALL ON FUNCTION public.set_user_banned(uuid, boolean)
  FROM PUBLIC, anon, authenticated;

-- Retain service-role execution only for backwards-compatible internal/admin
-- recovery paths. The application does not invoke this RPC directly.
GRANT EXECUTE ON FUNCTION public.set_user_banned(uuid, boolean) TO service_role;

COMMIT;
