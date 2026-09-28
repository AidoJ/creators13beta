DROP FUNCTION IF EXISTS public.get_public_member_profile(uuid);
CREATE FUNCTION public.get_public_member_profile(_target_user_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, location_label text, bio_superpower text, bio_where_i_live text, bio_intriguing text, tier subscription_tier, community_joined_at timestamp with time zone, creator_types jsonb, open_to_contact boolean, enabled_channels text[], project_seek_me_for text, project_top_skills text, project_dream text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.user_id,
    p.display_name,
    CASE WHEN p.hide_avatar
         THEN (CASE WHEN p.stock_avatar IS NOT NULL THEN 'stock:' || p.stock_avatar END)
         ELSE p.avatar_url END AS avatar_url,
    p.location_label,
    p.bio_superpower,
    p.bio_where_i_live,
    p.bio_intriguing,
    (SELECT s.tier FROM public.subscriptions s WHERE s.user_id = p.user_id LIMIT 1) AS tier,
    p.community_joined_at,
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object('type', t.ct, 'source', ctp.source))
        FROM public.creator_type_profiles ctp,
             LATERAL (VALUES (ctp.primary_type),(ctp.secondary_type),(ctp.type_3),(ctp.type_4)) AS t(ct)
        WHERE ctp.user_id = p.user_id AND t.ct IS NOT NULL
      ),
      '[]'::jsonb
    ) AS creator_types,
    COALESCE(p.open_to_contact, false) AS open_to_contact,
    ARRAY(
      SELECT k FROM (
        SELECT 'email'::text AS k
          WHERE NULLIF(trim(coalesce(p.contact_channels->>'email','')), '') IS NOT NULL
        UNION ALL SELECT 'phone'
          WHERE NULLIF(trim(coalesce(p.contact_channels->>'phone_number','')), '') IS NOT NULL
        UNION ALL SELECT 'whatsapp'
          WHERE NULLIF(trim(coalesce(p.contact_channels->>'whatsapp','')), '') IS NOT NULL
        UNION ALL SELECT 'messenger'
          WHERE NULLIF(trim(coalesce(p.contact_channels->>'messenger','')), '') IS NOT NULL
        UNION ALL SELECT 'telegram'
          WHERE NULLIF(trim(coalesce(p.contact_channels->>'telegram','')), '') IS NOT NULL
        UNION ALL SELECT 'other'
          WHERE NULLIF(trim(coalesce(p.contact_channels->>'other','')), '') IS NOT NULL
      ) ch
    ) AS enabled_channels,
    CASE WHEN public.has_feature(p.user_id, 'community_create_profile_project') THEN p.project_seek_me_for END,
    CASE WHEN public.has_feature(p.user_id, 'community_create_profile_project') THEN p.project_top_skills END,
    CASE WHEN public.has_feature(p.user_id, 'community_create_profile_project') THEN p.project_dream END
  FROM public.profiles p
  WHERE p.user_id = _target_user_id
    AND p.community_visible = true
    AND EXISTS (SELECT 1 FROM public.creator_type_profiles ctp3 WHERE ctp3.user_id = p.user_id)
    AND auth.uid() IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION public.get_public_member_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_member_profile(uuid) TO authenticated;