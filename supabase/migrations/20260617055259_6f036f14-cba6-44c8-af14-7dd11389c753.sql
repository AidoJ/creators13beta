DROP POLICY IF EXISTS "Roster players can receive match updates" ON public.game_matches;
DROP POLICY IF EXISTS "Players can update their matches" ON public.game_matches;

CREATE POLICY "Players can update their matches"
  ON public.game_matches
  FOR UPDATE
  TO authenticated
  USING ((auth.uid() = host_user_id) OR (auth.uid() = guest_user_id))
  WITH CHECK ((auth.uid() = host_user_id) OR (auth.uid() = guest_user_id));