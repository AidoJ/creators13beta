
-- Replace the overly permissive INSERT policy with a service-role-only approach
-- The service role bypasses RLS anyway, so we can drop the permissive policy
DROP POLICY "Service role can insert events" ON public.training_call_events;
