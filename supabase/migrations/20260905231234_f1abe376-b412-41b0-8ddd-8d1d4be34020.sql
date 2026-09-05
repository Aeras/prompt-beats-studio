ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS audio_type TEXT NOT NULL DEFAULT 'upload';

ALTER TABLE public.tracks
  DROP CONSTRAINT IF EXISTS tracks_audio_type_check;
ALTER TABLE public.tracks
  ADD CONSTRAINT tracks_audio_type_check CHECK (audio_type IN ('link','upload'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS donation_provider TEXT,
  ADD COLUMN IF NOT EXISTS donation_url TEXT,
  ADD COLUMN IF NOT EXISTS donation_custom_name TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_donation_provider_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_donation_provider_check CHECK (donation_provider IS NULL OR donation_provider IN ('paypal','revolut','custom'));