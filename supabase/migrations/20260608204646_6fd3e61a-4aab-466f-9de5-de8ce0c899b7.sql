CREATE OR REPLACE FUNCTION public.compute_match_score(_a uuid, _b uuid)
RETURNS smallint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  types_a text[];
  types_b text[];
  exact_matches int := 0;
  family_matches int := 0;
  shared_families text[] := ARRAY[]::text[];
  t_a text;
  t_b text;
  fam_a text;
  fam_b text;
  total int;
BEGIN
  SELECT ARRAY(
    SELECT lower(x) FROM unnest(ARRAY[p.primary_type, p.secondary_type, p.type_3, p.type_4]) x
    WHERE x IS NOT NULL
  )
  INTO types_a
  FROM public.creator_type_profiles p
  WHERE p.user_id = _a
  ORDER BY p.created_at DESC
  LIMIT 1;

  SELECT ARRAY(
    SELECT lower(x) FROM unnest(ARRAY[p.primary_type, p.secondary_type, p.type_3, p.type_4]) x
    WHERE x IS NOT NULL
  )
  INTO types_b
  FROM public.creator_type_profiles p
  WHERE p.user_id = _b
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF types_a IS NULL OR types_b IS NULL OR array_length(types_a, 1) IS NULL OR array_length(types_b, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO exact_matches
  FROM (
    SELECT unnest(types_a) AS t
    INTERSECT
    SELECT unnest(types_b)
  ) s;

  FOR t_a IN
    SELECT t FROM unnest(types_a) t
    WHERE t <> ALL(types_b)
  LOOP
    SELECT family INTO fam_a FROM public.creator_type_family_map WHERE creator_type = t_a;
    IF fam_a IS NULL OR fam_a = ANY(shared_families) THEN
      CONTINUE;
    END IF;
    FOR t_b IN
      SELECT t FROM unnest(types_b) t
      WHERE t <> ALL(types_a)
    LOOP
      SELECT family INTO fam_b FROM public.creator_type_family_map WHERE creator_type = t_b;
      IF fam_b IS NOT NULL AND fam_a = fam_b THEN
        shared_families := array_append(shared_families, fam_a);
        family_matches := family_matches + 1;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;

  total := (exact_matches * 2) + family_matches;
  IF total > 8 THEN total := 8; END IF;
  IF total < 0 THEN total := 0; END IF;
  RETURN total::smallint;
END;
$$;

REVOKE ALL ON FUNCTION public.compute_match_score(uuid, uuid) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE u uuid;
BEGIN
  FOR u IN
    SELECT p.user_id FROM public.profiles p
    WHERE p.community_visible = true AND p.profile_completed_at IS NOT NULL
  LOOP
    PERFORM public.recompute_match_scores_for_user(u);
  END LOOP;
END $$;