CREATE OR REPLACE FUNCTION public.redeem_clinic_invitation(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _inv public.client_invitations%ROWTYPE;
  _already boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  END IF;

  SELECT lower(trim(email)) INTO _email FROM public.profiles WHERE user_id = _uid;

  IF _token IS NULL OR _token = '' THEN
    SELECT * INTO _inv FROM public.client_invitations
     WHERE lower(trim(email)) = _email
       AND kind = 'clinic_profile'
       AND paid_at IS NOT NULL
     ORDER BY (redeemed_at IS NOT NULL), paid_at
     LIMIT 1;
  ELSE
    SELECT * INTO _inv FROM public.client_invitations
     WHERE invite_token = _token
       AND kind = 'clinic_profile'
       AND paid_at IS NOT NULL
     LIMIT 1;
  END IF;

  IF _inv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_paid_invitation');
  END IF;

  IF _email IS NULL OR lower(trim(_inv.email)) <> _email THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  END IF;

  _already := _inv.redeemed_at IS NOT NULL;

  IF _inv.grants_level_key IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.entitlements
        WHERE user_id = _uid AND level_key = _inv.grants_level_key AND status = 'active'
          AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
     )
  THEN
    INSERT INTO public.entitlements (user_id, level_key, source, stripe_ref)
    VALUES (_uid, _inv.grants_level_key, 'code', _inv.stripe_ref);
  END IF;

  INSERT INTO public.client_practitioner (client_id, practitioner_id, active)
  VALUES (_uid, _inv.practitioner_id, true)
  ON CONFLICT DO NOTHING;

  -- Give the client a plan record so the enrolment sequence can place them on
  -- the details step (the practitioner has already paid for the profiling).
  IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = _uid) THEN
    INSERT INTO public.subscriptions (user_id, tier, status, billing_period, signup_path)
    VALUES (_uid, 'wren', 'active', 'monthly', 'clinic');
  END IF;

  UPDATE public.client_invitations
     SET redeemed_at = COALESCE(redeemed_at, now()),
         status = CASE WHEN status IN ('pending','link_clicked','account_created') THEN 'photos_pending' ELSE status END
   WHERE id = _inv.id;

  RETURN jsonb_build_object('ok', true, 'already', _already,
                            'practitioner_id', _inv.practitioner_id,
                            'invitation_id', _inv.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.lookup_clinic_invitation(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _inv public.client_invitations%ROWTYPE;
  _prac text;
BEGIN
  IF _token IS NULL OR _token = '' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT * INTO _inv FROM public.client_invitations
   WHERE invite_token = _token AND kind = 'clinic_profile'
   LIMIT 1;

  IF _inv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT COALESCE(NULLIF(trim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ''), 'your practitioner')
    INTO _prac
    FROM public.profiles p WHERE p.user_id = _inv.practitioner_id;

  RETURN jsonb_build_object(
    'ok', true,
    'email', _inv.email,
    'first_name', _inv.first_name,
    'practitioner_name', _prac,
    'paid', _inv.paid_at IS NOT NULL,
    'redeemed', _inv.redeemed_at IS NOT NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.lookup_clinic_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_clinic_invitation(text) TO anon, authenticated, service_role;