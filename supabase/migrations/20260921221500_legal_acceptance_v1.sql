CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_key text NOT NULL CHECK (document_key IN ('terms_of_use', 'privacy_policy')),
  version text NOT NULL,
  acceptance_type text NOT NULL CHECK (acceptance_type IN ('accepted', 'acknowledged')),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'signup',
  locale text,
  UNIQUE (user_id, document_key, version)
);

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.legal_acceptances FROM anon;
GRANT SELECT ON public.legal_acceptances TO authenticated;

DROP POLICY IF EXISTS "Users can view their own legal acceptances" ON public.legal_acceptances;
CREATE POLICY "Users can view their own legal acceptances"
  ON public.legal_acceptances
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_signup_legal_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  terms_version text;
  privacy_version text;
  signup_locale text;
BEGIN
  IF coalesce(NEW.raw_user_meta_data->>'terms_accepted', 'false') = 'true' THEN
    terms_version := coalesce(nullif(NEW.raw_user_meta_data->>'terms_version', ''), 'unknown');
    privacy_version := coalesce(nullif(NEW.raw_user_meta_data->>'privacy_policy_version', ''), terms_version);
    signup_locale := nullif(NEW.raw_user_meta_data->>'legal_locale', '');

    INSERT INTO public.legal_acceptances (
      user_id, document_key, version, acceptance_type, source, locale
    )
    VALUES (
      NEW.id, 'terms_of_use', terms_version, 'accepted', 'signup', signup_locale
    )
    ON CONFLICT (user_id, document_key, version) DO NOTHING;

    INSERT INTO public.legal_acceptances (
      user_id, document_key, version, acceptance_type, source, locale
    )
    VALUES (
      NEW.id, 'privacy_policy', privacy_version, 'acknowledged', 'signup', signup_locale
    )
    ON CONFLICT (user_id, document_key, version) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_signup_legal_acceptance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_signup_legal_acceptance() FROM anon, authenticated;

DROP TRIGGER IF EXISTS record_signup_legal_acceptance_trigger ON auth.users;
CREATE TRIGGER record_signup_legal_acceptance_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.record_signup_legal_acceptance();
