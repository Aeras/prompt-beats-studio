-- Allow anonymous/public reads of tracks while preserving row visibility through RLS.
-- The existing SELECT policy restricts anon/public access to published, active tracks only.
GRANT SELECT ON TABLE public.tracks TO anon;
