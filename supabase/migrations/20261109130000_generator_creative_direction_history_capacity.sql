-- Expand private creative-direction history without changing its shape or access model.
BEGIN;
ALTER TABLE public.generator_creative_direction_history
  DROP CONSTRAINT generator_creative_direction_history_direction_check;
ALTER TABLE public.generator_creative_direction_history
  ADD CONSTRAINT generator_creative_direction_history_direction_check CHECK (
    jsonb_typeof(direction) = 'object'
    AND (direction - ARRAY['coreIdea','narrator','emotionalApproach','hookIdentity','sonicIdentity']::text[]) = '{}'::jsonb
    AND direction ?& ARRAY['coreIdea','narrator','emotionalApproach','hookIdentity','sonicIdentity']
    AND jsonb_typeof(direction->'coreIdea') = 'string'
    AND length(btrim(direction->>'coreIdea')) BETWEEN 1 AND 200
    AND jsonb_typeof(direction->'narrator') = 'string'
    AND length(direction->>'narrator') <= 200
    AND jsonb_typeof(direction->'emotionalApproach') = 'string'
    AND length(direction->>'emotionalApproach') <= 200
    AND jsonb_typeof(direction->'hookIdentity') = 'string'
    AND length(direction->>'hookIdentity') <= 200
    AND jsonb_typeof(direction->'sonicIdentity') = 'string'
    AND length(direction->>'sonicIdentity') <= 200
    AND length(direction->>'coreIdea') + length(direction->>'narrator')
      + length(direction->>'emotionalApproach') + length(direction->>'hookIdentity')
      + length(direction->>'sonicIdentity') <= 1000
    AND position(chr(10) in concat_ws('', direction->>'coreIdea', direction->>'narrator',
      direction->>'emotionalApproach', direction->>'hookIdentity', direction->>'sonicIdentity')) = 0
    AND position(chr(13) in concat_ws('', direction->>'coreIdea', direction->>'narrator',
      direction->>'emotionalApproach', direction->>'hookIdentity', direction->>'sonicIdentity')) = 0
  );
COMMIT;
