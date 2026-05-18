-- Allow authenticated users to insert their own client_practitioner assignments
CREATE POLICY "Clients can assign themselves to practitioners"
ON public.client_practitioner
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = client_id);

-- Allow authenticated users to update their own assignments (deactivate)
CREATE POLICY "Clients can update own assignments"
ON public.client_practitioner
FOR UPDATE
TO authenticated
USING (auth.uid() = client_id)
WITH CHECK (auth.uid() = client_id);