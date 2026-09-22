-- External Supabase currently contains this event-trigger helper outside the
-- repository migration history. Keep the event trigger functional but remove
-- direct API execution from browser-facing roles when the helper exists.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
END;
$$;
