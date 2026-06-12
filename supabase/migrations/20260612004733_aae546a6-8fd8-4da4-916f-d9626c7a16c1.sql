-- Stock avatar choice shown to other members when hide_avatar is true.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stock_avatar text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_stock_avatar_check
  CHECK (stock_avatar IS NULL OR stock_avatar IN
    ('lava','fire','whirlwind','snow','lightning','sun','lake','ocean','tree','mountain','soil','river','sky'));

COMMENT ON COLUMN public.profiles.stock_avatar IS
  'Optional stock avatar key (one of the 13 Creator Types). When hide_avatar is true, community RPCs surface this as ''stock:<key>'' in avatar_url instead of NULL.';

-- get_my_top_matches: surface stock avatar when photo hidden
CREATE OR REPLACE FUNCTION public.get_my_top_matches(_limit integer DEFAULT 20)
 RETURNS TABLE(
   user_id uuid,
   display_name text,
   avatar_url text,
   location_label text,
   location_lat numeric,
   location_lng numeric,
   tier subscription_tier,
   score smallint,
   community_joined_at timestamp with time zone,
   creator_types jsonb
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT auth.uid() AS uid),
  pairs AS (
    SELECT
      CASE WHEN mms.member_a_id = me.uid THEN mms.member_b_id ELSE mms.member_a_id END AS other,
      mms.score
    FROM public.member_match_scores mms, me
    WHERE me.uid IS NOT NULL
      AND (mms.member_a_id = me.uid OR mms.member_b_id = me.uid)
  )
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
    pairs.score,
    p.community_joined_at,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('type', t.ct, 'source', ctp.source))
       FROM public.creator_type_profiles ctp,
            LATERAL (VALUES (ctp.primary_type),(ctp.secondary_type),(ctp.type_3),(ctp.type_4)) AS t(ct)
       WHERE ctp.user_id = p.user_id AND t.ct IS NOT NULL),
      '[]'::jsonb
    ) AS creator_types
  FROM pairs
  JOIN public.profiles p ON p.user_id = pairs.other
  WHERE p.community_visible = true
    AND p.profile_completed_at IS NOT NULL
  ORDER BY pairs.score DESC, p.community_joined_at DESC NULLS LAST, p.display_name ASC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 20), 100));
$function$;

-- get_public_member_profile: surface stock avatar when photo hidden
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
  community_joined_at timestamp with time zone,
  creator_types jsonb,
  open_to_contact boolean,
  enabled_channels text[]
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
    ) AS enabled_channels
  FROM public.profiles p
  WHERE p.user_id = _target_user_id
    AND p.community_visible = true
    AND p.profile_completed_at IS NOT NULL
    AND auth.uid() IS NOT NULL;
$$;

