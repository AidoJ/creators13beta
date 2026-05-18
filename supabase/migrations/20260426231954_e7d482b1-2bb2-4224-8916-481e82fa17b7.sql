-- 1. Trigger function: sync approved case study creator types -> client creator_type_profiles
CREATE OR REPLACE FUNCTION public.sync_case_study_creator_types()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _types text[];
  _primary text;
  _secondary text;
  _type_3 text;
  _type_4 text;
BEGIN
  -- Only sync when status is approved, subject exists, and types are present
  IF NEW.status = 'approved'
     AND NEW.subject_user_id IS NOT NULL
     AND NEW.creator_types_identified IS NOT NULL
     AND array_length(NEW.creator_types_identified, 1) > 0 THEN

    -- Lowercase + dedupe (preserve order)
    SELECT array_agg(DISTINCT lower(t) ORDER BY lower(t))
    INTO _types
    FROM unnest(NEW.creator_types_identified) AS t;

    -- Re-fetch in original order, lowercased, deduped
    WITH ordered AS (
      SELECT lower(t) AS t, ord
      FROM unnest(NEW.creator_types_identified) WITH ORDINALITY AS u(t, ord)
    ), deduped AS (
      SELECT DISTINCT ON (t) t, ord FROM ordered ORDER BY t, ord
    )
    SELECT array_agg(t ORDER BY ord) INTO _types FROM deduped;

    _primary   := _types[1];
    _secondary := _types[2];
    _type_3    := _types[3];
    _type_4    := _types[4];

    INSERT INTO public.creator_type_profiles
      (user_id, primary_type, secondary_type, type_3, type_4, profiled_by, profiled_at, profiling_data)
    VALUES
      (NEW.subject_user_id, _primary, _secondary, _type_3, _type_4,
       COALESCE(NEW.reviewed_by, NEW.practitioner_id),
       COALESCE(NEW.reviewed_at, now()),
       jsonb_build_object('source', 'case_study', 'case_study_id', NEW.id))
    ON CONFLICT (user_id) DO UPDATE
      SET primary_type   = EXCLUDED.primary_type,
          secondary_type = EXCLUDED.secondary_type,
          type_3         = EXCLUDED.type_3,
          type_4         = EXCLUDED.type_4,
          profiled_by    = COALESCE(EXCLUDED.profiled_by, public.creator_type_profiles.profiled_by),
          profiled_at    = COALESCE(EXCLUDED.profiled_at, public.creator_type_profiles.profiled_at),
          profiling_data = COALESCE(public.creator_type_profiles.profiling_data, '{}'::jsonb)
                           || jsonb_build_object('source', 'case_study', 'case_study_id', NEW.id),
          updated_at     = now();
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure unique constraint on user_id (required for ON CONFLICT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_type_profiles_user_id_key'
  ) THEN
    ALTER TABLE public.creator_type_profiles
      ADD CONSTRAINT creator_type_profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 2. Attach trigger to case_studies (insert + update)
DROP TRIGGER IF EXISTS trg_sync_case_study_creator_types ON public.case_studies;
CREATE TRIGGER trg_sync_case_study_creator_types
AFTER INSERT OR UPDATE OF status, creator_types_identified, subject_user_id
ON public.case_studies
FOR EACH ROW
EXECUTE FUNCTION public.sync_case_study_creator_types();

-- 3. Backfill: re-trigger sync for all already-approved case studies missing a profile
UPDATE public.case_studies
SET updated_at = now()
WHERE status = 'approved'
  AND subject_user_id IS NOT NULL
  AND creator_types_identified IS NOT NULL
  AND array_length(creator_types_identified, 1) > 0;