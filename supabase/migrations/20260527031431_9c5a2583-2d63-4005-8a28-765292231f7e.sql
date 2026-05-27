
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS signup_path text;

UPDATE public.subscriptions
SET signup_path = CASE
  WHEN referral_code IS NOT NULL THEN 'case_study'
  WHEN tier = 'wren' AND NOT EXISTS (
    SELECT 1 FROM public.client_practitioner cp
    WHERE cp.client_id = subscriptions.user_id AND cp.active = true
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = subscriptions.user_id AND p.case_study_consent_at IS NOT NULL
  ) THEN 'player'
  WHEN tier = 'wren' THEN 'case_study'
  ELSE 'paying'
END
WHERE signup_path IS NULL;

ALTER TABLE public.subscriptions ALTER COLUMN signup_path SET DEFAULT 'paying';
