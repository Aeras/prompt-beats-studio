-- Creator donations foundation: global access, per-user override/preferences,
-- multiple donation methods, and legacy profile-field migration.
-- Legacy donation columns remain in public.profiles for rollback compatibility.

BEGIN;

INSERT INTO public.app_settings (key, value, updated_at, updated_by)
VALUES ('creator_donations_enabled', '{"enabled":false}'::jsonb, now(), NULL)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_donation_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_override text NOT NULL DEFAULT 'inherit'
    CHECK (admin_override IN ('inherit', 'enabled', 'disabled')),
  user_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  admin_updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.user_donation_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL
    CHECK (provider IN ('paypal', 'revolut', 'buy_me_a_coffee', 'ko_fi', 'wise', 'custom')),
  custom_label text NULL,
  value text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 2),
  privacy_acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_donation_methods_custom_label_check CHECK (
    (provider = 'custom' AND custom_label IS NOT NULL AND char_length(btrim(custom_label)) BETWEEN 1 AND 60)
    OR (provider <> 'custom' AND custom_label IS NULL)
  ),
  CONSTRAINT user_donation_methods_value_length_check CHECK (
    char_length(btrim(value)) BETWEEN 1 AND 500
  ),
  CONSTRAINT user_donation_methods_user_sort_unique UNIQUE (user_id, sort_order)
);

CREATE INDEX IF NOT EXISTS user_donation_methods_user_idx
  ON public.user_donation_methods (user_id, sort_order);

ALTER TABLE public.user_donation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_donation_methods ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_donation_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.user_donation_methods FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_donation_settings TO service_role;
GRANT ALL ON public.user_donation_methods TO service_role;

-- Preserve any legacy donation intent without exposing it while the new global
-- feature switch is disabled.
INSERT INTO public.user_donation_settings (user_id, user_enabled)
SELECT p.id, true
FROM public.profiles p
WHERE p.donation_provider IS NOT NULL
   OR p.donation_url IS NOT NULL
   OR p.donation_custom_name IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_donation_methods (
  user_id,
  provider,
  custom_label,
  value,
  is_enabled,
  sort_order,
  privacy_acknowledged
)
SELECT
  p.id,
  CASE
    WHEN p.donation_provider IN ('paypal', 'revolut') THEN p.donation_provider
    ELSE 'custom'
  END,
  CASE
    WHEN p.donation_provider IN ('paypal', 'revolut') THEN NULL
    ELSE COALESCE(NULLIF(btrim(p.donation_custom_name), ''), 'Legacy donation method')
  END,
  btrim(p.donation_url),
  true,
  0,
  false
FROM public.profiles p
WHERE NULLIF(btrim(p.donation_url), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_donation_methods m WHERE m.user_id = p.id
  )
ON CONFLICT (user_id, sort_order) DO NOTHING;

COMMIT;
