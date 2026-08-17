REVOKE UPDATE ON public.game_matches FROM authenticated;

GRANT UPDATE (host_name, guest_name, updated_at) ON public.game_matches TO authenticated;

REVOKE DELETE ON public.game_matches FROM authenticated;

GRANT DELETE ON public.game_matches TO authenticated;

DROP POLICY IF EXISTS "Hosts can delete their matches" ON public.game_matches;

CREATE POLICY "Hosts can cancel their own open invites"
  ON public.game_matches
  FOR DELETE
  TO authenticated
  USING (auth.uid() = host_user_id AND status = 'waiting'::match_status);