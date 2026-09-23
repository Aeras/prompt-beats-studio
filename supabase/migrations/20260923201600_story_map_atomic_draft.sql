-- Atomic persistence for an AI/user-reviewed Story Map draft.
CREATE OR REPLACE FUNCTION public.replace_story_map_draft(
  _story_map_id uuid,
  _progression_type text,
  _summary text,
  _narrator text,
  _point_of_view text,
  _starting_state text,
  _central_change text,
  _turning_point text,
  _resolution text,
  _beats jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_count integer;
  v_beat jsonb;
  v_position integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.story_maps WHERE id = _story_map_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Story Map not found.';
  END IF;
  IF _progression_type NOT IN ('narrative','emotional','relationship','conceptual','anthemic','minimal') THEN
    RAISE EXCEPTION 'Invalid progression type.';
  END IF;
  IF jsonb_typeof(_beats) <> 'array' THEN RAISE EXCEPTION 'Invalid beats.'; END IF;
  v_count := jsonb_array_length(_beats);
  IF v_count < 3 OR v_count > 10 THEN RAISE EXCEPTION 'Story Map requires 3 to 10 beats.'; END IF;

  UPDATE public.story_maps
  SET progression_type = _progression_type,
      summary = nullif(btrim(coalesce(_summary, '')), ''),
      narrator = nullif(btrim(coalesce(_narrator, '')), ''),
      point_of_view = nullif(btrim(coalesce(_point_of_view, '')), ''),
      starting_state = nullif(btrim(coalesce(_starting_state, '')), ''),
      central_change = nullif(btrim(coalesce(_central_change, '')), ''),
      turning_point = nullif(btrim(coalesce(_turning_point, '')), ''),
      resolution = nullif(btrim(coalesce(_resolution, '')), '')
  WHERE id = _story_map_id AND user_id = auth.uid();

  DELETE FROM public.story_map_beats WHERE story_map_id = _story_map_id;

  FOR v_beat IN SELECT value FROM jsonb_array_elements(_beats)
  LOOP
    IF char_length(btrim(coalesce(v_beat->>'title', ''))) = 0 THEN
      RAISE EXCEPTION 'Every Story Beat needs a title.';
    END IF;
    INSERT INTO public.story_map_beats(
      story_map_id, position, title, what_happens, emotion, purpose,
      narrator_state, key_image, reveal, change_after_beat, lyric_anchor,
      suggested_sections, is_key_beat
    ) VALUES (
      _story_map_id,
      v_position,
      left(btrim(v_beat->>'title'), 120),
      left(coalesce(v_beat->>'whatHappens', ''), 1200),
      left(coalesce(v_beat->>'emotion', ''), 500),
      left(coalesce(v_beat->>'purpose', ''), 700),
      left(coalesce(v_beat->>'narratorState', ''), 700),
      left(coalesce(v_beat->>'keyImage', ''), 500),
      left(coalesce(v_beat->>'reveal', ''), 700),
      left(coalesce(v_beat->>'changeAfterBeat', ''), 700),
      left(coalesce(v_beat->>'lyricAnchor', ''), 500),
      CASE WHEN jsonb_typeof(v_beat->'suggestedSections') = 'array' THEN v_beat->'suggestedSections' ELSE '[]'::jsonb END,
      coalesce((v_beat->>'isKeyBeat')::boolean, false)
    );
    v_position := v_position + 1;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_story_map_draft(uuid,text,text,text,text,text,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_story_map_draft(uuid,text,text,text,text,text,text,text,text,jsonb) TO authenticated, service_role;
