DROP POLICY IF EXISTS "Players can view their matches" ON public.game_matches;
DROP POLICY IF EXISTS "Players can update their matches" ON public.game_matches;

CREATE POLICY "Roster players can view their matches"
  ON public.game_matches
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = host_user_id
    OR auth.uid() = guest_user_id
    OR EXISTS (
      SELECT 1
      FROM public.game_match_players gmp
      WHERE gmp.match_id = game_matches.id
        AND gmp.user_id = auth.uid()
    )
  );

CREATE POLICY "Roster players can receive match updates"
  ON public.game_matches
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = host_user_id
    OR auth.uid() = guest_user_id
    OR EXISTS (
      SELECT 1
      FROM public.game_match_players gmp
      WHERE gmp.match_id = game_matches.id
        AND gmp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = host_user_id
    OR auth.uid() = guest_user_id
    OR EXISTS (
      SELECT 1
      FROM public.game_match_players gmp
      WHERE gmp.match_id = game_matches.id
        AND gmp.user_id = auth.uid()
    )
  );