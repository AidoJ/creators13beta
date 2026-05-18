
-- 1. Add practitioner certification status to profiles
CREATE TYPE public.practitioner_status AS ENUM ('in_progress', 'paused', 'cancelled', 'certified');

ALTER TABLE public.profiles ADD COLUMN practitioner_status public.practitioner_status DEFAULT NULL;

-- 2. Add case study consent tracking to profiles
ALTER TABLE public.profiles ADD COLUMN case_study_consent_at timestamp with time zone DEFAULT NULL;

-- 3. Create client_invitations table for trainee practitioner invites
CREATE TABLE public.client_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  practitioner_id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  invite_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(practitioner_id, email)
);

ALTER TABLE public.client_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Practitioners can view own invitations"
ON public.client_invitations FOR SELECT
USING (auth.uid() = practitioner_id);

CREATE POLICY "Practitioners can create invitations"
ON public.client_invitations FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'practitioner'::app_role) OR
  has_role(auth.uid(), 'trainee'::app_role) OR
  has_role(auth.uid(), 'trainer'::app_role)
);

CREATE POLICY "Practitioners can update own invitations"
ON public.client_invitations FOR UPDATE
USING (auth.uid() = practitioner_id);

CREATE POLICY "Trainers can manage all invitations"
ON public.client_invitations FOR ALL
USING (has_role(auth.uid(), 'trainer'::app_role));
