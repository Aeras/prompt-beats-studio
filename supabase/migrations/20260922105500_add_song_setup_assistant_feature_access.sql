-- Add Song Setup Assistant to Feature Access as a first-class independently controlled feature.
INSERT INTO public.feature_access_policies(feature_key,display_name,description,access_mode)
VALUES (
  'song_setup_assistant',
  'Song Setup Assistant',
  'AI-assisted conversion of a rough song idea into a complete Advanced Generator setup.',
  'admins_only'
)
ON CONFLICT(feature_key) DO NOTHING;
