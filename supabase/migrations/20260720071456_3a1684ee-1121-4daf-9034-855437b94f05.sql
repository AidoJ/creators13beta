
-- Relax the "must have completed profile" gate: a member is discoverable in
-- the community as soon as they've (a) marked themselves community_visible
-- and (b) set at least one Creator Type (guessed or practitioner-assigned).

CREATE OR REPLACE FUNCTION public.recompute_match_scores_for_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_visible boolean;
  _other      uuid;
  _a          uuid;
  _b          uuid;
  _score      smallint;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;

  DELETE FROM public.member_match_scores
   WHERE member_a_id = _user_id OR member_b_id = _user_id;

  SELECT (
      p.community_visible
      AND EXISTS (SELECT 1 FROM public.creator_type_profiles ctp WHERE ctp.user_id = p.user_id)
    )
    INTO _is_visible
    FROM public.profiles p WHERE p.user_id = _user_id;

  IF NOT COALESCE(_is_visible, false) THEN
    RETURN;
  END IF;

  FOR _other IN
    SELECT p.user_id FROM public.profiles p
     WHERE p.user_id <> _user_id
       AND p.community_visible = true
       AND EXISTS (SELECT 1 FROM public.creator_type_profiles ctp WHERE ctp.user_id = p.user_id)
  LOOP
    IF _user_id < _other THEN _a := _user_id; _b := _other;
                          ELSE _a := _other;  _b := _user_id;
    END IF;
    _score := public.compute_match_score(_a, _b);
    IF _score > 0 THEN
      INSERT INTO public.member_match_scores (member_a_id, member_b_id, score, computed_at)
      VALUES (_a, _b, _score, now())
      ON CONFLICT (member_a_id, member_b_id)
        DO UPDATE SET score = EXCLUDED.score, computed_at = now();
    END IF;
  END LOOP;
END;
$$;

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
    AND EXISTS (SELECT 1 FROM public.creator_type_profiles ctp2 WHERE ctp2.user_id = p.user_id)
  ORDER BY pairs.score DESC, p.community_joined_at DESC NULLS LAST, p.display_name ASC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 20), 100));
$function$;

-- Backfill: recompute match scores for every currently-eligible member so
-- guessed-only Creators start showing up in matches immediately.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT p.user_id
    FROM public.profiles p
    JOIN public.creator_type_profiles ctp ON ctp.user_id = p.user_id
    WHERE p.community_visible = true
  LOOP
    PERFORM public.recompute_match_scores_for_user(r.user_id);
  END LOOP;
END $$;

-- Also allow get_public_member_profile to return guessed-only members so
-- the drilldown page works when clicked from matches.
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
    AND EXISTS (SELECT 1 FROM public.creator_type_profiles ctp3 WHERE ctp3.user_id = p.user_id)
    AND auth.uid() IS NOT NULL;
$$;
