CREATE OR REPLACE FUNCTION public.lookup_clinic_invitation(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
  prac_name text;
  has_acct boolean;
BEGIN
  SELECT * INTO inv FROM public.client_invitations
   WHERE invite_token = _token AND kind = 'clinic_profile'
   LIMIT 1;
  IF inv IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT coalesce(nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''), 'your practitioner')
    INTO prac_name
    FROM public.profiles p WHERE p.user_id = inv.practitioner_id;

  SELECT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(inv.email)) INTO has_acct;

  RETURN jsonb_build_object(
    'ok', true,
    'email', inv.email,
    'name', inv.name,
    'first_name', split_part(coalesce(inv.name,''), ' ', 1),
    'practitioner_name', coalesce(prac_name, 'your practitioner'),
    'paid', inv.paid_at IS NOT NULL,
    'redeemed', inv.redeemed_at IS NOT NULL,
    'has_account', coalesce(has_acct, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_clinic_invitation(text) TO anon, authenticated, service_role;