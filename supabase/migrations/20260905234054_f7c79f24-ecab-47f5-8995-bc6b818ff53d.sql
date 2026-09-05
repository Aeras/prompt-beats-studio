DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tracks'
      AND column_name = 'genre'
  ) THEN
    ALTER TABLE public.tracks ADD COLUMN genre text NOT NULL DEFAULT 'Other / Experimental';
  END IF;
END $$;

ALTER TABLE public.tracks ALTER COLUMN genre SET DEFAULT 'Other / Experimental';

UPDATE public.tracks
SET genre = CASE genre
  WHEN 'Reggaeton' THEN 'Latin'
  WHEN 'Cumbia' THEN 'Latin'
  WHEN 'Italo Disco' THEN 'Electronic / EDM'
  WHEN 'Synthwave' THEN 'Electronic / EDM'
  WHEN 'Acoustic' THEN 'Acoustic / Folk'
  WHEN 'Hip-Hop' THEN 'Hip-Hop / Rap'
  WHEN 'Other' THEN 'Other / Experimental'
  ELSE genre
END
WHERE genre IN ('Reggaeton','Cumbia','Italo Disco','Synthwave','Acoustic','Hip-Hop','Other')
   OR genre IS NULL;

UPDATE public.tracks
SET genre = 'Other / Experimental'
WHERE genre NOT IN (
  'Pop','Hip-Hop / Rap','Rock / Metal','Electronic / EDM','Lo-Fi / Chill',
  'Cinematic / Soundtrack','Latin','R&B / Soul','Jazz / Blues','Acoustic / Folk',
  'World / Traditional','Other / Experimental'
);
