
-- Add structured form data and body drawing path to case studies
ALTER TABLE public.case_studies 
  ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS body_drawing_path text;
