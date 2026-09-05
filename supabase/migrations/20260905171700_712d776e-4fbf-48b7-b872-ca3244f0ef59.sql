CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  welcome_email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL,
  genre TEXT NOT NULL DEFAULT 'Other',
  prompt TEXT NOT NULL DEFAULT '',
  lyrics TEXT NOT NULL DEFAULT '',
  audio_url TEXT NOT NULL,
  audio_key TEXT,
  art_url TEXT,
  duration_seconds INTEGER,
  plays INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tracks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracks TO authenticated;
GRANT ALL ON public.tracks TO service_role;
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published tracks are viewable by everyone" ON public.tracks FOR SELECT USING (is_published = true);
CREATE POLICY "Users can view their own tracks" ON public.tracks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own tracks" ON public.tracks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own tracks" ON public.tracks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own tracks" ON public.tracks FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_tracks_updated_at BEFORE UPDATE ON public.tracks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX tracks_created_at_idx ON public.tracks (created_at DESC);
CREATE INDEX tracks_user_id_idx ON public.tracks (user_id);

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'inactive',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();