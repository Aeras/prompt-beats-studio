-- Add Lyrics Review as a first-class independently controlled feature.
INSERT INTO public.feature_access_policies(feature_key,display_name,description,access_mode)
VALUES (
  'lyrics_review',
  'Lyrics Review',
  'Line-by-line and section-by-section lyric metrics, rhyme clues, repetitions, and singability refinement.',
  'admins_only'
)
ON CONFLICT(feature_key) DO NOTHING;
