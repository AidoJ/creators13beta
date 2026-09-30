CREATE OR REPLACE FUNCTION public.get_member_profile_v2(_target_user_id uuid)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, location_label text, bio_superpower text, bio_where_i_live text, bio_intriguing text, tier subscription_tier, community_joined_at timestamptz, creator_types jsonb, open_to_contact boolean, enabled_channels text[], project_seek_me_for text, project_top_skills text, project_dream text, practitioner_status practitioner_status, certification_level integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.display_name,
    CASE WHEN p.hide_avatar THEN (CASE WHEN p.stock_avatar IS NOT NULL THEN 'stock:' || p.stock_avatar END) ELSE p.avatar_url END,
    p.location_label, p.bio_superpower, p.bio_where_i_live, p.bio_intriguing,
    (SELECT s.tier FROM public.subscriptions s WHERE s.user_id = p.user_id LIMIT 1),
    p.community_joined_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('type', t.ct, 'source', ctp.source))
      FROM public.creator_type_profiles ctp,
      LATERAL (VALUES (ctp.primary_type),(ctp.secondary_type),(ctp.type_3),(ctp.type_4)) AS t(ct)
      WHERE ctp.user_id = p.user_id AND t.ct IS NOT NULL), '[]'::jsonb),
    p.open_to_contact,
    ARRAY(SELECT key FROM jsonb_each_text(COALESCE(p.contact_channels, '{}'::jsonb)) WHERE value <> ''),
    CASE WHEN public.has_feature(p.user_id, 'community_create_profile_project') THEN p.project_seek_me_for END,
    CASE WHEN public.has_feature(p.user_id, 'community_create_profile_project') THEN p.project_top_skills END,
    CASE WHEN public.has_feature(p.user_id, 'community_create_profile_project') THEN p.project_dream END,
    p.practitioner_status,
    p.certification_level
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.user_id = _target_user_id
    AND (p.user_id = auth.uid() OR p.community_visible = true)
    AND EXISTS (SELECT 1 FROM public.creator_type_profiles c WHERE c.user_id = p.user_id);
$$;
REVOKE ALL ON FUNCTION public.get_member_profile_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_profile_v2(uuid) TO authenticated;