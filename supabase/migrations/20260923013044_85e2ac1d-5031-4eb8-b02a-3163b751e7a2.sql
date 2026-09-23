ALTER TABLE public.profiles
  RENAME COLUMN guardian_consent TO guardian_consent_declared;

ALTER TABLE public.profiles
  RENAME COLUMN guardian_consent_at TO guardian_consent_declared_at;