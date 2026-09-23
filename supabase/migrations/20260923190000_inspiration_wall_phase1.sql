BEGIN;

INSERT INTO public.feature_access_policies(feature_key, display_name, description, access_mode)
VALUES (
  'inspiration_wall',
  'Inspiration Wall',
  'Private pre-song workspace for collecting creative references and building a structured creative direction.',
  'everyone'
)
ON CONFLICT (feature_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.inspiration_walls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  selected_theme text NOT NULL DEFAULT 'neon_studio'
    CHECK (selected_theme IN ('whiteboard', 'corkboard', 'neon_studio', 'clean_studio')),
  connected_project_id uuid REFERENCES public.prompt_projects(id) ON DELETE SET NULL,
  creative_direction jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inspiration_walls_creative_direction_object_check
    CHECK (creative_direction IS NULL OR jsonb_typeof(creative_direction) = 'object')
);

CREATE INDEX IF NOT EXISTS inspiration_walls_owner_updated_idx
  ON public.inspiration_walls(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS inspiration_walls_connected_project_idx
  ON public.inspiration_walls(owner_id, connected_project_id)
  WHERE connected_project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.inspiration_wall_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wall_id uuid NOT NULL REFERENCES public.inspiration_walls(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (
    type IN ('image', 'note', 'text_fragment', 'word', 'color', 'scene', 'constraint', 'question')
  ),
  title text CHECK (title IS NULL OR char_length(title) <= 200),
  body text CHECK (body IS NULL OR char_length(body) <= 10000),
  color_value text CHECK (color_value IS NULL OR char_length(color_value) <= 64),
  image_object_key text CHECK (image_object_key IS NULL OR char_length(image_object_key) <= 1024),
  is_pinned boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  artistic_layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  structured_layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inspiration_wall_cards_artistic_layout_object_check
    CHECK (jsonb_typeof(artistic_layout) = 'object'),
  CONSTRAINT inspiration_wall_cards_structured_layout_object_check
    CHECK (jsonb_typeof(structured_layout) = 'object')
);

CREATE INDEX IF NOT EXISTS inspiration_wall_cards_wall_order_idx
  ON public.inspiration_wall_cards(wall_id, sort_order, created_at, id);
CREATE INDEX IF NOT EXISTS inspiration_wall_cards_wall_pinned_idx
  ON public.inspiration_wall_cards(wall_id, is_pinned)
  WHERE is_pinned = true;

CREATE TABLE IF NOT EXISTS public.inspiration_wall_track_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wall_id uuid NOT NULL REFERENCES public.inspiration_walls(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wall_id, track_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS inspiration_wall_track_links_primary_idx
  ON public.inspiration_wall_track_links(wall_id)
  WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS inspiration_wall_track_links_owner_idx
  ON public.inspiration_wall_track_links(owner_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_inspiration_wall_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inspiration_walls_set_updated_at ON public.inspiration_walls;
CREATE TRIGGER inspiration_walls_set_updated_at
BEFORE UPDATE ON public.inspiration_walls
FOR EACH ROW EXECUTE FUNCTION public.set_inspiration_wall_updated_at();

DROP TRIGGER IF EXISTS inspiration_wall_cards_set_updated_at ON public.inspiration_wall_cards;
CREATE TRIGGER inspiration_wall_cards_set_updated_at
BEFORE UPDATE ON public.inspiration_wall_cards
FOR EACH ROW EXECUTE FUNCTION public.set_inspiration_wall_updated_at();

CREATE OR REPLACE FUNCTION public.validate_inspiration_wall_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.connected_project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.prompt_projects p
    WHERE p.id = NEW.connected_project_id
      AND p.user_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'Connected project does not belong to this user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inspiration_walls_validate_project ON public.inspiration_walls;
CREATE TRIGGER inspiration_walls_validate_project
BEFORE INSERT OR UPDATE OF owner_id, connected_project_id ON public.inspiration_walls
FOR EACH ROW EXECUTE FUNCTION public.validate_inspiration_wall_project();

CREATE OR REPLACE FUNCTION public.validate_inspiration_wall_track_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.inspiration_walls w
    WHERE w.id = NEW.wall_id
      AND w.owner_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'Inspiration Wall does not belong to this user';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tracks t
    WHERE t.id = NEW.track_id
      AND t.user_id = NEW.owner_id
      AND t.source_type = 'upload'
      AND t.moderation_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Track is not an eligible owned upload';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inspiration_wall_track_links_validate_owner ON public.inspiration_wall_track_links;
CREATE TRIGGER inspiration_wall_track_links_validate_owner
BEFORE INSERT OR UPDATE OF wall_id, owner_id, track_id ON public.inspiration_wall_track_links
FOR EACH ROW EXECUTE FUNCTION public.validate_inspiration_wall_track_link();

ALTER TABLE public.inspiration_walls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspiration_wall_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspiration_wall_track_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage inspiration walls" ON public.inspiration_walls;
CREATE POLICY "Owners manage inspiration walls"
ON public.inspiration_walls
FOR ALL TO authenticated
USING (auth.uid() = owner_id AND NOT public.current_user_is_banned())
WITH CHECK (auth.uid() = owner_id AND NOT public.current_user_is_banned());

DROP POLICY IF EXISTS "Owners manage inspiration wall cards" ON public.inspiration_wall_cards;
CREATE POLICY "Owners manage inspiration wall cards"
ON public.inspiration_wall_cards
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.inspiration_walls w
    WHERE w.id = wall_id AND w.owner_id = auth.uid()
  )
  AND NOT public.current_user_is_banned()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.inspiration_walls w
    WHERE w.id = wall_id AND w.owner_id = auth.uid()
  )
  AND NOT public.current_user_is_banned()
);

DROP POLICY IF EXISTS "Owners manage inspiration wall track links" ON public.inspiration_wall_track_links;
CREATE POLICY "Owners manage inspiration wall track links"
ON public.inspiration_wall_track_links
FOR ALL TO authenticated
USING (auth.uid() = owner_id AND NOT public.current_user_is_banned())
WITH CHECK (auth.uid() = owner_id AND NOT public.current_user_is_banned());

REVOKE ALL ON public.inspiration_walls FROM anon;
REVOKE ALL ON public.inspiration_wall_cards FROM anon;
REVOKE ALL ON public.inspiration_wall_track_links FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspiration_walls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspiration_wall_cards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspiration_wall_track_links TO authenticated;

REVOKE ALL ON FUNCTION public.validate_inspiration_wall_project() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_inspiration_wall_track_link() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_inspiration_wall_project() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_inspiration_wall_track_link() TO service_role;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inspiration-wall-images',
  'inspiration-wall-images',
  false,
  4 * 1024 * 1024,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Owners read inspiration wall images" ON storage.objects;
CREATE POLICY "Owners read inspiration wall images"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'inspiration-wall-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Owners upload inspiration wall images" ON storage.objects;
CREATE POLICY "Owners upload inspiration wall images"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'inspiration-wall-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Owners update inspiration wall images" ON storage.objects;
CREATE POLICY "Owners update inspiration wall images"
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'inspiration-wall-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'inspiration-wall-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Owners delete inspiration wall images" ON storage.objects;
CREATE POLICY "Owners delete inspiration wall images"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'inspiration-wall-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

COMMIT;
