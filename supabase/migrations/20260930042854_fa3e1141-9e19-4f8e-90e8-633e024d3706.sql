ALTER TABLE public.prospectus_sections
  ADD COLUMN IF NOT EXISTS layout_key text,
  ADD COLUMN IF NOT EXISTS image_urls jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS prospectus_sections_layout_key_unique
  ON public.prospectus_sections(layout_key)
  WHERE layout_key IS NOT NULL;

UPDATE public.prospectus_sections SET layout_key = CASE sort_order
  WHEN 1 THEN 'why'
  WHEN 2 THEN 'journey'
  WHEN 3 THEN 'training'
  WHEN 4 THEN 'qa'
  WHEN 5 THEN 'expertise'
  WHEN 6 THEN 'contact'
  WHEN 7 THEN 'eligibility'
  WHEN 8 THEN 'application'
END
WHERE layout_key IS NULL;