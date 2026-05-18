-- Add unique constraint for upsert on profiling_photos
ALTER TABLE public.profiling_photos
  ADD CONSTRAINT profiling_photos_user_id_photo_type_key UNIQUE (user_id, photo_type);

-- Drop redundant photos JSONB column from case_studies
ALTER TABLE public.case_studies DROP COLUMN IF EXISTS photos;
