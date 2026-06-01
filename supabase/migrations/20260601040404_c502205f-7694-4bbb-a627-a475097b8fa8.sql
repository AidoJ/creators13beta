
CREATE TABLE public.profile_discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  percent integer NOT NULL,
  threshold integer NOT NULL,
  scope text NOT NULL DEFAULT 'profiling_only',
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, threshold)
);

GRANT SELECT, INSERT, UPDATE ON public.profile_discount_codes TO authenticated;
GRANT ALL ON public.profile_discount_codes TO service_role;

ALTER TABLE public.profile_discount_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own discount codes"
ON public.profile_discount_codes FOR SELECT
TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users create own discount codes"
ON public.profile_discount_codes FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage discount codes"
ON public.profile_discount_codes FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'trainer'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'trainer'::app_role));
