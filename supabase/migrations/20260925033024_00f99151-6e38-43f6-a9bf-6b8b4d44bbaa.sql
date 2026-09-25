CREATE OR REPLACE FUNCTION public.send_contact_request(_to_user_id uuid, _reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _open boolean;
  _visible boolean;
  _completed timestamptz;
  _pending_count int;
  _exists int;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_feature(_uid, 'community_message_members') THEN
    RAISE EXCEPTION 'Your membership does not include messaging other members' USING ERRCODE = '42501';
  END IF;
  IF _to_user_id IS NULL OR _to_user_id = _uid THEN
    RAISE EXCEPTION 'invalid target user';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 OR length(_reason) > 500 THEN
    RAISE EXCEPTION 'reason must be 1-500 characters';
  END IF;

  SELECT open_to_contact, community_visible, profile_completed_at
    INTO _open, _visible, _completed
  FROM public.profiles WHERE user_id = _to_user_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'target not found'; END IF;
  IF NOT (COALESCE(_open,false) AND COALESCE(_visible,false) AND _completed IS NOT NULL) THEN
    RAISE EXCEPTION 'this Creator is not accepting connection requests';
  END IF;

  SELECT COUNT(*) INTO _pending_count
  FROM public.contact_requests
  WHERE from_user_id = _uid
    AND status = 'pending'
    AND created_at > now() - interval '24 hours';
  IF _pending_count >= 10 THEN
    RAISE EXCEPTION 'You''ve reached your daily limit of 10 pending connection requests. Wait for some to be approved or declined before sending more.';
  END IF;

  SELECT 1 INTO _exists
  FROM public.contact_requests
  WHERE status IN ('pending','approved')
    AND ((from_user_id = _uid AND to_user_id = _to_user_id)
      OR (from_user_id = _to_user_id AND to_user_id = _uid))
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'an active connection request already exists between you';
  END IF;

  INSERT INTO public.contact_requests (from_user_id, to_user_id, reason)
  VALUES (_uid, _to_user_id, trim(_reason))
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_contact_request(_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _to uuid; _status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_feature(_uid, 'community_message_members') THEN
    RAISE EXCEPTION 'Your membership does not include messaging other members' USING ERRCODE = '42501';
  END IF;
  SELECT to_user_id, status INTO _to, _status FROM public.contact_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF _to <> _uid THEN RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501'; END IF;
  IF _status <> 'pending' THEN RAISE EXCEPTION 'request is not pending'; END IF;
  UPDATE public.contact_requests
    SET status = 'approved', responded_at = now()
   WHERE id = _request_id;
END;
$function$;