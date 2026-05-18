-- Trigger function: when a profile is created (signup), mark any pending invitation
-- with the same email as 'account_created'. Does not override later statuses
-- like 'photos_pending' or 'accepted'.
CREATE OR REPLACE FUNCTION public.mark_invitation_account_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    UPDATE public.client_invitations
    SET status = 'account_created'
    WHERE lower(trim(email)) = lower(trim(NEW.email))
      AND status IN ('pending', 'link_clicked');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_invitation_account_created ON public.profiles;
CREATE TRIGGER trg_mark_invitation_account_created
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.mark_invitation_account_created();

-- Backfill: any existing pending/link_clicked invitation whose email matches
-- a profile (i.e. the person already signed up) should be 'account_created'.
UPDATE public.client_invitations ci
SET status = 'account_created'
WHERE ci.status IN ('pending', 'link_clicked')
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE lower(trim(p.email)) = lower(trim(ci.email))
  );