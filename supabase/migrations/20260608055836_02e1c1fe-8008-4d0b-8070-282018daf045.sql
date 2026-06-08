
CREATE OR REPLACE FUNCTION public.get_public_member_profile(_target_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  location_label text,
  bio_superpower text,
  bio_where_i_live text,
  bio_intriguing text,
  tier subscription_tier,
  community_joined_at timestamptz,
  creator_types jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    p.display_name,
    p.avatar_url,
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
             LATERAL (
               VALUES (ctp.primary_type), (ctp.secondary_type), (ctp.type_3), (ctp.type_4)
             ) AS t(ct)
        WHERE ctp.user_id = p.user_id AND t.ct IS NOT NULL
      ),
      '[]'::jsonb
    ) AS creator_types
  FROM public.profiles p
  WHERE p.user_id = _target_user_id
    AND p.community_visible = true
    AND p.profile_completed_at IS NOT NULL
    AND auth.uid() IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_member_profile(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_member_profile(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_public_member_profile(uuid) TO authenticated;
