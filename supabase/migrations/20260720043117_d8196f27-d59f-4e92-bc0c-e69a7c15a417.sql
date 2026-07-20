
-- Central helper: bump activity for a user id.
CREATE OR REPLACE FUNCTION public._bump_enrollment_activity(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  UPDATE public.profiles
     SET last_enrollment_activity_at = now()
   WHERE user_id = _user_id;
END;
$$;

-- profiling_photos: any insert
CREATE OR REPLACE FUNCTION public.trg_photos_bump_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._bump_enrollment_activity(NEW.user_id); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_photos_bump_activity ON public.profiling_photos;
CREATE TRIGGER trg_photos_bump_activity
  AFTER INSERT ON public.profiling_photos
  FOR EACH ROW EXECUTE FUNCTION public.trg_photos_bump_activity();

-- bookings: any insert (client-side)
CREATE OR REPLACE FUNCTION public.trg_bookings_bump_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._bump_enrollment_activity(NEW.client_id); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_bookings_bump_activity ON public.bookings;
CREATE TRIGGER trg_bookings_bump_activity
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.trg_bookings_bump_activity();

-- client_practitioner: any insert
CREATE OR REPLACE FUNCTION public.trg_cp_bump_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._bump_enrollment_activity(NEW.client_id); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_cp_bump_activity ON public.client_practitioner;
CREATE TRIGGER trg_cp_bump_activity
  AFTER INSERT ON public.client_practitioner
  FOR EACH ROW EXECUTE FUNCTION public.trg_cp_bump_activity();

-- subscriptions: insert OR when tier/signup_path changes forward
CREATE OR REPLACE FUNCTION public.trg_subs_bump_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._bump_enrollment_activity(NEW.user_id);
  ELSIF TG_OP = 'UPDATE'
      AND (NEW.tier IS DISTINCT FROM OLD.tier
           OR NEW.signup_path IS DISTINCT FROM OLD.signup_path
           OR NEW.status IS DISTINCT FROM OLD.status) THEN
    PERFORM public._bump_enrollment_activity(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_subs_bump_activity ON public.subscriptions;
CREATE TRIGGER trg_subs_bump_activity
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.trg_subs_bump_activity();

-- profiles: when details or consent get written by the user
-- (does NOT include reached_checkout_at, since that flag would otherwise
--  cause the activity bump to immediately null itself in a loop)
CREATE OR REPLACE FUNCTION public.trg_profile_details_bump_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.first_name IS DISTINCT FROM OLD.first_name
      OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
      OR NEW.gender IS DISTINCT FROM OLD.gender
      OR NEW.height_cm IS DISTINCT FROM OLD.height_cm
      OR NEW.case_study_consent_at IS DISTINCT FROM OLD.case_study_consent_at)
     AND (NEW.first_name IS NOT NULL OR NEW.case_study_consent_at IS NOT NULL) THEN
    -- Update in a separate statement to avoid recursing on this trigger.
    -- The BEFORE UPDATE trigger on last_enrollment_activity_at handles episode closure.
    NEW.last_enrollment_activity_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profile_details_bump_activity ON public.profiles;
CREATE TRIGGER trg_profile_details_bump_activity
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profile_details_bump_activity();
