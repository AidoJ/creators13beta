CREATE OR REPLACE FUNCTION public.accept_game_invite(_token text, _guest_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _match_id uuid;
  _host_id uuid;
  _existing_guest uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join a match';
  END IF;

  SELECT id, host_user_id, guest_user_id
  INTO _match_id, _host_id, _existing_guest
  FROM public.game_matches
  WHERE invite_token = _token
  LIMIT 1;

  IF _match_id IS NULL THEN
    RAISE EXCEPTION 'Invite is invalid';
  END IF;

  IF _host_id = auth.uid() THEN
    RAISE EXCEPTION 'You are signed in as the host of this match. Send this link to your friend, or sign out and use a different account to test joining.';
  END IF;

  IF _existing_guest IS NOT NULL AND _existing_guest <> auth.uid() THEN
    RAISE EXCEPTION 'This invite has already been accepted by someone else';
  END IF;

  UPDATE public.game_matches
  SET guest_user_id = auth.uid(),
      guest_name = COALESCE(NULLIF(_guest_name, ''), 'Guest'),
      status = 'active',
      updated_at = now()
  WHERE id = _match_id;

  RETURN _match_id;
END;
$function$;