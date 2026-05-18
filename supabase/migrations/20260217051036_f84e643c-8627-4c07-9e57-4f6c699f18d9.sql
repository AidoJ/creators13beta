-- Add training start date for practitioner cohort tracking
ALTER TABLE public.profiles ADD COLUMN training_started_at DATE;

-- Seed the known practitioners
UPDATE public.profiles SET training_started_at = '2025-09-01'
WHERE email IN (
  SELECT unnest(ARRAY[
    (SELECT email FROM profiles WHERE first_name = 'Asaya' LIMIT 1),
    (SELECT email FROM profiles WHERE first_name = 'Amanda' LIMIT 1)
  ])
);

-- For the rest (Helen, Anna, Heidi, Denise, Nacho) set May 2025
UPDATE public.profiles SET training_started_at = '2025-05-01'
WHERE first_name IN ('Helen', 'Anna', 'Heidi', 'Denise', 'Nacho')
  AND training_started_at IS NULL;