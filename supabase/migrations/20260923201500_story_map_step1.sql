-- Story Map: private narrative/emotional progression layer for one song concept.

INSERT INTO public.feature_access_policies(feature_key, display_name, description, access_mode)
VALUES (
  'story_map',
  'Story Map',
  'Narrative and emotional progression planning, analysis and song-setup handoff.',
  'everyone'
)
ON CONFLICT (feature_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.story_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  concept text NOT NULL CHECK (char_length(btrim(concept)) BETWEEN 3 AND 3000),
  theme text,
  emotional_direction text,
  narrator text,
  point_of_view text,
  desired_ending text,
  progression_type text CHECK (progression_type IS NULL OR progression_type IN ('narrative','emotional','relationship','conceptual','anthemic','minimal')),
  summary text,
  starting_state text,
  central_change text,
  turning_point text,
  resolution text,
  project_id uuid REFERENCES public.prompt_projects(id) ON DELETE SET NULL,
  source_project_version_id uuid REFERENCES public.saved_prompts(id) ON DELETE SET NULL,
  source_lyrics_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS story_maps_one_project_idx
  ON public.story_maps(project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS story_maps_user_updated_idx
  ON public.story_maps(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.story_map_beats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id uuid NOT NULL REFERENCES public.story_maps(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0 AND position <= 100),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  what_happens text NOT NULL DEFAULT '',
  emotion text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  narrator_state text NOT NULL DEFAULT '',
  key_image text NOT NULL DEFAULT '',
  reveal text NOT NULL DEFAULT '',
  change_after_beat text NOT NULL DEFAULT '',
  lyric_anchor text NOT NULL DEFAULT '',
  suggested_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_key_beat boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(story_map_id, position)
);

CREATE INDEX IF NOT EXISTS story_map_beats_map_position_idx
  ON public.story_map_beats(story_map_id, position);

CREATE OR REPLACE FUNCTION public.story_map_validate_project_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.prompt_projects p
    WHERE p.id = NEW.project_id AND p.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Project not found.';
  END IF;
  IF NEW.source_project_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.saved_prompts s
    WHERE s.id = NEW.source_project_version_id AND s.user_id = NEW.user_id
      AND (NEW.project_id IS NULL OR s.project_id = NEW.project_id)
  ) THEN
    RAISE EXCEPTION 'Source version not found.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS story_map_validate_project_owner_trigger ON public.story_maps;
CREATE TRIGGER story_map_validate_project_owner_trigger
BEFORE INSERT OR UPDATE OF user_id, project_id, source_project_version_id
ON public.story_maps
FOR EACH ROW EXECUTE FUNCTION public.story_map_validate_project_owner();

CREATE OR REPLACE FUNCTION public.story_map_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS story_maps_touch_updated_at ON public.story_maps;
CREATE TRIGGER story_maps_touch_updated_at
BEFORE UPDATE ON public.story_maps
FOR EACH ROW EXECUTE FUNCTION public.story_map_touch_updated_at();

DROP TRIGGER IF EXISTS story_map_beats_touch_updated_at ON public.story_map_beats;
CREATE TRIGGER story_map_beats_touch_updated_at
BEFORE UPDATE ON public.story_map_beats
FOR EACH ROW EXECUTE FUNCTION public.story_map_touch_updated_at();

ALTER TABLE public.story_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_map_beats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS story_maps_owner_select ON public.story_maps;
CREATE POLICY story_maps_owner_select ON public.story_maps
FOR SELECT TO authenticated
USING (user_id = auth.uid());
DROP POLICY IF EXISTS story_maps_owner_insert ON public.story_maps;
CREATE POLICY story_maps_owner_insert ON public.story_maps
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS story_maps_owner_update ON public.story_maps;
CREATE POLICY story_maps_owner_update ON public.story_maps
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS story_maps_owner_delete ON public.story_maps;
CREATE POLICY story_maps_owner_delete ON public.story_maps
FOR DELETE TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS story_map_beats_owner_select ON public.story_map_beats;
CREATE POLICY story_map_beats_owner_select ON public.story_map_beats
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.story_maps m WHERE m.id = story_map_id AND m.user_id = auth.uid()));
DROP POLICY IF EXISTS story_map_beats_owner_insert ON public.story_map_beats;
CREATE POLICY story_map_beats_owner_insert ON public.story_map_beats
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.story_maps m WHERE m.id = story_map_id AND m.user_id = auth.uid()));
DROP POLICY IF EXISTS story_map_beats_owner_update ON public.story_map_beats;
CREATE POLICY story_map_beats_owner_update ON public.story_map_beats
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.story_maps m WHERE m.id = story_map_id AND m.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.story_maps m WHERE m.id = story_map_id AND m.user_id = auth.uid()));
DROP POLICY IF EXISTS story_map_beats_owner_delete ON public.story_map_beats;
CREATE POLICY story_map_beats_owner_delete ON public.story_map_beats
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.story_maps m WHERE m.id = story_map_id AND m.user_id = auth.uid()));

REVOKE ALL ON public.story_maps FROM anon;
REVOKE ALL ON public.story_map_beats FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_maps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_map_beats TO authenticated;

-- Story Map joins the existing auxiliary-AI admission bucket.
ALTER TABLE public.ai_auxiliary_admission
  DROP CONSTRAINT IF EXISTS ai_auxiliary_admission_operation_check;
ALTER TABLE public.ai_auxiliary_admission
  ADD CONSTRAINT ai_auxiliary_admission_operation_check
  CHECK (operation IN ('song_setup_assistant','ai_music_lab','song_analyzer','inspiration_wall','story_map'));
