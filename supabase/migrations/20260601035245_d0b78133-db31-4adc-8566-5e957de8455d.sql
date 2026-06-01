-- Allow admins and trainers to update any player's progress (points, streaks, etc.)
CREATE POLICY "Admins and trainers can update any player progress"
ON public.player_progress
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'trainer'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'trainer'::app_role));