-- get_incoming_contact_requests: surface stock avatar when photo hidden
CREATE OR REPLACE FUNCTION public.get_incoming_contact_requests()
RETURNS TABLE (
  id uuid,
  from_user_id uuid,
  from_display_name text,
  from_avatar_url text,
  reason text,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cr.id, cr.from_user_id, p.display_name,
         CASE WHEN p.hide_avatar
              THEN (CASE WHEN p.stock_avatar IS NOT NULL THEN 'stock:' || p.stock_avatar END)
              ELSE p.avatar_url END,
         cr.reason, cr.status, cr.created_at
  FROM public.contact_requests cr
  LEFT JOIN public.profiles p ON p.user_id = cr.from_user_id
  WHERE auth.uid() IS NOT NULL AND cr.to_user_id = auth.uid()
  ORDER BY cr.created_at DESC;
$$;

-- get_outgoing_contact_requests: surface stock avatar when photo hidden
CREATE OR REPLACE FUNCTION public.get_outgoing_contact_requests()
RETURNS TABLE (
  id uuid,
  to_user_id uuid,
  to_display_name text,
  to_avatar_url text,
  reason text,
  status text,
  decline_comment text,
  created_at timestamptz,
  responded_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cr.id, cr.to_user_id, p.display_name,
         CASE WHEN p.hide_avatar
              THEN (CASE WHEN p.stock_avatar IS NOT NULL THEN 'stock:' || p.stock_avatar END)
              ELSE p.avatar_url END,
         cr.reason, cr.status, cr.decline_comment,
         cr.created_at, cr.responded_at, cr.revoked_at
  FROM public.contact_requests cr
  LEFT JOIN public.profiles p ON p.user_id = cr.to_user_id
  WHERE auth.uid() IS NOT NULL AND cr.from_user_id = auth.uid()
  ORDER BY cr.created_at DESC;
$$;

-- get_my_approved_contacts: surface stock avatar when photo hidden
CREATE OR REPLACE FUNCTION public.get_my_approved_contacts()
RETURNS TABLE (
  other_user_id uuid,
  other_display_name text,
  other_avatar_url text,
  approved_at timestamptz,
  channels jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      cr.id,
      CASE WHEN cr.from_user_id = _uid THEN cr.to_user_id ELSE cr.from_user_id END AS other_id,
      cr.responded_at AS approved_at
    FROM public.contact_requests cr
    WHERE cr.status = 'approved'
      AND (cr.from_user_id = _uid OR cr.to_user_id = _uid)
  ),
  joined AS (
    SELECT
      b.other_id,
      b.approved_at,
      po.display_name AS other_display_name,
      CASE WHEN po.hide_avatar
           THEN (CASE WHEN po.stock_avatar IS NOT NULL THEN 'stock:' || po.stock_avatar END)
           ELSE po.avatar_url END AS other_avatar_url,
      pme.contact_channels AS my_ch,
      po.contact_channels  AS their_ch,
      pme.open_to_contact AS my_open,
      po.open_to_contact  AS their_open
    FROM base b
    JOIN public.profiles po  ON po.user_id  = b.other_id
    JOIN public.profiles pme ON pme.user_id = _uid
  )
  SELECT
    j.other_id,
    j.other_display_name,
    j.other_avatar_url,
    j.approved_at,
    (
      SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
      FROM (
        SELECT 'email'::text AS k, to_jsonb(j.their_ch->>'email') AS v
        WHERE j.my_open AND j.their_open
          AND NULLIF(trim(coalesce(j.my_ch->>'email','')), '') IS NOT NULL
          AND NULLIF(trim(coalesce(j.their_ch->>'email','')), '') IS NOT NULL
        UNION ALL
        SELECT 'whatsapp', to_jsonb(j.their_ch->>'whatsapp')
        WHERE j.my_open AND j.their_open
          AND NULLIF(trim(coalesce(j.my_ch->>'whatsapp','')), '') IS NOT NULL
          AND NULLIF(trim(coalesce(j.their_ch->>'whatsapp','')), '') IS NOT NULL
        UNION ALL
        SELECT 'messenger', to_jsonb(j.their_ch->>'messenger')
        WHERE j.my_open AND j.their_open
          AND NULLIF(trim(coalesce(j.my_ch->>'messenger','')), '') IS NOT NULL
          AND NULLIF(trim(coalesce(j.their_ch->>'messenger','')), '') IS NOT NULL
        UNION ALL
        SELECT 'telegram', to_jsonb(j.their_ch->>'telegram')
        WHERE j.my_open AND j.their_open
          AND NULLIF(trim(coalesce(j.my_ch->>'telegram','')), '') IS NOT NULL
          AND NULLIF(trim(coalesce(j.their_ch->>'telegram','')), '') IS NOT NULL
        UNION ALL
        SELECT 'other', to_jsonb(j.their_ch->>'other')
        WHERE j.my_open AND j.their_open
          AND NULLIF(trim(coalesce(j.my_ch->>'other','')), '') IS NOT NULL
          AND NULLIF(trim(coalesce(j.their_ch->>'other','')), '') IS NOT NULL
        UNION ALL
        SELECT 'phone', jsonb_build_object(
          'number', j.their_ch->>'phone_number',
          'call_ok', COALESCE((j.their_ch->>'phone_call_ok')::boolean, false),
          'sms_ok',  COALESCE((j.their_ch->>'phone_sms_ok')::boolean, false)
        )
        WHERE j.my_open AND j.their_open
          AND NULLIF(trim(coalesce(j.my_ch->>'phone_number','')), '') IS NOT NULL
          AND NULLIF(trim(coalesce(j.their_ch->>'phone_number','')), '') IS NOT NULL
      ) parts
    ) AS channels
  FROM joined j
  ORDER BY j.approved_at DESC NULLS LAST, j.other_display_name ASC;
END;
$$;