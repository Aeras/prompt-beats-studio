-- Remove obsolete legacy creator donation columns after the new
-- user_donation_settings / user_donation_methods system was verified live.
BEGIN;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS donation_provider,
  DROP COLUMN IF EXISTS donation_url,
  DROP COLUMN IF EXISTS donation_custom_name;

COMMIT;
