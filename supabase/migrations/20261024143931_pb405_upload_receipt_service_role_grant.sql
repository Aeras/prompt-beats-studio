-- Receipt CHECK constraints call this validator as the server's service role.
GRANT EXECUTE ON FUNCTION public.is_safe_track_storage_path(text, text) TO service_role;
