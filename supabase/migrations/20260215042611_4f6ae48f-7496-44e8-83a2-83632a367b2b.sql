
-- Add practitioner_code to profiles (auto-generated unique code for practitioners)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS practitioner_code text UNIQUE;

-- Add referral_code to subscriptions (tracks which practitioner code was used)
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS referral_code text;

-- Function to generate a unique practitioner code like 'PRAC-A7X3'
CREATE OR REPLACE FUNCTION public.generate_practitioner_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  LOOP
    new_code := 'PRAC-' || upper(substr(md5(random()::text), 1, 4));
    SELECT EXISTS (SELECT 1 FROM profiles WHERE practitioner_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN new_code;
END;
$$;

-- Trigger function: when a practitioner or trainee role is inserted, generate a code
CREATE OR REPLACE FUNCTION public.assign_practitioner_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('practitioner', 'trainee') THEN
    UPDATE profiles
    SET practitioner_code = generate_practitioner_code()
    WHERE user_id = NEW.user_id
      AND practitioner_code IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Create the trigger on user_roles
DROP TRIGGER IF EXISTS trg_assign_practitioner_code ON public.user_roles;
CREATE TRIGGER trg_assign_practitioner_code
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_practitioner_code();

-- Allow practitioners to view profiles of their assigned clients
CREATE POLICY "Practitioners can view assigned client profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM client_practitioner
    WHERE client_practitioner.client_id = profiles.user_id
      AND client_practitioner.practitioner_id = auth.uid()
      AND client_practitioner.active = true
  )
);

-- Allow practitioners to view bookings of their assigned clients
CREATE POLICY "Practitioners can view assigned client bookings"
ON public.bookings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM client_practitioner
    WHERE client_practitioner.client_id = bookings.client_id
      AND client_practitioner.practitioner_id = auth.uid()
      AND client_practitioner.active = true
  )
);

-- Allow practitioners to update bookings for their clients (e.g. add notes)
CREATE POLICY "Practitioners can update assigned client bookings"
ON public.bookings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM client_practitioner
    WHERE client_practitioner.client_id = bookings.client_id
      AND client_practitioner.practitioner_id = auth.uid()
      AND client_practitioner.active = true
  )
);

-- Allow practitioners to insert into client_practitioner (for code-based linking)
CREATE POLICY "Service role can manage assignments"
ON public.client_practitioner
FOR INSERT
WITH CHECK (true);

-- Allow trainers to view all creator_type_profiles
CREATE POLICY "Trainers can view all creator types"
ON public.creator_type_profiles
FOR SELECT
USING (has_role(auth.uid(), 'trainer'::app_role));
