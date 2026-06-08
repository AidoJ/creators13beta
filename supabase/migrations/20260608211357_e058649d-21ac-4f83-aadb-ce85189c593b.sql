
-- ===========================================================================
-- compute_creator_of_the_month: deterministic, no DB writes
-- ===========================================================================
-- TIMEZONE NOTE (Phase 2.1): All date math is in UTC. The 28 March anchor
-- fires at 00:00 UTC, which is ~11:00 AEDT in Sydney. This is an accepted
-- trade-off for Phase 2.1. Per-user timezone-aware "season starts today"
-- behaviour is a Phase 2.3+ concern.
CREATE OR REPLACE FUNCTION public.compute_creator_of_the_month(_for_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  creator_type text,
  cycle_position smallint,
  cycle_started_at date,
  cycle_ends_at date,
  anchor_year int,
  days_since_anchor int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Canonical cycle order from Appendix 6. Interleaves families intentionally.
  -- Do NOT derive from creator_type_family_map — order is hand-designed.
  v_cycle_order text[] := ARRAY[
    'lava','fire','whirlwind','snow','lightning','sun','lake',
    'ocean','tree','mountain','soil','river','sky'
  ];
  v_anchor date;
  v_days_since int;
  v_year_days int;
  v_days_per_type numeric;
  v_position int;
  v_position_zero int;
BEGIN
  -- Anchor: 28 March of the year that "owns" this date. Dates on/after
  -- 28 Mar use this year's anchor; earlier dates use last year's.
  IF _for_date >= make_date(EXTRACT(YEAR FROM _for_date)::int, 3, 28) THEN
    v_anchor := make_date(EXTRACT(YEAR FROM _for_date)::int, 3, 28);
  ELSE
    v_anchor := make_date(EXTRACT(YEAR FROM _for_date)::int - 1, 3, 28);
  END IF;

  v_days_since := _for_date - v_anchor;

  -- We use anchor year's leap status as an approximation. The cycle window
  -- (28 Mar Y → 27 Mar Y+1) actually contains February of Y+1, so Y+1's
  -- leap status is what affects the precise day count. The resulting drift
  -- is sub-day and resets at each annual anchor, so it never compounds.
  -- We choose simplicity over precision here.
  IF (EXTRACT(YEAR FROM v_anchor)::int % 4 = 0
      AND EXTRACT(YEAR FROM v_anchor)::int % 100 <> 0)
     OR EXTRACT(YEAR FROM v_anchor)::int % 400 = 0 THEN
    v_year_days := 366;
  ELSE
    v_year_days := 365;
  END IF;

  v_days_per_type := v_year_days::numeric / 13;

  v_position_zero := FLOOR(v_days_since / v_days_per_type)::int;

  -- If the clamp ever fires, the anchor-selection logic above failed — it
  -- should be impossible because dates >= next anchor re-base to the next
  -- year. Log loudly rather than silently producing wrong values.
  IF v_position_zero < 0 OR v_position_zero > 12 THEN
    RAISE WARNING
      'compute_creator_of_the_month: position % out of range for date % (anchor %, days_since %). Clamping.',
      v_position_zero, _for_date, v_anchor, v_days_since;
    v_position_zero := GREATEST(0, LEAST(12, v_position_zero));
  END IF;

  v_position := v_position_zero + 1;

  RETURN QUERY SELECT
    v_cycle_order[v_position]::text,
    v_position::smallint,
    (v_anchor + (v_position_zero * v_days_per_type)::int)::date,
    (v_anchor + ((v_position_zero + 1) * v_days_per_type)::int)::date,
    EXTRACT(YEAR FROM v_anchor)::int,
    v_days_since;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_creator_of_the_month(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_creator_of_the_month(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_creator_of_the_month(date) TO authenticated;

-- ===========================================================================
-- update_creator_of_the_month: writes today's result into system_settings
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.update_creator_of_the_month()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result record;
  v_new_value jsonb;
  v_existing jsonb;
BEGIN
  SELECT * INTO v_result FROM public.compute_creator_of_the_month(CURRENT_DATE);

  v_new_value := jsonb_build_object(
    'creator_type',    v_result.creator_type,
    'cycle_position',  v_result.cycle_position,
    'cycle_started_at', v_result.cycle_started_at,
    'cycle_ends_at',    v_result.cycle_ends_at,
    'computed_at',      now()
  );

  SELECT value INTO v_existing
    FROM public.system_settings
   WHERE key = 'current_creator_of_the_month';

  UPDATE public.system_settings
     SET value = v_new_value, updated_at = now()
   WHERE key = 'current_creator_of_the_month';

  IF v_existing IS NULL
     OR v_existing->>'creator_type' IS DISTINCT FROM v_result.creator_type THEN
    RAISE NOTICE 'Creator of the Month transitioned: % → %',
      COALESCE(v_existing->>'creator_type', '(initial)'),
      v_result.creator_type;
  END IF;

  RETURN v_new_value;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_creator_of_the_month() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_creator_of_the_month() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_creator_of_the_month() FROM authenticated;

-- ===========================================================================
-- get_creator_of_the_month: dashboard-facing read RPC
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_creator_of_the_month()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.system_settings
   WHERE key = 'current_creator_of_the_month';
$$;

REVOKE EXECUTE ON FUNCTION public.get_creator_of_the_month() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_creator_of_the_month() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_creator_of_the_month() TO authenticated;

-- ===========================================================================
-- Daily cron at 00:05 UTC
-- ===========================================================================
-- Unschedule any prior version to keep migration idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('update-creator-of-the-month-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'update-creator-of-the-month-daily',
  '5 0 * * *',
  $$ SELECT public.update_creator_of_the_month(); $$
);

-- ===========================================================================
-- One-time initial run so stored value reflects today, not the seed.
-- ===========================================================================
SELECT public.update_creator_of_the_month();
