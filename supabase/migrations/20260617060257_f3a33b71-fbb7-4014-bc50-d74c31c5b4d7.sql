
CREATE OR REPLACE FUNCTION public.is_match_participant(_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.game_match_players
    WHERE match_id = _match_id AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_match_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_match_participant(uuid) TO authenticated;

DROP POLICY IF EXISTS "players see their match roster" ON public.game_match_players;
CREATE POLICY "players see their match roster"
ON public.game_match_players
FOR SELECT
TO authenticated
USING (public.is_match_participant(match_id));

DROP POLICY IF EXISTS "Roster players can view their matches" ON public.game_matches;
CREATE POLICY "Roster players can view their matches"
ON public.game_matches
FOR SELECT
TO authenticated
USING (
  auth.uid() = host_user_id
  OR auth.uid() = guest_user_id
  OR public.is_match_participant(id)
);
