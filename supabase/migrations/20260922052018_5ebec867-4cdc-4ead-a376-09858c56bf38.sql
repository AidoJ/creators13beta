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
    'name', _inv.name,
    'first_name', split_part(COALESCE(_inv.name,''), ' ', 1),
    'practitioner_name', _prac,
    'paid', _inv.paid_at IS NOT NULL,
    'redeemed', _inv.redeemed_at IS NOT NULL
  );
END;
$function$;