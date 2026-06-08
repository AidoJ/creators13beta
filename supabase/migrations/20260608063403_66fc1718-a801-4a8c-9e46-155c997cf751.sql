-- Document expected member_preferences keys
COMMENT ON COLUMN public.profiles.member_preferences IS
  'Per-member preferences and metadata. Expected keys:
   - accepts_messages: boolean (Batch 2)
   - geocoded_at: timestamptz (Batch 4) — last successful geocode
   - geocoding_failed_at: timestamptz (Batch 4) — last failed attempt
   - geocoding_label: text (Batch 4) — label that was geocoded, for staleness check';

-- Ensure pg_net is available (it is; this is idempotent)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger function: fire-and-forget POST to the geocode-location edge function
CREATE OR REPLACE FUNCTION public.trigger_geocode_on_location_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text := 'https://kbcxvycgwtoxqkbpcesi.supabase.co/functions/v1/geocode-location';
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.location_label IS NOT NULL AND length(trim(NEW.location_label)) > 0)
     OR (TG_OP = 'UPDATE'
         AND NEW.location_label IS DISTINCT FROM OLD.location_label
         AND NEW.location_label IS NOT NULL
         AND length(trim(NEW.location_label)) > 0)
  THEN
    BEGIN
      PERFORM net.http_post(
        url := _url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'user_id', NEW.user_id,
          'location_label', trim(NEW.location_label)
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Geocoding is non-critical; never block a profile write on it.
      RAISE WARNING 'Geocoding trigger failed for user %: %', NEW.user_id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_geocode_on_location_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_geocode_on_location_change() FROM anon, authenticated;

DROP TRIGGER IF EXISTS geocode_on_location_change ON public.profiles;
CREATE TRIGGER geocode_on_location_change
  AFTER INSERT OR UPDATE OF location_label ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trigger_geocode_on_location_change();

-- One-time backfill for existing profiles with a label but no coords.
DO $$
DECLARE
  r record;
  _url text := 'https://kbcxvycgwtoxqkbpcesi.supabase.co/functions/v1/geocode-location';
BEGIN
  FOR r IN
    SELECT user_id, trim(location_label) AS label
    FROM public.profiles
    WHERE location_label IS NOT NULL
      AND length(trim(location_label)) > 0
      AND location_lat IS NULL
  LOOP
    BEGIN
      PERFORM net.http_post(
        url := _url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('user_id', r.user_id, 'location_label', r.label)
      );
      PERFORM pg_sleep(1.5);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Backfill failed for user %: %', r.user_id, SQLERRM;
    END;
  END LOOP;
END $$;