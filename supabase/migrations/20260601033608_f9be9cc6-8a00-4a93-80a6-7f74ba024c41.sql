-- Creator card "fun facts" + famous person
ALTER TABLE public.creator_types
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS at_the_table text,
  ADD COLUMN IF NOT EXISTS shadow_side text,
  ADD COLUMN IF NOT EXISTS you_might_be_if text,
  ADD COLUMN IF NOT EXISTS famous_person_name text,
  ADD COLUMN IF NOT EXISTS famous_person_photo_url text;

-- Profile-discount CTA thresholds (editable in admin > game settings)
ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS profile_discount_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS profile_discount_cta_title text NOT NULL DEFAULT 'Unlock your Creator Type',
  ADD COLUMN IF NOT EXISTS profile_discount_cta_body  text NOT NULL DEFAULT 'You''ve earned a discount on getting personally profiled. Find out which of the 13 Creators you really are.',
  ADD COLUMN IF NOT EXISTS profile_discount_threshold_1 integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS profile_discount_percent_1   integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS profile_discount_threshold_2 integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS profile_discount_percent_2   integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS profile_discount_threshold_3 integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS profile_discount_percent_3   integer NOT NULL DEFAULT 50;