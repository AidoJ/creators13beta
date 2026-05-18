
-- Add type_3 and type_4 columns to creator_type_profiles for 4-slot assignments
ALTER TABLE public.creator_type_profiles
  ADD COLUMN type_3 text DEFAULT NULL,
  ADD COLUMN type_4 text DEFAULT NULL;
