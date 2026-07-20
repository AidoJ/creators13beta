CREATE OR REPLACE FUNCTION public.get_community_members(_limit integer DEFAULT 100)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  location_label text,
  location_lat numeric,
  location_lng numeric,
  tier public.subscription_tier,
  score smallint,
  community_joined_at timestamptz,
  creator_types jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS uid)
  SELECT
    p.user_id,
    p.display_name,
    CASE WHEN p.hide_avatar
         THEN (CASE WHEN p.stock_avatar IS NOT NULL THEN 'stock:' || p.stock_avatar END)
         ELSE p.avatar_url END AS avatar_url,
    p.location_label,
    p.location_lat,
    p.location_lng,
    (SELECT s.tier FROM public.subscriptions s WHERE s.user_id = p.user_id LIMIT 1) AS tier,
    COALESCE((
      SELECT mms.score FROM public.member_match_scores mms, me
      WHERE (mms.member_a_id = me.uid AND mms.member_b_id = p.user_id)
         OR (mms.member_b_id = me.uid AND mms.member_a_id = p.user_id)
      LIMIT 1
    ), 0::smallint) AS score,
    p.community_joined_at,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('type', t.ct, 'source', ctp.source))
       FROM public.creator_type_profiles ctp,
            LATERAL (VALUES (ctp.primary_type),(ctp.secondary_type),(ctp.type_3),(ctp.type_4)) AS t(ct)
       WHERE ctp.user_id = p.user_id AND t.ct IS NOT NULL),
      '[]'::jsonb
    ) AS creator_types
  FROM public.profiles p, me
  WHERE me.uid IS NOT NULL
    AND p.community_visible = true
    AND p.user_id <> me.uid
    AND EXISTS (SELECT 1 FROM public.creator_type_profiles ctp2 WHERE ctp2.user_id = p.user_id)
  ORDER BY score DESC, p.community_joined_at DESC NULLS LAST, p.display_name ASC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 100), 500));
$$;

GRANT EXECUTE ON FUNCTION public.get_community_members(integer) TO authenticated;