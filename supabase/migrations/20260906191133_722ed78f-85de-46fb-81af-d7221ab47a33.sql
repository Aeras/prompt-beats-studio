-- Audit #4: keep tracks.audio_key internal-only.
REVOKE SELECT ON public.tracks FROM anon;
REVOKE SELECT ON public.tracks FROM authenticated;

GRANT SELECT (
  id, user_id, title, genre, prompt, lyrics, audio_url, audio_type,
  art_url, cover_url, duration_seconds, plays, is_published,
  created_at, updated_at
) ON public.tracks TO anon;

GRANT SELECT (
  id, user_id, title, genre, prompt, lyrics, audio_url, audio_type,
  art_url, cover_url, duration_seconds, plays, is_published,
  created_at, updated_at
) ON public.tracks TO authenticated;

-- Writes stay as they were (owner-scoped via RLS); audio_key remains writable
-- so uploads can record it, but never selectable by anon/authenticated.
GRANT INSERT, UPDATE, DELETE ON public.tracks TO authenticated;
GRANT ALL ON public.tracks TO service_role;