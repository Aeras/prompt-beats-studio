-- 1) Public profiles: serve public data only through the curated view
ALTER VIEW public.public_profiles SET (security_invoker = false);
ALTER VIEW public.public_profiles OWNER TO postgres;

DROP POLICY IF EXISTS "Public profile fields are viewable by everyone" ON public.profiles;
REVOKE ALL ON public.profiles FROM anon;

GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT ALL ON public.public_profiles TO service_role;

-- 2) Public like counts: replace anon-executable SECURITY DEFINER RPC with a counts view
CREATE OR REPLACE VIEW public.track_like_counts AS
SELECT l.track_id, count(*)::bigint AS like_count
FROM public.likes l
GROUP BY l.track_id;

ALTER VIEW public.track_like_counts SET (security_invoker = false);
ALTER VIEW public.track_like_counts OWNER TO postgres;

GRANT SELECT ON public.track_like_counts TO anon, authenticated;
GRANT ALL ON public.track_like_counts TO service_role;

REVOKE EXECUTE ON FUNCTION public.like_count(uuid) FROM PUBLIC, anon;