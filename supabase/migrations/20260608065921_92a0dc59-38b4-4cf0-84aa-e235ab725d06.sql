
-- =========================================================================
-- 1. creator_type_family_map (Sky deliberately omitted)
-- =========================================================================
CREATE TABLE public.creator_type_family_map (
  creator_type text PRIMARY KEY,
  family       text NOT NULL
);

GRANT SELECT ON public.creator_type_family_map TO authenticated;
GRANT ALL    ON public.creator_type_family_map TO service_role;

ALTER TABLE public.creator_type_family_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family map readable by authenticated"
  ON public.creator_type_family_map FOR SELECT TO authenticated USING (true);

INSERT INTO public.creator_type_family_map (creator_type, family) VALUES
  ('lava','fire'), ('fire','fire'), ('sun','fire'),
  ('whirlwind','air'), ('snow','air'), ('lightning','air'),
  ('lake','water'), ('ocean','water'), ('river','water'),
  ('tree','earth'), ('mountain','earth'), ('soil','earth');
-- 'sky' intentionally absent — Sky members match only via exact Sky-Sky overlap.

-- =========================================================================
-- 2. member_match_scores
-- =========================================================================
CREATE TABLE public.member_match_scores (
  member_a_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_b_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score        smallint NOT NULL CHECK (score BETWEEN 1 AND 8),
  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_a_id, member_b_id),
  CHECK (member_a_id < member_b_id)
);

GRANT ALL ON public.member_match_scores TO service_role;
-- No anon/authenticated grants: clients read only via get_my_top_matches RPC.

ALTER TABLE public.member_match_scores ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_mms_member_a ON public.member_match_scores (member_a_id, score DESC);
CREATE INDEX idx_mms_member_b ON public.member_match_scores (member_b_id, score DESC);

-- =========================================================================
-- 3. compute_match_score(a, b) — 0–8
-- =========================================================================
CREATE OR REPLACE FUNCTION public.compute_match_score(_a uuid, _b uuid)
RETURNS smallint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _types_a text[];
  _types_b text[];
  _fams_a  text[];
  _fams_b  text[];
  _exact   int := 0;
  _fam     int := 0;
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT lower(t) FROM (
      SELECT primary_type AS t FROM public.creator_type_profiles WHERE user_id = _a
      UNION ALL SELECT secondary_type FROM public.creator_type_profiles WHERE user_id = _a
      UNION ALL SELECT type_3 FROM public.creator_type_profiles WHERE user_id = _a
      UNION ALL SELECT type_4 FROM public.creator_type_profiles WHERE user_id = _a
    ) s WHERE t IS NOT NULL
  ) INTO _types_a;

  SELECT ARRAY(
    SELECT DISTINCT lower(t) FROM (
      SELECT primary_type AS t FROM public.creator_type_profiles WHERE user_id = _b
      UNION ALL SELECT secondary_type FROM public.creator_type_profiles WHERE user_id = _b
      UNION ALL SELECT type_3 FROM public.creator_type_profiles WHERE user_id = _b
      UNION ALL SELECT type_4 FROM public.creator_type_profiles WHERE user_id = _b
    ) s WHERE t IS NOT NULL
  ) INTO _types_b;

  IF _types_a IS NULL OR _types_b IS NULL
     OR array_length(_types_a, 1) IS NULL OR array_length(_types_b, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Exact type overlap: ×2 per match (cap 4 → max +8 but families add too so we cap final at 8)
  SELECT count(*)::int INTO _exact
  FROM unnest(_types_a) ta
  WHERE ta = ANY(_types_b);

  -- Family overlap: ×1 per distinct shared family (Sky excluded by map omission)
  SELECT ARRAY(
    SELECT DISTINCT m.family
    FROM unnest(_types_a) t JOIN public.creator_type_family_map m ON m.creator_type = t
  ) INTO _fams_a;
  SELECT ARRAY(
    SELECT DISTINCT m.family
    FROM unnest(_types_b) t JOIN public.creator_type_family_map m ON m.creator_type = t
  ) INTO _fams_b;

  SELECT count(*)::int INTO _fam
  FROM unnest(_fams_a) fa
  WHERE fa = ANY(_fams_b);

  RETURN LEAST(8, (_exact * 2) + _fam)::smallint;
END;
$$;

REVOKE ALL ON FUNCTION public.compute_match_score(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 4. recompute_match_scores_for_user(user_id)
-- =========================================================================
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

  -- Always clear existing pair rows for this user first.
  DELETE FROM public.member_match_scores
   WHERE member_a_id = _user_id OR member_b_id = _user_id;

  SELECT (community_visible AND profile_completed_at IS NOT NULL)
    INTO _is_visible
    FROM public.profiles WHERE user_id = _user_id;

  IF NOT COALESCE(_is_visible, false) THEN
    RETURN;  -- user is hidden / incomplete; no rows to insert
  END IF;

  FOR _other IN
    SELECT user_id FROM public.profiles
     WHERE user_id <> _user_id
       AND community_visible = true
       AND profile_completed_at IS NOT NULL
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

REVOKE ALL ON FUNCTION public.recompute_match_scores_for_user(uuid) FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 5. Triggers
-- =========================================================================
CREATE OR REPLACE FUNCTION public.trigger_recompute_match_on_ct_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_match_scores_for_user(OLD.user_id);
    RETURN OLD;
  END IF;
  PERFORM public.recompute_match_scores_for_user(NEW.user_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_recompute_match_on_ct_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_recompute_match_on_ct_change ON public.creator_type_profiles;
CREATE TRIGGER trg_recompute_match_on_ct_change
AFTER INSERT OR UPDATE OF primary_type, secondary_type, type_3, type_4 OR DELETE
ON public.creator_type_profiles
FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_match_on_ct_change();

CREATE OR REPLACE FUNCTION public.trigger_recompute_match_on_visibility_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.community_visible IS DISTINCT FROM OLD.community_visible THEN
    PERFORM public.recompute_match_scores_for_user(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_recompute_match_on_visibility_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_recompute_match_on_visibility_change ON public.profiles;
CREATE TRIGGER trg_recompute_match_on_visibility_change
AFTER UPDATE OF community_visible ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_match_on_visibility_change();

CREATE OR REPLACE FUNCTION public.trigger_recompute_match_on_profile_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.profile_completed_at IS NULL AND NEW.profile_completed_at IS NOT NULL THEN
    PERFORM public.recompute_match_scores_for_user(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_recompute_match_on_profile_completion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_recompute_match_on_profile_completion ON public.profiles;
CREATE TRIGGER trg_recompute_match_on_profile_completion
AFTER UPDATE OF profile_completed_at ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_match_on_profile_completion();

-- =========================================================================
-- 6. get_my_top_matches RPC
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_my_top_matches(_limit int DEFAULT 20)
RETURNS TABLE (
  user_id             uuid,
  display_name        text,
  avatar_url          text,
  location_label      text,
  tier                subscription_tier,
  score               smallint,
  community_joined_at timestamptz,
  creator_types       jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.get_my_top_matches(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_top_matches(int) TO authenticated;

-- =========================================================================
-- 7. Backfill
-- =========================================================================
DO $$
DECLARE _u uuid;
BEGIN
  FOR _u IN
    SELECT user_id FROM public.profiles
     WHERE community_visible = true AND profile_completed_at IS NOT NULL
  LOOP
    PERFORM public.recompute_match_scores_for_user(_u);
  END LOOP;
END $$;
