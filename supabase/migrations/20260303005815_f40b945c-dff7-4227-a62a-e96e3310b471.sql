
-- Add UPDATE policy for profiling_photos so upsert works when re-uploading
CREATE POLICY "Users can update own photos"
ON public.profiling_photos
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
