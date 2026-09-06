CREATE TABLE public.profile_private (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_banned boolean NOT NULL DEFAULT false,
  welcome_email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.profile_private TO authenticated;
GRANT UPDATE (welcome_email_sent_at) ON public.profile_private TO authenticated;
GRANT ALL ON public.profile_private TO service_role;

ALTER TABLE public.profile_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own private profile data"
  ON public.profile_private FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mark their own welcome email sent"
  ON public.profile_private FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all private profile data"
  ON public.profile_private FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.profile_private (user_id, is_banned, welcome_email_sent_at)
SELECT id, is_banned, welcome_email_sent_at FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

CREATE TRIGGER update_profile_private_updated_at BEFORE UPDATE ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_banned(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_banned FROM public.profile_private WHERE user_id = _user_id), false);
$$;

CREATE OR REPLACE FUNCTION public.set_user_banned(_user_id uuid, _banned boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  INSERT INTO public.profile_private (user_id, is_banned)
  VALUES (_user_id, _banned)
  ON CONFLICT (user_id) DO UPDATE SET is_banned = EXCLUDED.is_banned;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_user_banned(uuid, boolean) FROM anon, public;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_handle TEXT;
  final_handle TEXT;
  suffix INTEGER := 0;
BEGIN
  base_handle := lower(regexp_replace(coalesce(NEW.raw_user_meta_data->>'handle', split_part(NEW.email, '@', 1), 'user'), '[^a-z0-9._]', '', 'g'));
  IF base_handle = '' THEN base_handle := 'user'; END IF;
  final_handle := base_handle;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE handle = final_handle) LOOP
    suffix := suffix + 1;
    final_handle := base_handle || suffix::text;
  END LOOP;
  INSERT INTO public.profiles (id, handle, display_name, avatar_url)
  VALUES (NEW.id, final_handle, coalesce(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', final_handle), NEW.raw_user_meta_data->>'avatar_url');
  INSERT INTO public.profile_private (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles DROP COLUMN is_banned, DROP COLUMN welcome_email_sent_at;

REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT ON public.profiles TO anon;