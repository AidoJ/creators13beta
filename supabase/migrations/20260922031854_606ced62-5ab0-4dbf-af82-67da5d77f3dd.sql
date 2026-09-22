ALTER TABLE public.access_levels
  ADD COLUMN subscription_tier public.subscription_tier UNIQUE;

UPDATE public.access_levels SET subscription_tier = 'wren'    WHERE key = 'free';
UPDATE public.access_levels SET subscription_tier = 'robin'   WHERE key = 'creator';
UPDATE public.access_levels SET subscription_tier = 'cockatoo' WHERE key = 'co_creator';
UPDATE public.access_levels SET subscription_tier = 'owl'     WHERE key = 'owl';

CREATE OR REPLACE FUNCTION public.tcta_sync_level_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.level_key IS NULL AND NEW.tier IS NOT NULL THEN
    SELECT key INTO NEW.level_key
      FROM public.access_levels
      WHERE subscription_tier = NEW.tier;
  END IF;
  RETURN NEW;
END;
$function$;