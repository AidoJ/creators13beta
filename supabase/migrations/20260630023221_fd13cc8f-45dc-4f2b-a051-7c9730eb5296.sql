-- Tier 2 #6 — client_practitioner: deny client self-writes. Trainers/admins only.
DROP POLICY IF EXISTS "Clients can update own assignments" ON public.client_practitioner;
DROP POLICY IF EXISTS "Clients can assign themselves to practitioners" ON public.client_practitioner;

-- Tier 2 #7 — training_call_invitees: tighten SELECT.
DROP POLICY IF EXISTS "Practitioners can view call invitees" ON public.training_call_invitees;
DROP POLICY IF EXISTS "Admins can view call invitees" ON public.training_call_invitees;

CREATE POLICY "Admins and trainers can view all invitees"
  ON public.training_call_invitees FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'trainer'::app_role)
  );

CREATE POLICY "Invitees can view their own invite row"
  ON public.training_call_invitees FOR SELECT
  USING (
    user_id = auth.uid()
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Tier 4 #11 — game_match_moves: read from full roster.
DROP POLICY IF EXISTS "Players can view their match moves" ON public.game_match_moves;
CREATE POLICY "Players can view their match moves"
  ON public.game_match_moves FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.game_match_players p
      WHERE p.match_id = game_match_moves.match_id
        AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.game_matches m
      WHERE m.id = game_match_moves.match_id
        AND (m.host_user_id = auth.uid() OR m.guest_user_id = auth.uid())
    )
  );

-- Tier 4 #12/#13 — explicit SELECT for tier-access grid + tier-invites
-- (get_community_events is SECURITY DEFINER, so trainee/practitioner reading
-- the events page is unaffected; these SELECTs only enable the manager UI).
CREATE POLICY "Trainers can view tier access grid"
  ON public.training_call_tier_access FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'trainer'::app_role)
  );

CREATE POLICY "Trainers can view tier invites"
  ON public.training_call_tier_invites FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'trainer'::app_role)
  );
