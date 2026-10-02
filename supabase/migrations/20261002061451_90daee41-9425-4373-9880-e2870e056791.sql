CREATE OR REPLACE FUNCTION public.get_my_onboarding()
 RETURNS TABLE(key text, feature_key text, title text, description text, cta_label text, route text, sort_order integer, icon_key text, done boolean, dismissed_at timestamp with time zone, completed_seen_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT auth.uid() AS uid),
  member_context AS (
    SELECT
      COALESCE((SELECT sub.signup_path = 'player' FROM public.subscriptions sub, me WHERE sub.user_id = me.uid LIMIT 1), false) AS player_only,
      EXISTS (
        SELECT 1 FROM public.entitlements e, me
        WHERE e.user_id = me.uid AND e.status = 'active' AND e.starts_at <= now()
          AND (e.ends_at IS NULL OR e.ends_at > now()) AND e.level_key <> 'free'
      ) AS has_member_access,
      EXISTS (
        SELECT 1 FROM public.user_roles ur, me
        WHERE ur.user_id = me.uid AND ur.role IN ('admin','trainer','practitioner')
      ) AS is_staff,
      EXISTS (
        SELECT 1 FROM public.user_roles ur, me
        WHERE ur.user_id = me.uid AND ur.role IN ('trainee','practitioner')
      ) AS is_prac,
      EXISTS (
        SELECT 1 FROM public.creator_type_profiles c, me
        WHERE c.user_id = me.uid AND c.profiled_by IS NOT NULL
          AND COALESCE(c.source, '') <> 'self_selected' AND c.primary_type IS NOT NULL
      ) AS has_assigned_types,
      EXISTS (
        SELECT 1 FROM public.entitlements e, me
        WHERE e.user_id = me.uid AND e.status = 'active' AND e.starts_at <= now()
          AND (e.ends_at IS NULL OR e.ends_at > now())
          AND (e.level_key LIKE 'profile_%' OR e.level_key IN ('case_study','creator','co_creator'))
      ) AS has_profiling_purchase,
      EXISTS (
        SELECT 1 FROM public.user_roles ur, me
        WHERE ur.user_id = me.uid AND ur.role IN ('trainee','practitioner','trainer','admin')
      ) AS is_prac_or_staff
  ),
  held_features AS (
    SELECT f AS feature_key FROM public.my_features() f
  ),
  mine AS (SELECT p.* FROM public.profiles p, me WHERE p.user_id = me.uid),
  state AS (SELECT os.* FROM public.onboarding_state os, me WHERE os.user_id = me.uid)
  SELECT s.key, s.feature_key, s.title, s.description, s.cta_label, s.route,
         s.sort_order, s.icon_key,
         CASE s.check_key
           WHEN 'profiling_journey' THEN EXISTS (
             SELECT 1 FROM public.creator_type_profiles c, me
             WHERE c.user_id = me.uid AND c.profiled_by IS NOT NULL
               AND COALESCE(c.source, '') <> 'self_selected' AND c.primary_type IS NOT NULL)
           WHEN 'view_creator_types' THEN EXISTS (
             SELECT 1 FROM public.creator_type_profiles c, me
             WHERE c.user_id = me.uid AND c.profiled_by IS NOT NULL
               AND COALESCE(c.source, '') <> 'self_selected' AND c.primary_type IS NOT NULL)
             AND COALESCE((SELECT visited ? 'view_creator_types' FROM state), false)
           WHEN 'community_profile' THEN COALESCE((SELECT profile_completed_at IS NOT NULL FROM mine), false)
           WHEN 'map_visibility' THEN COALESCE((SELECT community_visible AND location_lat IS NOT NULL AND location_lng IS NOT NULL FROM mine), false)
           WHEN 'first_connection' THEN EXISTS (SELECT 1 FROM public.contact_requests r, me WHERE r.from_user_id = me.uid)
           WHEN 'matching_filters' THEN COALESCE((SELECT visited ? 'matching_filters' FROM state), false)
           WHEN 'events_visit' THEN COALESCE((SELECT visited ? 'events_visit' FROM state), false)
           WHEN 'projects_visit' THEN COALESCE((SELECT visited ? 'projects_visit' FROM state), false)
           WHEN 'first_project' THEN EXISTS (SELECT 1 FROM public.projects p, me WHERE p.creator_id = me.uid)
             OR EXISTS (SELECT 1 FROM public.project_co_creators pc, me WHERE pc.user_id = me.uid)
           WHEN 'first_game' THEN EXISTS (SELECT 1 FROM public.game_matches gm, me WHERE gm.host_user_id = me.uid OR gm.guest_user_id = me.uid)
             OR EXISTS (SELECT 1 FROM public.game_match_players gp, me WHERE gp.user_id = me.uid)
           WHEN 'meet_creators' THEN COALESCE((SELECT cardinality(types_seen) >= 4 FROM public.player_progress pp, me WHERE pp.user_id = me.uid), false)
           WHEN 'invite_friend' THEN EXISTS (SELECT 1 FROM public.game_matches gm, me WHERE gm.host_user_id = me.uid AND gm.invite_code IS NOT NULL)
           WHEN 'share_practitioner_code' THEN COALESCE((SELECT practitioner_code IS NOT NULL FROM mine), false)
             AND EXISTS (SELECT 1 FROM public.client_practitioner cp, me WHERE cp.practitioner_id = me.uid AND cp.active)
           WHEN 'first_case_study' THEN EXISTS (SELECT 1 FROM public.case_studies cs, me WHERE cs.practitioner_id = me.uid)
           WHEN 'clinic_referral' THEN EXISTS (SELECT 1 FROM public.client_invitations ci, me WHERE ci.practitioner_id = me.uid AND ci.kind = 'clinic_profile')
           ELSE false
         END AS done,
         (SELECT st.dismissed_at FROM state st),
         (SELECT st.completed_seen_at FROM state st)
  FROM public.onboarding_steps s
  JOIN held_features hf ON hf.feature_key = s.feature_key
  CROSS JOIN member_context mc
  WHERE s.enabled AND auth.uid() IS NOT NULL
    AND (NOT mc.is_staff OR mc.has_member_access)
    AND (NOT mc.player_only OR s.key IN ('first_game','meet_creators','invite_friend'))
    AND (s.key <> 'profiling_journey' OR mc.has_assigned_types OR mc.has_profiling_purchase OR NOT mc.is_prac_or_staff)
    AND (s.key <> 'view_creator_types' OR mc.has_assigned_types)
  ORDER BY
    CASE
      WHEN mc.is_prac AND s.key IN ('share_practitioner_code','first_case_study','clinic_referral') THEN 0
      WHEN s.key = 'profiling_journey' THEN 1
      ELSE 2
    END,
    s.sort_order, s.key;
$function$;