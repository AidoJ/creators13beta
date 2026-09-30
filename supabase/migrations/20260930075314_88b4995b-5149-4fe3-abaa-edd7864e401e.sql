CREATE TABLE public.onboarding_steps (
  key text PRIMARY KEY,
  feature_key text NOT NULL REFERENCES public.features(key) ON UPDATE CASCADE ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  cta_label text NOT NULL DEFAULT 'Go',
  route text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  check_key text NOT NULL,
  icon_key text NOT NULL DEFAULT 'sparkles',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.onboarding_steps TO authenticated;
GRANT ALL ON public.onboarding_steps TO service_role;
ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in members can read onboarding steps"
ON public.onboarding_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can add onboarding steps"
ON public.onboarding_steps FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update onboarding steps"
ON public.onboarding_steps FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete onboarding steps"
ON public.onboarding_steps FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.onboarding_state (
  user_id uuid PRIMARY KEY,
  dismissed_at timestamptz,
  completed_seen_at timestamptz,
  visited jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.onboarding_state TO authenticated;
GRANT ALL ON public.onboarding_state TO service_role;
ALTER TABLE public.onboarding_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read their onboarding state"
ON public.onboarding_state FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "Members can create their onboarding state"
ON public.onboarding_state FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
CREATE POLICY "Members can update their onboarding state"
ON public.onboarding_state FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.onboarding_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER onboarding_steps_touch_updated_at
BEFORE UPDATE ON public.onboarding_steps
FOR EACH ROW EXECUTE FUNCTION public.onboarding_touch_updated_at();
CREATE TRIGGER onboarding_state_touch_updated_at
BEFORE UPDATE ON public.onboarding_state
FOR EACH ROW EXECUTE FUNCTION public.onboarding_touch_updated_at();

INSERT INTO public.onboarding_steps
  (key, feature_key, title, description, cta_label, route, sort_order, check_key, icon_key)
VALUES
  ('profiling_journey', 'dashboard_upload_photos', 'Finish your profiling journey', 'Complete the next step in your profiling journey.', 'Continue', '/dashboard', 10, 'profiling_journey', 'camera'),
  ('view_creator_types', 'dashboard_view_creator_profiles', 'See your Creator Types', 'Open your confirmed Creator Type profile.', 'View profile', '/dashboard#creator-profile', 20, 'view_creator_types', 'sparkles'),
  ('community_profile', 'community_create_profile_general', 'Create your community profile', 'Introduce yourself to the Creator community.', 'Create profile', '/onboarding/profile', 30, 'community_profile', 'user'),
  ('map_visibility', 'community_view_members_map', 'Make yourself visible on the map', 'Choose to be discoverable and add a location.', 'Check visibility', '/settings/community', 40, 'map_visibility', 'map'),
  ('first_connection', 'community_message_members', 'Send your first connection request', 'Reach out to another member.', 'Find a connection', '/community/dashboard', 50, 'first_connection', 'users'),
  ('matching_filters', 'community_matching_filters', 'Try the matching filters', 'Explore the community through a matching filter.', 'Try filters', '/community/dashboard', 60, 'matching_filters', 'filter'),
  ('events_visit', 'events_view', 'Look at upcoming events', 'See what is coming up for your membership.', 'View events', '/community/events', 70, 'events_visit', 'calendar'),
  ('projects_visit', 'projects_view', 'Explore Projects', 'See what members are creating together.', 'Explore projects', '/community/projects', 80, 'projects_visit', 'folder'),
  ('first_project', 'projects_add_edit', 'Start or join a project', 'Create a project or join one as a co-creator.', 'View projects', '/community/projects', 90, 'first_project', 'folder-plus'),
  ('first_game', 'game_bot_player', 'Play your first game', 'Start building an ecosystem with the Creators.', 'Play', '/play/new', 100, 'first_game', 'game'),
  ('meet_creators', 'game_bot_player', 'Meet the Creators', 'Encounter at least 4 of the 13 Creators through play.', 'Keep playing', '/play', 110, 'meet_creators', 'sparkles'),
  ('invite_friend', 'game_multiplayer_invite', 'Invite a friend to a match', 'Create a match and share its invitation.', 'Invite a friend', '/play/new', 120, 'invite_friend', 'user-plus'),
  ('share_practitioner_code', 'prac_code_assigned', 'Share your practitioner code', 'Link your first client or case-study volunteer.', 'Open invitations', '/practitioner?tab=invitations', 130, 'share_practitioner_code', 'share'),
  ('first_case_study', 'prac_case_study_creation', 'Create your first case study', 'Start a case study for a linked client.', 'Open case studies', '/practitioner?tab=cases', 140, 'first_case_study', 'clipboard'),
  ('clinic_referral', 'prac_clinic_referral', 'Refer a clinic client', 'Send your first Clinic Profile invitation.', 'Refer a client', '/practitioner?tab=clinic', 150, 'clinic_referral', 'stethoscope')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.mark_onboarding_visited(_marker_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _marker_key NOT IN ('view_creator_types', 'matching_filters', 'events_visit', 'projects_visit', 'profiling_tools') THEN
    RAISE EXCEPTION 'Unknown onboarding marker';
  END IF;
  INSERT INTO public.onboarding_state (user_id, visited)
  VALUES (auth.uid(), jsonb_build_object(_marker_key, now()))
  ON CONFLICT (user_id) DO UPDATE
  SET visited = COALESCE(public.onboarding_state.visited, '{}'::jsonb)
                || jsonb_build_object(_marker_key, now()),
      updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.mark_onboarding_visited(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_onboarding_visited(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_onboarding()
RETURNS TABLE (
  key text,
  feature_key text,
  title text,
  description text,
  cta_label text,
  route text,
  sort_order integer,
  icon_key text,
  done boolean,
  dismissed_at timestamptz,
  completed_seen_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  held_features AS (
    SELECT DISTINCT ag.feature_key
    FROM public.access_grid ag, me
    WHERE ag.level_key = 'free'
       OR ag.level_key IN (
         SELECT e.level_key
         FROM public.entitlements e
         WHERE e.user_id = me.uid
           AND e.status = 'active'
           AND e.starts_at <= now()
           AND (e.ends_at IS NULL OR e.ends_at > now())
       )
  ),
  mine AS (
    SELECT p.* FROM public.profiles p, me WHERE p.user_id = me.uid
  ),
  state AS (
    SELECT s.* FROM public.onboarding_state s, me WHERE s.user_id = me.uid
  )
  SELECT s.key, s.feature_key, s.title, s.description, s.cta_label, s.route,
         s.sort_order, s.icon_key,
         CASE s.check_key
           WHEN 'profiling_journey' THEN EXISTS (
             SELECT 1 FROM public.creator_type_profiles c, me
             WHERE c.user_id = me.uid
               AND c.profiled_by IS NOT NULL
               AND COALESCE(c.source, '') <> 'self_selected'
               AND c.primary_type IS NOT NULL
           )
           WHEN 'view_creator_types' THEN EXISTS (
             SELECT 1 FROM public.creator_type_profiles c, me
             WHERE c.user_id = me.uid
               AND c.profiled_by IS NOT NULL
               AND COALESCE(c.source, '') <> 'self_selected'
               AND c.primary_type IS NOT NULL
           ) AND COALESCE((SELECT visited ? 'view_creator_types' FROM state), false)
           WHEN 'community_profile' THEN COALESCE((SELECT profile_completed_at IS NOT NULL FROM mine), false)
           WHEN 'map_visibility' THEN COALESCE((SELECT community_visible AND location_lat IS NOT NULL AND location_lng IS NOT NULL FROM mine), false)
           WHEN 'first_connection' THEN EXISTS (SELECT 1 FROM public.contact_requests r, me WHERE r.from_user_id = me.uid)
           WHEN 'matching_filters' THEN COALESCE((SELECT visited ? 'matching_filters' FROM state), false)
           WHEN 'events_visit' THEN COALESCE((SELECT visited ? 'events_visit' FROM state), false)
           WHEN 'projects_visit' THEN COALESCE((SELECT visited ? 'projects_visit' FROM state), false)
           WHEN 'first_project' THEN EXISTS (
             SELECT 1 FROM public.projects p, me WHERE p.creator_id = me.uid
             UNION ALL
             SELECT 1 FROM public.project_co_creators pc, me WHERE pc.user_id = me.uid
           )
           WHEN 'first_game' THEN EXISTS (
             SELECT 1 FROM public.game_matches gm, me
             WHERE gm.host_user_id = me.uid OR gm.guest_user_id = me.uid
             UNION ALL
             SELECT 1 FROM public.game_match_players gp, me WHERE gp.user_id = me.uid
           )
           WHEN 'meet_creators' THEN COALESCE((SELECT cardinality(types_seen) >= 4 FROM public.player_progress pp, me WHERE pp.user_id = me.uid), false)
           WHEN 'invite_friend' THEN EXISTS (SELECT 1 FROM public.game_matches gm, me WHERE gm.host_user_id = me.uid AND gm.invite_code IS NOT NULL)
           WHEN 'share_practitioner_code' THEN COALESCE((SELECT practitioner_code IS NOT NULL FROM mine), false)
             AND EXISTS (SELECT 1 FROM public.client_practitioner cp, me WHERE cp.practitioner_id = me.uid AND cp.active)
           WHEN 'first_case_study' THEN EXISTS (SELECT 1 FROM public.case_studies cs, me WHERE cs.practitioner_id = me.uid)
           WHEN 'clinic_referral' THEN EXISTS (SELECT 1 FROM public.client_invitations ci, me WHERE ci.practitioner_id = me.uid AND ci.kind = 'clinic')
           ELSE false
         END AS done,
         (SELECT st.dismissed_at FROM state st),
         (SELECT st.completed_seen_at FROM state st)
  FROM public.onboarding_steps s
  JOIN held_features hf ON hf.feature_key = s.feature_key
  WHERE s.enabled
    AND auth.uid() IS NOT NULL
  ORDER BY CASE WHEN s.key = 'profiling_journey' THEN 0 ELSE s.sort_order END, s.key;
$$;
REVOKE ALL ON FUNCTION public.get_my_onboarding() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_onboarding() TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_onboarding_for_levels(_level_keys text[])
RETURNS TABLE (
  key text,
  feature_key text,
  title text,
  description text,
  cta_label text,
  route text,
  sort_order integer,
  icon_key text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY
  SELECT DISTINCT s.key, s.feature_key, s.title, s.description, s.cta_label,
         s.route, s.sort_order, s.icon_key
  FROM public.onboarding_steps s
  JOIN public.access_grid ag ON ag.feature_key = s.feature_key
  WHERE s.enabled
    AND ag.level_key = ANY(COALESCE(_level_keys, ARRAY[]::text[]))
  ORDER BY s.sort_order, s.key;
END;
$$;
REVOKE ALL ON FUNCTION public.preview_onboarding_for_levels(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_onboarding_for_levels(text[]) TO authenticated;