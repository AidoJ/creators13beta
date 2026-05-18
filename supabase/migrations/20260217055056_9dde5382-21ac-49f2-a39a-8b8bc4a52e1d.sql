-- Allow practitioners to view their assigned clients' subscriptions
CREATE POLICY "Practitioners can view assigned client subscriptions"
ON public.subscriptions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.client_practitioner cp
    WHERE cp.client_id = subscriptions.user_id
      AND cp.practitioner_id = auth.uid()
      AND cp.active = true
  )
);