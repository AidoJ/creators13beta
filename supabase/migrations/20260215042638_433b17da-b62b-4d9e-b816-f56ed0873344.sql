
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role can manage assignments" ON public.client_practitioner;

-- Replace with a policy that only allows trainers to insert assignments
-- (The edge function uses service role which bypasses RLS anyway)
CREATE POLICY "Trainers can insert assignments"
ON public.client_practitioner
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'trainer'::app_role));
