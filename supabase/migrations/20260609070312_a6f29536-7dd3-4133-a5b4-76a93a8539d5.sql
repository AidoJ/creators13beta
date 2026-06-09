
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS project_seek_me_for text,
  ADD COLUMN IF NOT EXISTS project_top_skills  text,
  ADD COLUMN IF NOT EXISTS project_dream       text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_project_seek_me_for_len,
  DROP CONSTRAINT IF EXISTS profiles_project_top_skills_len,
  DROP CONSTRAINT IF EXISTS profiles_project_dream_len;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_project_seek_me_for_len
    CHECK (project_seek_me_for IS NULL OR char_length(project_seek_me_for) <= 500),
  ADD CONSTRAINT profiles_project_top_skills_len
    CHECK (project_top_skills IS NULL OR char_length(project_top_skills) <= 500),
  ADD CONSTRAINT profiles_project_dream_len
    CHECK (project_dream IS NULL OR char_length(project_dream) <= 500);

COMMENT ON COLUMN public.profiles.project_seek_me_for IS
  'Open text (<=500 chars). "People seek me out most frequently for...". Robin+ tier required to set/edit; enforcement deferred to Phase 2.3.';
COMMENT ON COLUMN public.profiles.project_top_skills IS
  'Open text (<=500 chars). "My top 3 skills are...". Robin+ tier required to set/edit; enforcement deferred to Phase 2.3.';
COMMENT ON COLUMN public.profiles.project_dream IS
  'Open text (<=500 chars). "My dream project would look like...". Robin+ tier required to set/edit; enforcement deferred to Phase 2.3.';

COMMENT ON COLUMN public.profiles.member_preferences IS
  $c$JSONB bag of opt-in community preferences.
Future-reserved keys (set in Phase 2.3 Robin+ UI):
  co_create_ready:        ('offer_project' | 'join_project' | 'not_ready')[]
  connection_interests:   ('friendship' | 'romance' | 'work_teams')[]
  engagement_preferences: ('card_game' | 'virtual_cuppa' | 'in_person')[]$c$;

DROP FUNCTION IF EXISTS public.get_my_top_matches(integer);

CREATE FUNCTION public.get_my_top_matches(_limit integer DEFAULT 20)
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
    p.avatar_url,
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
